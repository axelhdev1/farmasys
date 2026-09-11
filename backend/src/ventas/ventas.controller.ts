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
import { VentasService } from './ventas.service';
import { CrearVentaDto } from './dto/crear-venta.dto';
import { AnularVentaDto } from './dto/anular-venta.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { esAdmin, sucursalEfectiva } from '../auth/scope-sucursal.util';
import { JwtPayload } from '../auth/auth.types';

@ApiTags('ventas')
@ApiBearerAuth('access-token')
@Controller('ventas')
export class VentasController {
  constructor(private readonly ventas: VentasService) {}

  // La regla de scoping vive en auth/scope-sucursal.util.ts (compartida con
  // inventario, caja, reportes, etc.). Aquí solo se delega.
  private esAdmin(user: JwtPayload): boolean {
    return esAdmin(user);
  }

  private sucursalEfectiva(user: JwtPayload, solicitada?: string): string | undefined {
    return sucursalEfectiva(user, solicitada);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'VENDEDOR', 'FARMACEUTICO')
  @Post()
  @ApiOperation({ summary: 'Registrar venta (transaccional, FEFO, pago mixto)' })
  registrar(@Body() dto: CrearVentaDto, @CurrentUser() user: JwtPayload) {
    // Un no-admin solo registra ventas en SU sucursal (la del token).
    if (!this.esAdmin(user) && user.sucursalId && dto.sucursalId !== user.sucursalId) {
      throw new ForbiddenException('No puedes registrar ventas en otra sucursal');
    }
    return this.ventas.registrar(dto, user.sub, user.roles ?? []);
  }

  @Get()
  @ApiOperation({ summary: 'Listar ventas (fuente real para Dashboard/KPIs)' })
  @ApiQuery({ name: 'sucursalId', required: false })
  @ApiQuery({ name: 'cajaSesionId', required: false })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  @ApiQuery({ name: 'estado', required: false, enum: ['COMPLETADA', 'ANULADA', 'PENDIENTE'] })
  @ApiQuery({ name: 'clienteId', required: false, description: 'Historial de compras de un cliente' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'size', required: false })
  listar(
    @CurrentUser() user: JwtPayload,
    @Query('sucursalId') sucursalId?: string,
    @Query('cajaSesionId') cajaSesionId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('estado') estado?: string,
    @Query('clienteId') clienteId?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.ventas.listar({
      sucursalId: this.sucursalEfectiva(user, sucursalId),
      cajaSesionId, desde, hasta, estado, clienteId, page, size,
    });
  }

  @Get('historial')
  @ApiOperation({ summary: 'Historial paginado con búsqueda/filtros de servidor + total' })
  @ApiQuery({ name: 'sucursalId', required: false })
  @ApiQuery({ name: 'q', required: false, description: 'Comprobante, cliente, documento o cajero' })
  @ApiQuery({ name: 'estado', required: false, enum: ['COMPLETADA', 'ANULADA', 'PENDIENTE'] })
  @ApiQuery({ name: 'metodoPago', required: false, enum: ['EFECTIVO', 'TARJETA', 'YAPE_PLIN', 'TRANSFERENCIA'] })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  @ApiQuery({ name: 'orden', required: false, enum: ['fecha_desc', 'fecha_asc', 'total_desc', 'total_asc'] })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'size', required: false })
  historial(
    @CurrentUser() user: JwtPayload,
    @Query('sucursalId') sucursalId?: string,
    @Query('q') q?: string,
    @Query('estado') estado?: string,
    @Query('metodoPago') metodoPago?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('orden') orden?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.ventas.listarHistorial({
      sucursalId: this.sucursalEfectiva(user, sucursalId),
      q, estado, metodoPago, desde, hasta, orden, page, size,
    });
  }

  @Get('anuladas/contar')
  @ApiOperation({ summary: 'Contar anulaciones REALIZADAS en un rango (por anuladaEn)' })
  @ApiQuery({ name: 'sucursalId', required: false })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  contarAnuladas(
    @CurrentUser() user: JwtPayload,
    @Query('sucursalId') sucursalId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.ventas.contarAnuladas({
      sucursalId: this.sucursalEfectiva(user, sucursalId),
      desde,
      hasta,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener venta con detalle (para boleta/reimpresión)' })
  async obtener(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const venta = await this.ventas.obtener(id);
    if (!this.esAdmin(user) && user.sucursalId && venta.sucursalId !== user.sucursalId) {
      throw new ForbiddenException('La venta pertenece a otra sucursal');
    }
    return venta;
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id/anular')
  @ApiOperation({ summary: 'Anular venta (devuelve stock, registra motivo y autor)' })
  anular(
    @Param('id') id: string,
    @Body() dto: AnularVentaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ventas.anular(id, dto, user.sub);
  }
}
