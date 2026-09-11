import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CajaService } from './caja.service';
import { AbrirCajaDto } from './dto/abrir-caja.dto';
import { MovimientoCajaDto } from './dto/movimiento-caja.dto';
import { CerrarCajaDto } from './dto/cerrar-caja.dto';
import { CrearTerminalDto, ActualizarTerminalDto } from './dto/terminal.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/auth.types';
import { esAdmin, sucursalEfectiva, verificarSucursal } from '../auth/scope-sucursal.util';

@ApiTags('caja')
@ApiBearerAuth('access-token')
@Controller('caja')
export class CajaController {
  constructor(private readonly caja: CajaService) {}

  /**
   * La caja mueve dinero: un no-admin solo puede tocar sesiones de SU sucursal.
   * Para las rutas por :id se resuelve la sesión primero y se valida.
   */
  private async scopePorCaja(user: JwtPayload, cajaId: string): Promise<void> {
    const sesion = await this.caja.obtenerSesion(cajaId);
    // El DUEÑO de la caja siempre puede operarla, aunque hoy esté asignado a
    // otra sucursal. Si no, un cajero reasignado quedaría atrapado: no podría
    // cerrar su caja vieja (scope) ni abrir una nueva (una abierta a la vez).
    if (sesion.cajeroId === user.sub) return;
    verificarSucursal(user, sesion.sucursalId, 'la caja');
  }

  @Post('abrir')
  @ApiOperation({ summary: 'Abrir caja (1 abierta por cajero+sucursal)' })
  abrir(@Body() dto: AbrirCajaDto, @CurrentUser() user: JwtPayload) {
    verificarSucursal(user, dto.sucursalId, 'la caja');
    return this.caja.abrir(dto, user.sub);
  }

  // ── Terminales (cajones físicos) ──────────────────────────────────────

  @Get('terminales')
  @ApiOperation({ summary: 'Terminales de la sucursal con ocupación y último cierre' })
  @ApiQuery({ name: 'sucursalId', required: true })
  terminales(@Query('sucursalId') sucursalId: string, @CurrentUser() user: JwtPayload) {
    verificarSucursal(user, sucursalId, 'los terminales');
    return this.caja.terminalesDeSucursal(sucursalId);
  }

  @Get('ultimo-cierre')
  @ApiOperation({ summary: 'Último cierre de un terminal (relevo de turno)' })
  @ApiQuery({ name: 'sucursalId', required: true })
  @ApiQuery({ name: 'terminal', required: true })
  ultimoCierre(
    @Query('sucursalId') sucursalId: string,
    @Query('terminal') terminal: string,
    @CurrentUser() user: JwtPayload,
  ) {
    verificarSucursal(user, sucursalId, 'los terminales');
    return this.caja.ultimoCierreDeTerminal(sucursalId, terminal);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('terminales')
  @ApiOperation({ summary: 'Crear terminal en una sucursal (solo ADMIN)' })
  crearTerminal(@Body() dto: CrearTerminalDto, @CurrentUser() user: JwtPayload) {
    verificarSucursal(user, dto.sucursalId, 'los terminales');
    return this.caja.crearTerminal(dto.sucursalId, dto.nombre);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('terminales/:id')
  @ApiOperation({ summary: 'Renombrar o activar/desactivar un terminal (solo ADMIN)' })
  actualizarTerminal(@Param('id') id: string, @Body() dto: ActualizarTerminalDto) {
    return this.caja.actualizarTerminal(id, dto);
  }

  @Get('mi-abierta')
  @ApiOperation({
    summary: 'Mi caja abierta en CUALQUIER sucursal (para poder cerrarla si quedó en otra)',
  })
  miCajaAbierta(@CurrentUser() user: JwtPayload) {
    return this.caja.miCajaAbierta(user.sub);
  }

  @Get('abierta')
  @ApiOperation({ summary: 'Obtener mi caja abierta en una sucursal' })
  @ApiQuery({ name: 'sucursalId', required: true })
  abierta(@Query('sucursalId') sucursalId: string, @CurrentUser() user: JwtPayload) {
    verificarSucursal(user, sucursalId, 'la caja');
    return this.caja.cajaAbierta(user.sub, sucursalId);
  }

  @Get(':id/resumen')
  @ApiOperation({ summary: 'Resumen vivo / arqueo de la caja' })
  async resumen(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.scopePorCaja(user, id);
    return this.caja.resumen(id);
  }

  @Get(':id/reporte-z')
  @ApiOperation({ summary: 'Reporte de cierre Z imprimible' })
  async reporteZ(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.scopePorCaja(user, id);
    return this.caja.reporteZ(id);
  }

  @Post(':id/movimientos')
  @ApiOperation({ summary: 'Registrar movimiento de caja (INGRESO/EGRESO)' })
  async registrarMovimiento(
    @Param('id') id: string,
    @Body() dto: MovimientoCajaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.scopePorCaja(user, id);
    // La autoría sale del JWT: un egreso siempre tiene responsable.
    return this.caja.registrarMovimiento(id, dto, user.sub);
  }

  @Patch(':id/cerrar')
  @ApiOperation({ summary: 'Cerrar caja con arqueo de efectivo' })
  async cerrar(
    @Param('id') id: string,
    @Body() dto: CerrarCajaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.scopePorCaja(user, id);
    // Un cajero solo cierra SU caja; un ADMIN puede forzar el cierre de una
    // caja olvidada (queda registrado en cerradaPorId).
    const sesion = await this.caja.obtenerSesion(id);
    if (sesion.cajeroId !== user.sub && !esAdmin(user)) {
      throw new ForbiddenException('Solo puedes cerrar tu propia caja');
    }
    return this.caja.cerrar(id, dto, user.sub);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('del-dia')
  @ApiOperation({
    summary: 'Cajas de hoy + TODAS las abiertas (incluye huérfanas de días anteriores)',
  })
  @ApiQuery({ name: 'sucursalId', required: true })
  cajasDelDia(@Query('sucursalId') sucursalId: string, @CurrentUser() user: JwtPayload) {
    verificarSucursal(user, sucursalId, 'las cajas');
    return this.caja.cajasDelDia(sucursalId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('olvidadas')
  @ApiOperation({ summary: 'Cajas abiertas hace más de N horas (alerta de olvido)' })
  @ApiQuery({ name: 'sucursalId', required: false })
  @ApiQuery({ name: 'horas', required: false, type: Number })
  cajasOlvidadas(
    @CurrentUser() user: JwtPayload,
    @Query('sucursalId') sucursalId?: string,
    @Query('horas') horas?: string,
  ) {
    // Un ADMIN sin filtro ve las de su sucursal; el SUPER_ADMIN, todas.
    return this.caja.cajasOlvidadas(
      sucursalEfectiva(user, sucursalId),
      horas ? Number(horas) : 24,
    );
  }

  @Get('historico/:sucursalId')
  @ApiOperation({ summary: 'Histórico de cajas de una sucursal' })
  historico(@Param('sucursalId') sucursalId: string, @CurrentUser() user: JwtPayload) {
    verificarSucursal(user, sucursalId, 'la caja');
    return this.caja.historico(sucursalId);
  }
}
