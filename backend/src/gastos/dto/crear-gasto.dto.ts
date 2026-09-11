import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoriaGasto } from '@prisma/client';

export class CrearGastoDto {
  @ApiProperty({ description: 'Sucursal a la que pertenece el gasto.' })
  @IsString()
  sucursalId!: string;

  @ApiProperty({ enum: CategoriaGasto, example: 'ALQUILER' })
  @IsEnum(CategoriaGasto, { message: 'Categoría de gasto inválida' })
  categoria!: CategoriaGasto;

  @ApiProperty({ example: 'Alquiler local junio' })
  @IsString()
  @MinLength(2)
  descripcion!: string;

  @ApiProperty({ example: 1500, description: 'Monto del gasto (S/).' })
  @IsNumber()
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  monto!: number;

  @ApiPropertyOptional({ description: 'Fecha del gasto (ISO). Por defecto, hoy.' })
  @IsOptional()
  @IsString()
  fecha?: string;
}
