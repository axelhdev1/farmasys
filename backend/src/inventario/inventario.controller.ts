import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { InventarioService } from './inventario.service';
import { AjusteStockDto } from './dto/ajuste-stock.dto';
import { BajaLoteDto } from './dto/baja-lote.dto';
import { StockMinimoDto } from './dto/stock-minimo.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { verificarSucursal } from '../auth/scope-sucursal.util';

/**
 * Inventario. TODAS las rutas reciben la sucursal por path param, así que el
 * scoping se hace validando ese param contra el JWT: un no-admin que pida otra
 * sucursal recibe 403 (antes podía leer el stock de cualquier botica).
 */
@ApiTags('inventario')
@ApiBearerAuth('access-token')
@Controller('inventario')
export class InventarioController {
  constructor(private readonly inventario: InventarioService) {}

  /** Atajo local: valida el path param contra la sucursal del token. */
  private scope(user: JwtPayload, sucursalId: string): void {
    verificarSucursal(user, sucursalId, 'el inventario');
  }

  @Get('stock/:productoId/:sucursalId')
  @ApiOperation({ summary: 'Stock total y vendible de un producto en una sucursal' })
  async stock(
    @Param('productoId') productoId: string,
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.scope(user, sucursalId);
    const [total, vendible, diasVence] = await Promise.all([
      this.inventario.stockEn(productoId, sucursalId),
      this.inventario.stockVendibleEn(productoId, sucursalId),
      this.inventario.diasParaVencer(productoId, sucursalId),
    ]);
    return { productoId, sucursalId, total, vendible, vencidas: total - vendible, diasVence };
  }

  /**
   * Disponibilidad del producto en todas las boticas. SIN restricción de rol
   * a propósito: es la pregunta del mostrador ("¿en qué sede sí hay?") y hoy
   * se resuelve llamando por teléfono. Solo expone cantidades y el contacto
   * de la sede — ningún dato financiero.
   */
  @Get('disponibilidad/:productoId')
  @ApiOperation({ summary: 'Stock del producto en cada sucursal (para derivar al cliente)' })
  disponibilidad(@Param('productoId') productoId: string) {
    return this.inventario.stockPorSucursal(productoId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('stock-global/:productoId')
  @ApiOperation({ summary: 'Stock del producto en todas las sucursales (solo admin)' })
  stockGlobal(@Param('productoId') productoId: string) {
    // Consolidado multi-sucursal: solo administración.
    return this.inventario
      .stockGlobal(productoId)
      .then((total) => ({ productoId, total }));
  }

  @Get('lotes/:productoId/:sucursalId')
  @ApiOperation({ summary: 'Lotes vigentes y vencidos de un producto en una sucursal' })
  async lotes(
    @Param('productoId') productoId: string,
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.scope(user, sucursalId);
    const [vigentes, vencidos] = await Promise.all([
      this.inventario.lotesVigentesEn(productoId, sucursalId),
      this.inventario.lotesVencidosEn(productoId, sucursalId),
    ]);
    return { vigentes, vencidos };
  }

  @Get('proximos-vencer/:sucursalId')
  @ApiOperation({ summary: 'Lotes próximos a vencer en una sucursal' })
  @ApiQuery({ name: 'dias', required: false, type: Number })
  proximosAVencer(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('dias') dias?: string,
  ) {
    this.scope(user, sucursalId);
    return this.inventario.proximosAVencer(sucursalId, dias ? Number(dias) : 90);
  }

  @Get('alertas-stock/:sucursalId')
  @ApiOperation({ summary: 'Productos con stock bajo el mínimo en una sucursal' })
  alertasStockBajo(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.scope(user, sucursalId);
    return this.inventario.alertasStockBajo(sucursalId);
  }

  @Get('sucursal/:sucursalId/stock')
  @ApiOperation({ summary: 'Todo el stock de una sucursal (hidratar el front)' })
  stockDeSucursal(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.scope(user, sucursalId);
    return this.inventario.stockDeSucursal(sucursalId);
  }

  @Get('sucursal/:sucursalId/lotes')
  @ApiOperation({ summary: 'Todos los lotes con stock de una sucursal' })
  lotesDeSucursal(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.scope(user, sucursalId);
    return this.inventario.lotesDeSucursal(sucursalId);
  }

  @Get('movimientos/:sucursalId/:productoId')
  @ApiOperation({ summary: 'Kardex (historial de movimientos) de un producto' })
  movimientosDe(
    @Param('sucursalId') sucursalId: string,
    @Param('productoId') productoId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.scope(user, sucursalId);
    return this.inventario.movimientosDe(sucursalId, productoId);
  }

  // ── Mutaciones (administradores / almaceneros) ───────────────────────────

  @Roles('SUPER_ADMIN', 'ADMIN', 'ALMACENERO')
  @Patch('sucursal/:sucursalId/producto/:productoId/stock-minimo')
  @ApiOperation({ summary: 'Actualizar el stock mínimo (punto de reposición)' })
  actualizarStockMinimo(
    @Param('sucursalId') sucursalId: string,
    @Param('productoId') productoId: string,
    @Body() dto: StockMinimoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    this.scope(user, sucursalId);
    return this.inventario.actualizarStockMinimo(sucursalId, productoId, dto.stockMinimo);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ALMACENERO')
  @Post('ajuste')
  @ApiOperation({ summary: 'Ajuste manual de stock (registra movimiento)' })
  ajustar(@Body() dto: AjusteStockDto, @CurrentUser() user: JwtPayload) {
    // El ajuste trae la sucursal en el cuerpo: hay que validarla igual.
    this.scope(user, dto.sucursalId);
    return this.inventario.ajustar(dto, user.sub);
  }

  @Get('lotes-para-baja/:sucursalId')
  @ApiOperation({ summary: 'Lotes vencidos o por vencer (candidatos a merma)' })
  @ApiQuery({ name: 'dias', required: false, type: Number })
  lotesParaBaja(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('dias') dias?: string,
  ) {
    this.scope(user, sucursalId);
    return this.inventario.lotesParaBaja(sucursalId, dias ? Number(dias) : 30);
  }

  @Get('mermas/:sucursalId')
  @ApiOperation({ summary: 'Historial de mermas/bajas con valor perdido' })
  @ApiQuery({ name: 'dias', required: false, type: Number })
  mermas(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('dias') dias?: string,
  ) {
    this.scope(user, sucursalId);
    return this.inventario.listarMermas(sucursalId, dias ? Number(dias) : 30);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ALMACENERO', 'FARMACEUTICO')
  @Post('lotes/:loteId/baja')
  @ApiOperation({ summary: 'Dar de baja un lote (merma: vencido, dañado, robo, etc.)' })
  async darDeBajaLote(
    @Param('loteId') loteId: string,
    @Body() dto: BajaLoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    // La sucursal la define el lote, no el cliente: se resuelve y se valida.
    const lote = await this.inventario.obtenerLote(loteId);
    this.scope(user, lote.sucursalId);
    return this.inventario.darDeBajaLote(loteId, dto, user.sub);
  }
}
