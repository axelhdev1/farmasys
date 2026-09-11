import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ComprasService } from './compras.service';
import {
  ActualizarProveedorDto,
  CrearProveedorDto,
} from './dto/proveedor.dto';
import { CrearCompraDto } from './dto/crear-compra.dto';
import { AnularCompraDto } from './dto/anular-compra.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { sucursalEfectiva, verificarSucursal } from '../auth/scope-sucursal.util';

@ApiTags('compras')
@ApiBearerAuth('access-token')
@Roles('SUPER_ADMIN', 'ADMIN', 'ALMACENERO')
@Controller('compras')
export class ComprasController {
  constructor(private readonly compras: ComprasService) {}

  // ── Proveedores ──────────────────────────────────────────────────────────

  @Post('proveedores')
  @ApiOperation({ summary: 'Crear proveedor' })
  crearProveedor(@Body() dto: CrearProveedorDto) {
    return this.compras.crearProveedor(dto);
  }

  @Get('proveedores')
  @ApiOperation({ summary: 'Listar proveedores' })
  @ApiQuery({ name: 'incluirInactivos', required: false, type: Boolean })
  listarProveedores(@Query('incluirInactivos') incluirInactivos?: string) {
    return this.compras.listarProveedores(incluirInactivos === 'true');
  }

  @Get('proveedores/:id')
  @ApiOperation({ summary: 'Obtener proveedor' })
  obtenerProveedor(@Param('id') id: string) {
    return this.compras.obtenerProveedor(id);
  }

  @Patch('proveedores/:id')
  @ApiOperation({ summary: 'Actualizar proveedor' })
  actualizarProveedor(@Param('id') id: string, @Body() dto: ActualizarProveedorDto) {
    return this.compras.actualizarProveedor(id, dto);
  }

  // ── Compras ────────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Registrar compra (ingreso de mercadería, transaccional)' })
  registrarCompra(@Body() dto: CrearCompraDto, @CurrentUser() user: JwtPayload) {
    // El ALMACENERO solo ingresa mercadería en SU botica.
    verificarSucursal(user, dto.sucursalId, 'las compras');
    return this.compras.registrarCompra(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Listar compras' })
  @ApiQuery({ name: 'sucursalId', required: false })
  listarCompras(@CurrentUser() user: JwtPayload, @Query('sucursalId') sucursalId?: string) {
    return this.compras.listarCompras(sucursalEfectiva(user, sucursalId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener compra con su detalle' })
  obtenerCompra(@Param('id') id: string) {
    return this.compras.obtenerCompra(id);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id/anular')
  @ApiOperation({
    summary: 'Anular compra (revierte stock, lote y costo promedio). Solo si nada se vendió.',
  })
  async anularCompra(
    @Param('id') id: string,
    @Body() dto: AnularCompraDto,
    @CurrentUser() user: JwtPayload,
  ) {
    // La compra define la sucursal: se resuelve y se valida el scope.
    const compra = await this.compras.obtenerCompra(id);
    verificarSucursal(user, compra.sucursalId, 'las compras');
    return this.compras.anularCompra(id, dto.motivo, user.sub);
  }
}
