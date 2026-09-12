/**
 * FarmaSys — Sistema de gestión para cadena de boticas
 * Copyright (c) 2026 Axel Huatuco Bravo <axelhdev@gmail.com>
 * Todos los derechos reservados. Código propietario — ver LICENSE.
 *
 * Publicado para lectura y evaluación profesional. Prohibido el uso comercial,
 * la redistribución y las obras derivadas sin autorización escrita.
 */
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IaService } from './ia.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { verificarSucursal } from '../auth/scope-sucursal.util';
import { PermisoModulo, PermisoModuloGuard } from './guards/permiso-modulo.guard';

/**
 * Endpoints de IA. Todo lo que toca la clave de Gemini vive aquí, en el
 * backend: el frontend llama a estas rutas, nunca a Google.
 *
 * El scoping por sucursal es el MISMO que el de la tabla que resume
 * (`GET reportes/reposicion/:sucursalId`): un almacenero solo puede pedir el
 * análisis de SU botica. Sin esto, la IA sería un rodeo para leer datos de
 * otra sede.
 */
@ApiTags('ia')
@ApiBearerAuth('access-token')
@Controller('ia')
@UseGuards(ThrottlerGuard, PermisoModuloGuard)
export class IaController {
  constructor(private readonly ia: IaService) {}

  /**
   * Diagnóstico: dice si la clave y la caché están configuradas. NO devuelve la
   * clave ni ningún fragmento de ella.
   */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('estado')
  @ApiOperation({ summary: 'Estado del módulo de IA (proveedor, clave configurada, caché)' })
  estado() {
    return this.ia.estado();
  }

  /**
   * Plan de compra: la tabla de reposición agrupada y explicada por el modelo.
   *
   * Límite de 6 llamadas por minuto: cada una consume cuota del tier gratuito.
   * La caché absorbe los F5, esto frena el abuso.
   */
  @Roles('SUPER_ADMIN', 'ADMIN', 'ALMACENERO')
  @PermisoModulo('reposicion')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Get('reposicion/:sucursalId')
  @ApiOperation({
    summary: 'Analiza con IA la sugerencia de reposición (los números los calcula el sistema)',
  })
  @ApiQuery({ name: 'dias', required: false, description: 'Ventana de análisis, 7–90 (default 30)' })
  @ApiQuery({ name: 'objetivo', required: false, description: 'Días de cobertura objetivo, 7–90 (default 30)' })
  reposicion(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('dias') dias?: string,
    @Query('objetivo') objetivo?: string,
  ) {
    verificarSucursal(user, sucursalId, 'los reportes');
    return this.ia.analizarReposicion(
      sucursalId,
      acotar(dias, 30),
      acotar(objetivo, 30),
    );
  }
}

/** Query param numérico acotado a 7–90 días. Un valor raro no rompe nada. */
function acotar(valor: string | undefined, porDefecto: number): number {
  const numero = Number(valor);
  if (!valor || !Number.isFinite(numero)) return porDefecto;
  return Math.min(90, Math.max(7, Math.round(numero)));
}
