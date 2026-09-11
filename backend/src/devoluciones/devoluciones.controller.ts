import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DevolucionesService } from './devoluciones.service';
import { CrearDevolucionDto } from './dto/crear-devolucion.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { sucursalEfectiva } from '../auth/scope-sucursal.util';

@ApiTags('devoluciones')
@ApiBearerAuth('access-token')
@Controller('devoluciones')
export class DevolucionesController {
  constructor(private readonly devoluciones: DevolucionesService) {}

  /** Los del mostrador (vendedor/farmacéutico) y admins pueden devolver. */
  @Roles('SUPER_ADMIN', 'ADMIN', 'VENDEDOR', 'FARMACEUTICO')
  @Post()
  @ApiOperation({ summary: 'Registrar una devolución (reingresa stock)' })
  crear(@Body() dto: CrearDevolucionDto, @CurrentUser() user: JwtPayload) {
    return this.devoluciones.crear(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Listar devoluciones' })
  @ApiQuery({ name: 'ventaId', required: false })
  @ApiQuery({ name: 'sucursalId', required: false })
  listar(
    @CurrentUser() user: JwtPayload,
    @Query('ventaId') ventaId?: string,
    @Query('sucursalId') sucursalId?: string,
  ) {
    // Un no-admin solo ve las devoluciones de SU botica.
    return this.devoluciones.listar({
      ventaId,
      sucursalId: sucursalEfectiva(user, sucursalId),
    });
  }
}
