import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompraItemDto {
  @ApiProperty({ description: 'Id del producto que se ingresa.' })
  @IsString()
  productoId!: string;

  @ApiProperty({ example: 'L-2026-014', description: 'Código de lote del fabricante.' })
  @IsString()
  @MinLength(1)
  lote!: string;

  @ApiProperty({ example: '2027-12-31', description: 'Fecha de vencimiento (ISO).' })
  @IsDateString()
  vencimiento!: string;

  @ApiProperty({ example: 200, description: 'Unidades base ingresadas.' })
  @IsInt()
  @Min(1)
  cantidadBase!: number;

  // Un costo 0 arruina el costo promedio y el margen de Finanzas: se exige > 0.
  @ApiProperty({ example: 8.5, description: 'Costo unitario base SIN IGV (S/.). Debe ser mayor a 0.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'El precio de compra debe ser mayor a 0' })
  precioCompra!: number;
}

export class CrearCompraDto {
  @ApiProperty({ description: 'Id del proveedor.' })
  @IsString()
  proveedorId!: string;

  @ApiProperty({ description: 'Id de la sucursal que recibe la mercadería.' })
  @IsString()
  sucursalId!: string;

  @ApiProperty({ example: 'F001-0004521', description: 'N.º de comprobante del proveedor.' })
  @IsString()
  @MinLength(1)
  numeroDocumento!: string;

  @ApiPropertyOptional({ example: 'FACTURA', default: 'FACTURA' })
  @IsOptional()
  @IsString()
  tipoDocumento?: string;

  @ApiProperty({ type: [CompraItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'La compra debe tener al menos un ítem' })
  @ValidateNested({ each: true })
  @Type(() => CompraItemDto)
  items!: CompraItemDto[];
}
