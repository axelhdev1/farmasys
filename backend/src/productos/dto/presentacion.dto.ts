import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Presentación de venta (caja/blíster/unidad) con su factor y precio. */
export class PresentacionDto {
  @ApiProperty({ example: 'Caja x 100' })
  @IsString()
  @MinLength(1)
  nombre!: string;

  @ApiProperty({ example: 100, description: 'Unidades base que contiene.' })
  @IsInt()
  @Min(1)
  factor!: number;

  /**
   * Precio de venta al público. Mínimo 0.01: un producto a S/ 0 se despacha
   * gratis sin que nada lo impida (el cobro da total 0 y el pago "alcanza").
   * El importador masivo ya exigía precio > 0; esta puerta lo permitía.
   */
  @ApiProperty({ example: 25.5, description: 'Precio de venta (S/.). Debe ser mayor a 0.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'El precio de venta debe ser mayor a 0' })
  precioVenta!: number;

  @ApiPropertyOptional({ example: '7501234567890' })
  @IsOptional()
  @IsString()
  codigoBarras?: string;

  @ApiPropertyOptional({ default: false, description: 'Marca la presentación unidad-base.' })
  @IsOptional()
  @IsBoolean()
  esBase?: boolean;
}
