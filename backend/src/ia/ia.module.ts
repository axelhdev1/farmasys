/**
 * FarmaSys — Sistema de gestión para cadena de boticas
 * Copyright (c) 2026 Axel Huatuco Bravo <axelhdev@gmail.com>
 * Todos los derechos reservados. Código propietario — ver LICENSE.
 *
 * Publicado para lectura y evaluación profesional. Prohibido el uso comercial,
 * la redistribución y las obras derivadas sin autorización escrita.
 */
import { Module } from '@nestjs/common';
import { ReportesModule } from '../reportes/reportes.module';
import { IaController } from './ia.controller';
import { IaService } from './ia.service';
import { GeminiService } from './gemini.service';
import { CacheIaService } from './cache-ia.service';
import { ANALIZADOR_IA } from './analizador-ia.interface';

/**
 * Módulo de IA — completamente ADITIVO: no modifica ventas, caja ni inventario.
 * Reutiliza `ReportesService` (que ya exporta ReportesModule) como fuente de
 * los números.
 *
 * CAMBIAR DE PROVEEDOR es cambiar la clase de esta única línea:
 *   { provide: ANALIZADOR_IA, useExisting: GeminiService }
 * por un ClaudeService o un OllamaService que implemente `AnalizadorIA`.
 */
@Module({
  imports: [ReportesModule],
  controllers: [IaController],
  providers: [
    IaService,
    CacheIaService,
    GeminiService,
    { provide: ANALIZADOR_IA, useExisting: GeminiService },
  ],
  exports: [IaService],
})
export class IaModule {}
