import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CrearClienteDto {
  @ApiProperty({ enum: ['DNI', 'RUC', 'CE'], example: 'DNI' })
  @IsIn(['DNI', 'RUC', 'CE'])
  tipoDocumento!: 'DNI' | 'RUC' | 'CE';

  @ApiProperty({ example: '45678912', description: 'Número de documento.' })
  @Matches(/^\d{8,11}$/, { message: 'Número de documento inválido' })
  numeroDocumento!: string;

  @ApiProperty({ example: 'Juan' })
  @IsString()
  @MinLength(1)
  nombres!: string;

  @ApiPropertyOptional({ example: 'Pérez' })
  @IsOptional()
  @IsString()
  apellidos?: string;

  @ApiPropertyOptional({ example: 'Comercializadora Pérez E.I.R.L.' })
  @IsOptional()
  @IsString()
  razonSocial?: string;

  @ApiPropertyOptional({ example: '987654321' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional({ example: 'cliente@correo.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 'Av. Arequipa 1234, Miraflores' })
  @IsOptional()
  @IsString()
  direccion?: string;
}

export class ActualizarClienteDto extends PartialType(CrearClienteDto) {}
