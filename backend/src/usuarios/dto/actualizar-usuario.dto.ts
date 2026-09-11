import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Rol } from '@prisma/client';

/**
 * Actualización parcial de un usuario. La contraseña NO se cambia aquí
 * (usar el endpoint dedicado /usuarios/:id/password).
 */
export class ActualizarUsuarioDto {
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

  @ApiPropertyOptional({ example: 'nuevo@farmasys.pe' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '45231897', description: 'DNI peruano (8 dígitos).' })
  @IsOptional()
  @Matches(/^\d{8}$/, { message: 'El DNI debe tener 8 dígitos' })
  dni?: string;

  @ApiPropertyOptional({ example: '987654321', description: 'Teléfono de contacto.' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional({ enum: Rol, isArray: true, example: ['VENDEDOR', 'ALMACENERO'] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'Asigna al menos un rol' })
  @IsEnum(Rol, { each: true, message: 'Rol inválido' })
  roles?: Rol[];

  @ApiPropertyOptional({ isArray: true, type: String, example: ['pos', 'caja', 'inventario'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permisos?: string[];

  @ApiPropertyOptional({ description: 'Id de sucursal; null = desasignar.' })
  @IsOptional()
  @IsString()
  sucursalId?: string | null;

  @ApiPropertyOptional({ description: 'Activar/desactivar (soft-delete).' })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
