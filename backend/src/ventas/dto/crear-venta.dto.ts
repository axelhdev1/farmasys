import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetodoPago, TipoComprobante } from '@prisma/client';

export class VentaItemDto {
  @ApiProperty({ description: 'Id del producto.' })
  @IsString()
  productoId!: string;

  @ApiPropertyOptional({ description: 'Id de la presentación (caja/blíster/unidad).' })
  @IsOptional()
  @IsString()
  presentacionId?: string;

  @ApiProperty({ example: 2, description: 'Cantidad de la presentación.' })
  @IsInt()
  @Min(1)
  cantidad!: number;
}

export class PagoDto {
  @ApiProperty({ enum: MetodoPago })
  @IsEnum(MetodoPago)
  metodo!: MetodoPago;

  @ApiProperty({ example: 25.5, description: 'Monto del pago (S/.).' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monto!: number;

  @ApiPropertyOptional({ description: 'Referencia: celular Yape, voucher, etc.' })
  @IsOptional()
  @IsString()
  referencia?: string;
}

export class CrearVentaDto {
  @ApiProperty({ description: 'Id de la sucursal donde se vende.' })
  @IsString()
  sucursalId!: string;

  @ApiPropertyOptional({ description: 'Id de la sesión de caja abierta.' })
  @IsOptional()
  @IsString()
  cajaSesionId?: string;

  @ApiPropertyOptional({ description: 'Id del cliente (opcional).' })
  @IsOptional()
  @IsString()
  clienteId?: string;

  @ApiProperty({ enum: TipoComprobante, default: TipoComprobante.BOLETA })
  @IsEnum(TipoComprobante)
  tipoComprobante!: TipoComprobante;

  @ApiProperty({ type: [VentaItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'La venta debe tener al menos un ítem' })
  @ValidateNested({ each: true })
  @Type(() => VentaItemDto)
  items!: VentaItemDto[];

  @ApiProperty({ type: [PagoDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Indica al menos un pago' })
  @ValidateNested({ each: true })
  @Type(() => PagoDto)
  pagos!: PagoDto[];

  @ApiPropertyOptional({ example: 5, description: 'Descuento total sobre la venta (S/). 0 = sin descuento.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  descuento?: number;

  /**
   * Clave de idempotencia: si se reintenta el mismo cobro con la misma clave,
   * no se duplica la venta. Recomendado enviarla desde el POS (uuid por ticket).
   */
  @ApiPropertyOptional({ description: 'Clave de idempotencia del cobro (uuid por ticket).' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
