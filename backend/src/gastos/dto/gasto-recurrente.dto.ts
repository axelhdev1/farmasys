import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoriaGasto } from '@prisma/client';

/** Alta de un gasto fijo mensual (alquiler, sueldos, internet…). */
export class CrearGastoRecurrenteDto {
  @ApiProperty()
  @IsString()
  sucursalId!: string;

  @ApiProperty({ enum: CategoriaGasto, example: 'ALQUILER' })
  @IsEnum(CategoriaGasto, { message: 'Categoría de gasto inválida' })
  categoria!: CategoriaGasto;

  @ApiProperty({ example: 'Alquiler del local' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  descripcion!: string;

  @ApiProperty({ example: 1500 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  monto!: number;

  @ApiPropertyOptional({
    example: 5,
    description: 'Día de pago. Máximo 28 para que exista también en febrero.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28, { message: 'El día de pago debe estar entre 1 y 28 (para que exista en febrero).' })
  diaDelMes?: number;
}

/** Edición de un gasto fijo. Todos los campos opcionales. */
export class ActualizarGastoRecurrenteDto {
  @ApiPropertyOptional({ enum: CategoriaGasto })
  @IsOptional()
  @IsEnum(CategoriaGasto, { message: 'Categoría de gasto inválida' })
  categoria?: CategoriaGasto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  descripcion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  diaDelMes?: number;

  @ApiPropertyOptional({ description: 'Desactivar deja de generarlo sin borrar el historial.' })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

/** Confirmación de los meses pendientes que el dueño acepta registrar. */
export class AplicarRecurrentesDto {
  @ApiProperty()
  @IsString()
  sucursalId!: string;

  @ApiProperty({
    type: [String],
    description: 'Claves "recurrenteId|YYYY-MM" devueltas por /pendientes.',
    example: ['ckx123|2026-08'],
  })
  @IsArray()
  @ArrayMaxSize(200, { message: 'Demasiados gastos fijos en una sola confirmación.' })
  @IsString({ each: true })
  claves!: string[];
}
