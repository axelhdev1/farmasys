import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InventarioFisicoService } from './inventario-fisico.service';
import { GuardarConteosDto } from './dto/guardar-conteos.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { verificarSucursal } from '../auth/scope-sucursal.util';

/**
 * Conteo físico de inventario.
 *
 * AISLAMIENTO ENTRE BOTICAS: cerrar un conteo APLICA ajustes al stock, así que
 * este módulo puede alterar el inventario de una sede. Sin validar el alcance,
 * un almacenero de Central podía abrir, contar y cerrar un conteo de Norte por
 * API y corromper su stock. Cada endpoint verifica la sucursal; los que reciben
 * el id del conteo la resuelven primero.
 */
@ApiTags('inventario-fisico')
@ApiBearerAuth('access-token')
@Controller('inventario-fisico')
export class InventarioFisicoController {
  constructor(private readonly svc: InventarioFisicoService) {}

  /** Resuelve la sucursal de un conteo y valida que el usuario pueda tocarla. */
  private async scopePorConteo(user: JwtPayload, conteoId: string): Promise<void> {
    const conteo = await this.svc.obtener(conteoId);
    verificarSucursal(user, conteo.sucursalId, 'los conteos');
  }

  @Get('actual/:sucursalId')
  @ApiOperation({ summary: 'Sesión de conteo EN_PROCESO de la sucursal (o null)' })
  actual(@Param('sucursalId') sucursalId: string, @CurrentUser() user: JwtPayload) {
    verificarSucursal(user, sucursalId, 'los conteos');
    return this.svc.actual(sucursalId);
  }

  @Get('historial/:sucursalId')
  @ApiOperation({ summary: 'Conteos cerrados con resumen de diferencias' })
  historial(@Param('sucursalId') sucursalId: string, @CurrentUser() user: JwtPayload) {
    verificarSucursal(user, sucursalId, 'los conteos');
    return this.svc.historial(sucursalId);
  }

  @Get('detalle/:id')
  @ApiOperation({ summary: 'Acta de un conteo: detalle lote por lote' })
  async obtener(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.scopePorConteo(user, id);
    return this.svc.obtener(id);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ALMACENERO')
  @Post('abrir/:sucursalId')
  @ApiOperation({ summary: 'Abrir conteo (foto del stock por lote)' })
  abrir(@Param('sucursalId') sucursalId: string, @CurrentUser() user: JwtPayload) {
    verificarSucursal(user, sucursalId, 'los conteos');
    return this.svc.abrir(sucursalId, user.sub);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ALMACENERO')
  @Patch(':id/conteos')
  @ApiOperation({ summary: 'Guardar cantidades contadas' })
  async guardar(
    @Param('id') id: string,
    @Body() dto: GuardarConteosDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.scopePorConteo(user, id);
    return this.svc.guardar(id, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ALMACENERO')
  @Post(':id/cerrar')
  @ApiOperation({ summary: 'Cerrar conteo y ajustar stock (lote por lote)' })
  async cerrar(
    @Param('id') id: string,
    @Body() body: { observacion?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    // El más sensible: aquí se escriben los ajustes al stock real.
    await this.scopePorConteo(user, id);
    return this.svc.cerrar(id, body?.observacion, user.sub);
  }
}
