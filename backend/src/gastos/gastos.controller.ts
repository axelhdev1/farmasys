import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GastosService } from './gastos.service';
import { CrearGastoDto } from './dto/crear-gasto.dto';
import { ActualizarGastoDto } from './dto/actualizar-gasto.dto';
import {
  ActualizarGastoRecurrenteDto,
  AplicarRecurrentesDto,
  CrearGastoRecurrenteDto,
} from './dto/gasto-recurrente.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import {
  sucursalEfectivaFinanciera,
  verificarSucursalFinanciera,
} from '../auth/scope-sucursal.util';

/**
 * Gastos operativos — solo administradores (es información financiera).
 *
 * El alcance usa la regla FINANCIERA: solo el SUPER_ADMIN cruza sucursales.
 * Un ADMIN de sede administra los gastos de SU botica, no los de las otras.
 */
@ApiTags('gastos')
@ApiBearerAuth('access-token')
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('gastos')
export class GastosController {
  constructor(private readonly gastos: GastosService) {}

  // ── Gastos fijos mensuales ────────────────────────────────────────────
  // Van antes de ':id' a propósito: si no, Nest tomaría "recurrentes" como id.

  @Get('recurrentes')
  @ApiOperation({ summary: 'Listar los gastos fijos de la sucursal' })
  @ApiQuery({ name: 'sucursalId', required: false })
  listarRecurrentes(@CurrentUser() user: JwtPayload, @Query('sucursalId') sucursalId?: string) {
    const sid = sucursalEfectivaFinanciera(user, sucursalId);
    verificarSucursalFinanciera(user, sid, 'los gastos fijos');
    return this.gastos.listarRecurrentes(sid ?? '');
  }

  @Get('recurrentes/pendientes')
  @ApiOperation({
    summary: 'Meses de gastos fijos aún no registrados',
    description: 'Solo lista. No crea nada: el registro se confirma con POST /recurrentes/aplicar.',
  })
  @ApiQuery({ name: 'sucursalId', required: false })
  pendientes(@CurrentUser() user: JwtPayload, @Query('sucursalId') sucursalId?: string) {
    const sid = sucursalEfectivaFinanciera(user, sucursalId);
    verificarSucursalFinanciera(user, sid, 'los gastos fijos');
    return this.gastos.pendientesRecurrentes(sid ?? '');
  }

  @Post('recurrentes')
  @ApiOperation({ summary: 'Crear un gasto fijo mensual' })
  crearRecurrente(@Body() dto: CrearGastoRecurrenteDto, @CurrentUser() user: JwtPayload) {
    verificarSucursalFinanciera(user, dto.sucursalId, 'los gastos fijos');
    return this.gastos.crearRecurrente(dto);
  }

  @Post('recurrentes/aplicar')
  @ApiOperation({ summary: 'Registrar los meses pendientes confirmados' })
  aplicarRecurrentes(@Body() dto: AplicarRecurrentesDto, @CurrentUser() user: JwtPayload) {
    verificarSucursalFinanciera(user, dto.sucursalId, 'los gastos fijos');
    return this.gastos.aplicarRecurrentes(dto, user.sub);
  }

  @Patch('recurrentes/:id')
  @ApiOperation({ summary: 'Editar o desactivar un gasto fijo' })
  actualizarRecurrente(@Param('id') id: string, @Body() dto: ActualizarGastoRecurrenteDto) {
    return this.gastos.actualizarRecurrente(id, dto);
  }

  @Delete('recurrentes/:id')
  @ApiOperation({
    summary: 'Borrar un gasto fijo',
    description: 'Los gastos ya generados se conservan: son hechos de períodos cerrados.',
  })
  eliminarRecurrente(@Param('id') id: string) {
    return this.gastos.eliminarRecurrente(id);
  }

  // ── Gastos puntuales ──────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Registrar un gasto operativo' })
  crear(@Body() dto: CrearGastoDto, @CurrentUser() user: JwtPayload) {
    // Un ADMIN administra SU botica: no debe cargar gastos a otra sede (los
    // gastos entran directo a la utilidad neta de esa sucursal).
    verificarSucursalFinanciera(user, dto.sucursalId, 'los gastos');
    return this.gastos.crear(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Listar gastos (filtrable por sucursal y rango)' })
  @ApiQuery({ name: 'sucursalId', required: false })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  listar(
    @CurrentUser() user: JwtPayload,
    @Query('sucursalId') sucursalId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.gastos.listar(sucursalEfectivaFinanciera(user, sucursalId), desde, hasta);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Corregir un gasto ya registrado' })
  async actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarGastoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.verificarPropiedad(id, user);
    return this.gastos.actualizar(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un gasto' })
  async eliminar(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.verificarPropiedad(id, user);
    return this.gastos.eliminar(id);
  }

  /**
   * El id de un gasto no dice a qué botica pertenece, así que hay que
   * resolverlo antes de dejar tocarlo. Sin esto, un ADMIN de sede podría
   * borrar el alquiler de otra botica y alterarle la utilidad del mes.
   */
  private async verificarPropiedad(id: string, user: JwtPayload): Promise<void> {
    const gasto = await this.gastos.obtener(id);
    verificarSucursalFinanciera(user, gasto.sucursalId, 'los gastos');
  }
}
