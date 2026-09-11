import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReportesService } from './reportes.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import {
  verificarSucursal,
  verificarSucursalFinanciera,
} from '../auth/scope-sucursal.util';

@ApiTags('reportes')
@ApiBearerAuth('access-token')
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  /**
   * Torre de control: la venta del día de TODAS las boticas en una sola
   * respuesta. Es la vista del DUEÑO.
   *
   * Solo SUPER_ADMIN. Antes también entraba ADMIN, y con 5 boticas lo normal es
   * que cada sede tenga un encargado con ese rol: podía ver cuánto vendieron las
   * otras cuatro llamando al endpoint, aunque la pantalla no se lo mostrara.
   * Para sus propios números tiene `GET kpis/:sucursalId`, que sí valida sucursal.
   */
  @Roles('SUPER_ADMIN')
  @Get('sucursales')
  @ApiOperation({ summary: 'KPIs del día de todas las sucursales (solo el dueño)' })
  kpisPorSucursal() {
    return this.reportes.kpisPorSucursal();
  }

  @Get('kpis/:sucursalId')
  @ApiOperation({ summary: 'KPIs del dashboard por sucursal' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  kpis(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    verificarSucursal(user, sucursalId, 'los reportes');
    return this.reportes.kpis(sucursalId, desde, hasta);
  }

  @Get('top-productos/:sucursalId')
  @ApiOperation({ summary: 'Top productos más vendidos' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  topProductos(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('limit') limit?: string,
  ) {
    verificarSucursal(user, sucursalId, 'los reportes');
    return this.reportes.topProductos(sucursalId, desde, hasta, limit ? Number(limit) : 10);
  }

  @Get('ventas-por-dia/:sucursalId')
  @ApiOperation({ summary: 'Ventas agrupadas por día' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  ventasPorDia(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    verificarSucursal(user, sucursalId, 'los reportes');
    return this.reportes.ventasPorDia(sucursalId, desde, hasta);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('margen/:sucursalId')
  @ApiOperation({ summary: 'Margen del periodo (ingreso − costo)' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  margen(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    verificarSucursalFinanciera(user, sucursalId, 'la información financiera');
    return this.reportes.margen(sucursalId, desde, hasta);
  }

  // ── Finanzas ──────────────────────────────────────────────────────────
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('estado-resultados/:sucursalId')
  @ApiOperation({ summary: 'Estado de resultados (P&L) del periodo' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  estadoResultados(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    // El P&L es lo más sensible del sistema: cuánto gana cada botica. Un ADMIN
    // de una sede no debe poder leer el de otra cambiando el id en la URL.
    verificarSucursalFinanciera(user, sucursalId, 'la información financiera');
    return this.reportes.estadoResultados(sucursalId, desde, hasta);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('igv/:sucursalId')
  @ApiOperation({
    summary: 'IGV estimado del periodo (débito ventas − crédito compras)',
    description:
      'ESTIMADO para provisionar, no una declaración. No distingue comprobantes ' +
      'con derecho a crédito fiscal ni considera notas de crédito.',
  })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  igv(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    verificarSucursalFinanciera(user, sucursalId, 'la información financiera');
    return this.reportes.igv(sucursalId, desde, hasta);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('margen-categorias/:sucursalId')
  @ApiOperation({ summary: 'Rentabilidad por categoría (ingreso, costo, utilidad, margen%)' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  margenCategorias(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    verificarSucursalFinanciera(user, sucursalId, 'la información financiera');
    return this.reportes.margenCategorias(sucursalId, desde, hasta);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('top-utilidad/:sucursalId')
  @ApiOperation({ summary: 'Top productos por utilidad generada (no por facturación)' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  topUtilidad(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('limit') limit?: string,
  ) {
    verificarSucursalFinanciera(user, sucursalId, 'la información financiera');
    return this.reportes.topUtilidad(sucursalId, desde, hasta, limit ? Number(limit) : 20);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('dias-inventario/:sucursalId')
  @ApiOperation({ summary: 'Días de inventario global y por categoría (capital dormido)' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  diasInventario(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    verificarSucursalFinanciera(user, sucursalId, 'la información financiera');
    return this.reportes.diasInventario(sucursalId, desde, hasta);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('metodos-pago/:sucursalId')
  @ApiOperation({ summary: 'Ventas por método de pago' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  metodosPago(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    verificarSucursalFinanciera(user, sucursalId, 'la información financiera');
    return this.reportes.metodosPago(sucursalId, desde, hasta);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('ventas-categoria/:sucursalId')
  @ApiOperation({ summary: 'Ventas por categoría de producto' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  ventasPorCategoria(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    verificarSucursalFinanciera(user, sucursalId, 'la información financiera');
    return this.reportes.ventasPorCategoria(sucursalId, desde, hasta);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'ALMACENERO')
  @Get('reposicion/:sucursalId')
  @ApiOperation({ summary: 'Sugerencia de reposición por demanda' })
  @ApiQuery({ name: 'dias', required: false, description: 'Ventana de análisis (default 30)' })
  @ApiQuery({ name: 'objetivo', required: false, description: 'Días de cobertura objetivo (default 30)' })
  reposicion(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('dias') dias?: string,
    @Query('objetivo') objetivo?: string,
  ) {
    // ALMACENERO entra aquí: solo puede pedir reposición de SU botica.
    verificarSucursal(user, sucursalId, 'los reportes');
    return this.reportes.reposicion(
      sucursalId,
      dias ? Number(dias) : 30,
      objetivo ? Number(objetivo) : 30,
    );
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('flujo-caja/:sucursalId')
  @ApiOperation({ summary: 'Flujo de caja del periodo (ingresos vs egresos)' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  flujoCaja(
    @Param('sucursalId') sucursalId: string,
    @CurrentUser() user: JwtPayload,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    verificarSucursalFinanciera(user, sucursalId, 'la información financiera');
    return this.reportes.flujoCaja(sucursalId, desde, hasta);
  }
}
