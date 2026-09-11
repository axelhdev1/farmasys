import { IsEnum, IsNumber, IsString, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CategoriaMovimientoCaja, TipoMovimientoCaja } from '@prisma/client';

export class MovimientoCajaDto {
  @ApiProperty({ enum: TipoMovimientoCaja })
  @IsEnum(TipoMovimientoCaja)
  tipo!: TipoMovimientoCaja;

  @ApiProperty({ enum: CategoriaMovimientoCaja })
  @IsEnum(CategoriaMovimientoCaja)
  categoria!: CategoriaMovimientoCaja;

  @ApiProperty({ example: 50.0, description: 'Monto del movimiento (S/.).' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto!: number;

  @ApiProperty({ example: 'Pago a proveedor de agua' })
  @IsString()
  @MinLength(3, { message: 'El motivo es obligatorio' })
  motivo!: string;
}
