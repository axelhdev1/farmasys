import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CrearProveedorDto {
  @ApiProperty({ example: '20123456789', description: 'RUC (11 dígitos).' })
  @Matches(/^(10|15|17|20)\d{9}$/, { message: 'RUC inválido (11 dígitos, prefijo 10/15/17/20)' })
  ruc!: string;

  @ApiProperty({ example: 'Distribuidora Farma S.A.C.' })
  @IsString()
  @MinLength(2)
  razonSocial!: string;

  @ApiPropertyOptional({ example: 'FarmaDist' })
  @IsOptional()
  @IsString()
  nombreComercial?: string;

  @ApiPropertyOptional({ example: '(01) 700-1234' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional({ example: 'ventas@farmadist.pe' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Av. Industrial 789, Lima' })
  @IsOptional()
  @IsString()
  direccion?: string;
}

export class ActualizarProveedorDto extends PartialType(CrearProveedorDto) {}
