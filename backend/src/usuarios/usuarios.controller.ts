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
  ApiForbiddenResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UsuariosService } from './usuarios.service';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto';
import { CambiarPasswordDto } from './dto/cambiar-password.dto';
import { ActualizarPerfilDto } from './dto/actualizar-perfil.dto';
import { CambiarMiPasswordDto } from './dto/cambiar-mi-password.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';

/**
 * Gestión de usuarios.
 *
 * OJO con el guard: aquí NO se pone @Roles a nivel de clase, porque las rutas
 * de Mi Perfil (/me, /me/password) deben ser accesibles para CUALQUIER rol.
 * Cada endpoint administrativo lleva su propio @Roles('SUPER_ADMIN','ADMIN').
 *
 * Y OJO con el ORDEN: las rutas fijas ('me', 'me/password') se declaran ANTES
 * que las paramétricas (':id'), o NestJS interpretaría "me" como un id.
 */
@ApiTags('usuarios')
@ApiBearerAuth('access-token')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  // ─────────────────────── Mi Perfil (cualquier rol) ──────────────────────

  @Patch('me')
  @ApiOperation({ summary: 'Actualizar mis propios datos (nombres, apellidos, teléfono)' })
  actualizarMiPerfil(@CurrentUser() user: JwtPayload, @Body() dto: ActualizarPerfilDto) {
    return this.usuarios.actualizarMiPerfil(user.sub, dto);
  }

  @Patch('me/password')
  @ApiOperation({ summary: 'Cambiar mi propia contraseña (pide la actual)' })
  cambiarMiPassword(@CurrentUser() user: JwtPayload, @Body() dto: CambiarMiPasswordDto) {
    return this.usuarios.cambiarMiPassword(user.sub, dto);
  }

  // ─────────────────── Administración (SUPER_ADMIN / ADMIN) ────────────────

  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiForbiddenResponse({ description: 'Requiere rol SUPER_ADMIN o ADMIN.' })
  @Post()
  @ApiOperation({ summary: 'Crear usuario' })
  crear(@CurrentUser() user: JwtPayload, @Body() dto: CrearUsuarioDto) {
    return this.usuarios.crear(dto, user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get()
  @ApiOperation({ summary: 'Listar usuarios' })
  @ApiQuery({ name: 'incluirInactivos', required: false, type: Boolean })
  listar(@CurrentUser() user: JwtPayload, @Query('incluirInactivos') incluirInactivos?: string) {
    return this.usuarios.listar(user, incluirInactivos === 'true');
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get(':id')
  @ApiOperation({ summary: 'Obtener un usuario por id' })
  obtener(@Param('id') id: string) {
    return this.usuarios.obtener(id);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos, roles, permisos o sucursal de un usuario' })
  actualizar(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ActualizarUsuarioDto,
  ) {
    return this.usuarios.actualizar(id, dto, user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id/password')
  @ApiOperation({ summary: 'Resetear la contraseña de otro usuario (fuerza cambio al ingresar)' })
  cambiarPassword(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CambiarPasswordDto,
  ) {
    return this.usuarios.cambiarPassword(id, dto.password, user);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id/reactivar')
  @ApiOperation({ summary: 'Reactivar un usuario desactivado' })
  reactivar(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.usuarios.reactivar(id, user);
  }

  /** Soft-delete (activo=false). */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar usuario (soft-delete)' })
  desactivar(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.usuarios.desactivar(id, user);
  }
}
