import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ConfiguracionService } from './configuracion.service';
import { ActualizarConfiguracionDto } from './dto/actualizar-configuracion.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';

@ApiTags('configuracion')
@ApiBearerAuth('access-token')
@Controller('configuracion')
export class ConfiguracionController {
  constructor(private readonly config: ConfiguracionService) {}

  /** Lectura disponible para cualquier usuario autenticado (la usa el POS/ticket). */
  @Get()
  @ApiOperation({ summary: 'Obtener la configuración global' })
  obtener() {
    return this.config.obtener();
  }

  /**
   * Bitácora de cambios. Solo administradores: saber quién bajó un control es
   * información de auditoría, no de mostrador.
   */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('historial')
  @ApiOperation({ summary: 'Historial de cambios de configuración' })
  @ApiQuery({ name: 'limite', required: false, example: 50 })
  historial(@Query('limite') limite?: string) {
    return this.config.historial(Number(limite) || 50);
  }

  /** Solo administradores editan la configuración. */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put()
  @ApiOperation({ summary: 'Actualizar la configuración global' })
  actualizar(@Body() dto: ActualizarConfiguracionDto, @CurrentUser() user: JwtPayload) {
    return this.config.actualizar(dto, user);
  }
}
