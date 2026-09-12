/**
 * FarmaSys — Sistema de gestión para cadena de boticas
 * Copyright (c) 2026 Axel Huatuco Bravo <axelhdev@gmail.com>
 * Todos los derechos reservados. Código propietario — ver LICENSE.
 *
 * Publicado para lectura y evaluación profesional. Prohibido el uso comercial,
 * la redistribución y las obras derivadas sin autorización escrita.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { ReportesService } from '../reportes/reportes.service';
import { CacheIaService } from './cache-ia.service';
import { sanearAnalisis } from './sanear';
import {
  ANALIZADOR_IA,
  AnalisisIA,
  AnalizadorIA,
  FilaReposicionIA,
} from './analizador-ia.interface';

/**
 * Orquestador del módulo de IA.
 *
 * El reparto de responsabilidades es la decisión de diseño importante:
 *
 *   ReportesService.reposicion()  → LOS NÚMEROS. Velocidad de venta, días de
 *                                    cobertura y cantidad sugerida salen de la
 *                                    base de datos, con la misma fórmula que ya
 *                                    usa la pantalla de Reposición.
 *   AnalizadorIA                  → EL TEXTO. Agrupa, prioriza y explica esa
 *                                    tabla. No toca una sola cifra.
 *
 * Si el modelo no está configurado, falla o tarda, el endpoint DEVUELVE LA
 * TABLA IGUAL, con `analisis: null` y el motivo. Nunca un 500: el encargado de
 * almacén tiene que poder hacer su pedido aunque Google esté caído.
 */

/** Fila tal cual la produce el módulo de Reposición (fuente de verdad). */
type FilaReposicion = Awaited<ReturnType<ReportesService['reposicion']>>[number];

/** Tope de filas que se le mandan al modelo. Las más urgentes van primero. */
const MAX_FILAS_AL_MODELO = 40;
/** 15 minutos: suficiente para los F5 de una mañana, corto para no dar datos viejos. */
const TTL_CACHE_SEG = 900;

export type MotivoDegradacion = 'SIN_API_KEY' | 'SIN_DATOS' | 'ERROR_PROVEEDOR';

export interface EstadoRespuestaIA {
  /** ¿Se pudo generar análisis en esta respuesta? */
  disponible: boolean;
  modelo: string;
  enCache: boolean;
  motivo?: MotivoDegradacion;
  detalle?: string;
}

export interface RespuestaReposicionIA {
  sucursalId: string;
  dias: number;
  objetivo: number;
  /** Productos que el sistema marcó para reponer. */
  totalProductos: number;
  /** Cuántos de ellos se le enviaron al modelo (los más urgentes). */
  analizados: number;
  /** La tabla completa. Siempre viene, haya IA o no. */
  filas: FilaReposicion[];
  analisis: AnalisisIA | null;
  ia: EstadoRespuestaIA;
}

@Injectable()
export class IaService {
  private readonly logger = new Logger(IaService.name);

  constructor(
    private readonly reportes: ReportesService,
    private readonly cache: CacheIaService,
    @Inject(ANALIZADOR_IA) private readonly analizador: AnalizadorIA,
  ) {}

  /** Diagnóstico del módulo. No expone la clave, solo si está puesta. */
  estado(): { proveedor: string; claveConfigurada: boolean; cacheConfigurada: boolean } {
    return {
      proveedor: this.analizador.nombre,
      claveConfigurada: this.analizador.disponible(),
      cacheConfigurada: this.cache.configurado,
    };
  }

  async analizarReposicion(
    sucursalId: string,
    dias: number,
    objetivo: number,
  ): Promise<RespuestaReposicionIA> {
    const filas = await this.reportes.reposicion(sucursalId, dias, objetivo);

    const base: RespuestaReposicionIA = {
      sucursalId,
      dias,
      objetivo,
      totalProductos: filas.length,
      analizados: 0,
      filas,
      analisis: null,
      ia: { disponible: false, modelo: this.analizador.nombre, enCache: false },
    };

    if (filas.length === 0) {
      return { ...base, ia: { ...base.ia, motivo: 'SIN_DATOS', detalle: 'No hay productos que reponer en esta sucursal.' } };
    }

    const seleccionadas = filas.slice(0, MAX_FILAS_AL_MODELO);
    const compactas = this.compactar(seleccionadas);
    const codigosValidos = new Set(compactas.map((f) => f.codigo));
    const clave = this.clave(sucursalId, dias, objetivo, compactas);

    // ── 1. Caché ────────────────────────────────────────────────────────────
    const cacheado = await this.cache.leer<AnalisisIA>(clave);
    if (cacheado) {
      return {
        ...base,
        analizados: compactas.length,
        analisis: cacheado,
        ia: { ...base.ia, disponible: true, enCache: true },
      };
    }

    // ── 2. ¿Hay proveedor? ──────────────────────────────────────────────────
    if (!this.analizador.disponible()) {
      return {
        ...base,
        analizados: compactas.length,
        ia: {
          ...base.ia,
          motivo: 'SIN_API_KEY',
          detalle: 'Falta GEMINI_API_KEY en el backend. La tabla de reposición se devuelve igual.',
        },
      };
    }

    // ── 3. Llamada al modelo, con degradación ───────────────────────────────
    try {
      const crudo = await this.analizador.analizarReposicion({
        dias,
        objetivo,
        filas: compactas,
      });

      // El modelo es entrada NO confiable: se valida contra la tabla real.
      const { analisis, descartados } = sanearAnalisis(crudo, codigosValidos);
      if (descartados > 0) {
        this.logger.warn(`El modelo citó ${descartados} código(s) inexistentes; se descartaron.`);
      }

      await this.cache.guardar(clave, analisis, TTL_CACHE_SEG);

      return {
        ...base,
        analizados: compactas.length,
        analisis,
        ia: { ...base.ia, disponible: true, enCache: false },
      };
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      this.logger.error(`Análisis de IA no disponible: ${detalle}`);
      // Saturación del proveedor: se distingue porque el usuario SÍ puede
      // reintentar con éxito en un minuto, a diferencia de un fallo real.
      const saturado = /50[234]|429|high demand|overloaded/i.test(detalle);
      return {
        ...base,
        analizados: compactas.length,
        ia: {
          ...base.ia,
          motivo: 'ERROR_PROVEEDOR',
          detalle: saturado
            ? 'El proveedor de IA está saturado ahora mismo. Inténtalo de nuevo en un minuto; la tabla de reposición ya está lista.'
            : 'El proveedor de IA no respondió. La tabla de reposición se devuelve igual.',
        },
      };
    }
  }

  /** Pasa las filas del reporte al formato mínimo que ve el modelo. */
  private compactar(filas: FilaReposicion[]): FilaReposicionIA[] {
    return filas
      .map((f) => ({
        codigo: f.producto?.codigo ?? '',
        nombre: f.producto?.nombre ?? 'Sin nombre',
        stockActual: f.stockActual,
        stockMinimo: f.stockMinimo,
        vendidoPeriodo: f.vendidoPeriodo,
        velocidadDia: f.velocidadDia,
        diasCobertura: f.diasCobertura,
        sugerido: f.sugerido,
      }))
      .filter((f) => f.codigo.length > 0);
  }

  /**
   * Clave de caché = parámetros + HUELLA DE LOS DATOS. Si cambia el stock o la
   * venta de cualquier producto de la lista, cambia el hash y el análisis se
   * regenera; no hace falta invalidar nada a mano desde ventas ni compras.
   */
  private clave(sucursalId: string, dias: number, objetivo: number, filas: FilaReposicionIA[]): string {
    const huella = createHash('sha1')
      .update(filas.map((f) => `${f.codigo}:${f.stockActual}:${f.vendidoPeriodo}:${f.sugerido}`).join('|'))
      .digest('hex')
      .slice(0, 16);
    return `ia:reposicion:${sucursalId}:${dias}:${objetivo}:${huella}`;
  }
}
