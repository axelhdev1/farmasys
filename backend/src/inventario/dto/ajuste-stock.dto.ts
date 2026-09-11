import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AjusteStockDto {
  @ApiProperty({ description: 'Id del producto.' })
  @IsString()
  productoId!: string;

  @ApiProperty({ description: 'Id de la sucursal.' })
  @IsString()
  sucursalId!: string;

  @ApiProperty({
    example: -5,
    description: 'Cantidad en unidades base. Positiva = ingreso, negativa = salida.',
  })
  @IsInt()
  cantidadBase!: number;

  @ApiProperty({ example: 'Conteo físico — merma por rotura' })
  @IsString()
  @MinLength(3, { message: 'El motivo es obligatorio' })
  motivo!: string;

  @ApiPropertyOptional({ description: 'N.º de lote (obligatorio para ingresos +).' })
  @IsOptional()
  @IsString()
  loteNumero?: string;

  @ApiPropertyOptional({ description: 'Vencimiento del lote (YYYY-MM-DD), para ingresos +.' })
  @IsOptional()
  @IsString()
  vencimiento?: string;
}
