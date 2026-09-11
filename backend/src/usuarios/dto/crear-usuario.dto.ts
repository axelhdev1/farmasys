import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Rol } from '@prisma/client';

export class CrearUsuarioDto {
  @ApiProperty({ example: 'María' })
  @IsString()
  @MinLength(2)
  nombres!: string;

  @ApiProperty({ example: 'Quispe' })
  @IsString()
  @MinLength(2)
  apellidos!: string;

  @ApiProperty({ example: 'vendedor@farmasys.pe' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '45231897', description: 'DNI peruano (8 dígitos).' })
  @IsOptional()
  @Matches(/^\d{8}$/, { message: 'El DNI debe tener 8 dígitos' })
  dni?: string;

  @ApiPropertyOptional({ example: '987654321', description: 'Teléfono de contacto.' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiProperty({ example: 'Clave1234', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @Matches(/\d/, { message: 'La contraseña debe incluir al menos un número' })
  password!: string;

  @ApiProperty({ enum: Rol, isArray: true, example: ['VENDEDOR'] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Asigna al menos un rol' })
  @IsEnum(Rol, { each: true, message: 'Rol inválido' })
  roles!: Rol[];

  /**
   * Módulos accesibles. Si se omite, el backend usa la plantilla del rol.
   * Se validan contra el catálogo y los pisos de seguridad.
   */
  @ApiPropertyOptional({ isArray: true, type: String, example: ['pos', 'caja', 'clientes'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permisos?: string[];

  /** Sucursal asignada. Null/omitido = sin sucursal (p.ej. SUPER_ADMIN). */
  @ApiPropertyOptional({ description: 'Id de sucursal; null = sin sucursal.' })
  @IsOptional()
  @IsString()
  sucursalId?: string | null;
}
