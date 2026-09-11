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
import { SucursalesService } from './sucursales.service';
import { CrearSucursalDto } from './dto/crear-sucursal.dto';
import { ActualizarSucursalDto } from './dto/actualizar-sucursal.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';

@ApiTags('sucursales')
@ApiBearerAuth('access-token')
@Controller('sucursales')
export class SucursalesController {
  constructor(private readonly sucursales: SucursalesService) {}

  /** Crear/editar/eliminar restringido a administradores. */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  @ApiOperation({ summary: 'Crear sucursal' })
  crear(@Body() dto: CrearSucursalDto) {
    return this.sucursales.crear(dto);
  }

  /** Listado disponible para cualquier usuario autenticado (selector de sucursal). */
  @Get()
  @ApiOperation({ summary: 'Listar sucursales' })
  @ApiQuery({ name: 'incluirInactivas', required: false, type: Boolean })
  listar(@Query('incluirInactivas') incluirInactivas?: string) {
    return this.sucursales.listar(incluirInactivas === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener sucursal por id' })
  obtener(@Param('id') id: string) {
    return this.sucursales.obtener(id);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar sucursal' })
  actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarSucursalDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.sucursales.actualizar(id, dto, user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar sucursal (estado INACTIVA)' })
  desactivar(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.sucursales.desactivar(id, user);
  }
}
