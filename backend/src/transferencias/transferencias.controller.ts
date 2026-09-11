import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TransferenciasService } from './transferencias.service';
import { CrearTransferenciaDto } from './dto/crear-transferencia.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { sucursalEfectiva, verificarSucursal } from '../auth/scope-sucursal.util';

@ApiTags('transferencias')
@ApiBearerAuth('access-token')
@Controller('transferencias')
export class TransferenciasController {
  constructor(private readonly transferencias: TransferenciasService) {}

  @Roles('SUPER_ADMIN', 'ADMIN', 'ALMACENERO')
  @Post()
  @ApiOperation({ summary: 'Registrar transferencia de stock entre sucursales (FEFO, lotes)' })
  crear(@Body() dto: CrearTransferenciaDto, @CurrentUser() user: JwtPayload) {
    // Se valida el ORIGEN: sacar mercadería es lo que descuenta stock real. Sin
    // esto, un almacenero podía vaciar el inventario de OTRA botica hacia la
    // suya con una llamada directa a la API. El destino queda libre a propósito
    // (enviar a otra sede es una operación normal).
    verificarSucursal(user, dto.origenId, 'las transferencias');
    return this.transferencias.crear(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Historial de transferencias (por sucursal, origen o destino)' })
  @ApiQuery({ name: 'sucursalId', required: false })
  listar(@CurrentUser() user: JwtPayload, @Query('sucursalId') sucursalId?: string) {
    // Un no-admin siempre ve las de SU botica, pida lo que pida.
    return this.transferencias.listar(sucursalEfectiva(user, sucursalId));
  }
}
