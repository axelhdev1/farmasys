import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Datos que un usuario puede editar de SÍ MISMO desde Mi Perfil.
 * Deliberadamente NO incluye roles, permisos, sucursal ni estado: eso solo lo
 * cambia un administrador desde la gestión de usuarios.
 */
export class ActualizarPerfilDto {
  @ApiPropertyOptional({ example: 'María' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  nombres?: string;

  @ApiPropertyOptional({ example: 'Quispe' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  apellidos?: string;

  @ApiPropertyOptional({ example: '987654321' })
  @IsOptional()
  @IsString()
  telefono?: string;
}
