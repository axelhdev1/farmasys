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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ProductosService } from './productos.service';
import { ImportarCatalogoDto } from './dto/importar-catalogo.dto';
import { CrearProductoDto } from './dto/crear-producto.dto';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto';
import { PresentacionDto } from './dto/presentacion.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { verificarSucursal } from '../auth/scope-sucursal.util';

@ApiTags('productos')
@ApiBearerAuth('access-token')
@Controller('productos')
export class ProductosController {
  constructor(private readonly productos: ProductosService) {}

  /** Búsqueda rápida del POS (cualquier usuario autenticado). */
  @Get('buscar')
  @ApiOperation({ summary: 'Buscar productos por código, nombre o principio activo' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  buscar(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.productos.buscar(q, limit ? Number(limit) : 20);
  }

  @Get('agrupado')
  @ApiOperation({ summary: 'Buscar productos agrupados por principio activo' })
  @ApiQuery({ name: 'q', required: true })
  buscarAgrupado(@Query('q') q: string) {
    return this.productos.buscarAgrupado(q);
  }

  /**
   * Catálogo LIVIANO para el POS: producto + presentaciones + stock con
   * agregados por lote calculados en el SERVIDOR (vendible, FEFO, vencidas).
   * No envía los lotes individuales → con catálogos grandes la carga del POS
   * pasa de megabytes a kilobytes. `productoIds` permite refrescar solo los
   * productos de una venta (refresh parcial post-cobro).
   */
  @Get('pos-catalogo')
  @ApiOperation({ summary: 'Catálogo liviano del POS (stock vendible + FEFO agregados)' })
  @ApiQuery({ name: 'sucursalId', required: true })
  @ApiQuery({ name: 'productoIds', required: false, description: 'CSV de ids para refresh parcial' })
  posCatalogo(
    @CurrentUser() user: JwtPayload,
    @Query('sucursalId') sucursalId: string,
    @Query('productoIds') productoIds?: string,
  ) {
    // El catálogo trae el STOCK de la sucursal: un cajero no debe poder
    // consultar las existencias de otra botica cambiando el parámetro.
    verificarSucursal(user, sucursalId, 'el catálogo');
    return this.productos.posCatalogo(
      sucursalId,
      productoIds ? productoIds.split(',').filter(Boolean) : undefined,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Listar productos (paginado)' })
  @ApiQuery({ name: 'categoria', required: false })
  @ApiQuery({ name: 'incluirInactivos', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listar(
    @Query('categoria') categoria?: string,
    @Query('incluirInactivos') incluirInactivos?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productos.listar({
      categoria,
      incluirInactivos: incluirInactivos === 'true',
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener producto por id' })
  obtener(@Param('id') id: string) {
    return this.productos.obtener(id);
  }

  // ── Mutaciones: solo administradores/almaceneros ──────────────────────────

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('importar')
  @ApiOperation({
    summary: 'Importación masiva de catálogo (validación fila a fila, modo simulación)',
  })
  importar(@Body() dto: ImportarCatalogoDto) {
    return this.productos.importarCatalogo(dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ALMACENERO')
  @Post()
  @ApiOperation({ summary: 'Crear producto con sus presentaciones' })
  crear(@Body() dto: CrearProductoDto) {
    return this.productos.crear(dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ALMACENERO')
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos del producto' })
  actualizar(@Param('id') id: string, @Body() dto: ActualizarProductoDto) {
    return this.productos.actualizar(id, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar producto (soft-delete) — solo administrador' })
  desactivar(@Param('id') id: string) {
    return this.productos.desactivar(id);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id/reactivar')
  @ApiOperation({ summary: 'Reactivar un producto desactivado — solo administrador' })
  reactivar(@Param('id') id: string) {
    return this.productos.reactivar(id);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id/permanente')
  @ApiOperation({ summary: 'Eliminar definitivamente (solo si nunca se usó)' })
  eliminarPermanente(@Param('id') id: string) {
    return this.productos.eliminarPermanente(id);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ALMACENERO')
  @Post(':id/presentaciones')
  @ApiOperation({ summary: 'Agregar una presentación al producto' })
  agregarPresentacion(@Param('id') id: string, @Body() dto: PresentacionDto) {
    return this.productos.agregarPresentacion(id, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ALMACENERO')
  @Patch(':id/presentaciones/:presentacionId')
  @ApiOperation({ summary: 'Actualizar una presentación del producto' })
  actualizarPresentacion(
    @Param('id') id: string,
    @Param('presentacionId') presentacionId: string,
    @Body() dto: PresentacionDto,
  ) {
    return this.productos.actualizarPresentacion(id, presentacionId, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id/presentaciones/:presentacionId/base')
  @ApiOperation({
    summary: 'Definir cuál presentación es la unidad base',
    description:
      'Solo si el producto no tiene stock ni ventas: la base define la unidad ' +
      'en la que está contado todo el inventario. Fuerza su factor a 1.',
  })
  cambiarBase(
    @Param('id') id: string,
    @Param('presentacionId') presentacionId: string,
  ) {
    return this.productos.cambiarBase(id, presentacionId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ALMACENERO')
  @Delete(':id/presentaciones/:presentacionId')
  @ApiOperation({ summary: 'Eliminar una presentación del producto' })
  eliminarPresentacion(
    @Param('id') id: string,
    @Param('presentacionId') presentacionId: string,
  ) {
    return this.productos.eliminarPresentacion(id, presentacionId);
  }
}
