import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CategoriaGasto } from '@prisma/client';

/**
 * Corrección de un gasto ya registrado.
 *
 * Antes no existía: un monto mal tecleado obligaba a borrar y volver a crear,
 * y el borrado no deja ningún rastro. Corregir es más seguro que borrar.
 * La sucursal NO se puede cambiar: movería plata de una botica a otra.
 */
export class ActualizarGastoDto {
  @ApiPropertyOptional({ enum: CategoriaGasto })
  @IsOptional()
  @IsEnum(CategoriaGasto, { message: 'Categoría de gasto inválida' })
  categoria?: CategoriaGasto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  descripcion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  monto?: number;

  @ApiPropertyOptional({ description: 'Fecha real del pago (ISO).' })
  @IsOptional()
  @IsString()
  fecha?: string;
}
