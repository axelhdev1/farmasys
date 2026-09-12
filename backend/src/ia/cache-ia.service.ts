/**
 * FarmaSys — Sistema de gestión para cadena de boticas
 * Copyright (c) 2026 Axel Huatuco Bravo <axelhdev@gmail.com>
 * Todos los derechos reservados. Código propietario — ver LICENSE.
 *
 * Publicado para lectura y evaluación profesional. Prohibido el uso comercial,
 * la redistribución y las obras derivadas sin autorización escrita.
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Caché del análisis de IA sobre Redis.
 *
 * POR QUÉ: el tier gratuito de Gemini tiene tope diario de peticiones y cada
 * llamada tarda segundos. La tabla de reposición de una botica no cambia entre
 * un F5 y el siguiente: cachear 15 minutos convierte tres clics en una sola
 * llamada al modelo. La clave incluye una huella de los datos, así que en
 * cuanto cambia el stock el análisis se recalcula solo (ver `ia.service.ts`).
 *
 * Redis ya estaba levantado en docker-compose y no lo usaba nadie.
 *
 * DEGRADACIÓN: si Redis no está, el módulo NO se cae. Se registra un aviso una
 * vez y todo sigue funcionando sin caché. Una caché que tumba la aplicación
 * cuando falla es peor que no tener caché.
 */
@Injectable()
export class CacheIaService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheIaService.name);
  private readonly cliente: Redis | null = null;
  private avisado = false;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('REDIS_URL no definido: el análisis de IA funcionará sin caché.');
      return;
    }

    this.cliente = new Redis(url, {
      // Fallar rápido: antes morir sin caché que dejar la petición colgada.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2_000,
      retryStrategy: (intentos: number) => Math.min(intentos * 1_000, 10_000),
    });

    this.cliente.on('error', (error: Error) => {
      if (this.avisado) return;
      this.avisado = true;
      this.logger.warn(`Redis no disponible (${error.message}). La IA sigue funcionando sin caché.`);
    });
    this.cliente.on('ready', () => {
      this.avisado = false;
    });
  }

  /** ¿Hay cliente configurado? (no garantiza que Redis esté vivo ahora mismo) */
  get configurado(): boolean {
    return this.cliente !== null;
  }

  async leer<T>(clave: string): Promise<T | null> {
    if (!this.cliente) return null;
    try {
      const valor = await this.cliente.get(clave);
      return valor ? (JSON.parse(valor) as T) : null;
    } catch {
      return null;
    }
  }

  async guardar(clave: string, valor: unknown, ttlSegundos: number): Promise<void> {
    if (!this.cliente) return;
    try {
      await this.cliente.set(clave, JSON.stringify(valor), 'EX', ttlSegundos);
    } catch {
      // Sin caché se vive. Sin endpoint, no.
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.cliente?.quit();
    } catch {
      // Cierre best-effort.
    }
  }
}
