import { IsNumber, IsString, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AbrirCajaDto {
  @ApiProperty({ description: 'Id de la sucursal.' })
  @IsString()
  sucursalId!: string;

  @ApiProperty({ example: 'Caja 1', description: 'Identificador del terminal/caja.' })
  @IsString()
  @MinLength(1)
  terminal!: string;

  @ApiProperty({ example: 100.0, description: 'Monto inicial en efectivo (S/.).' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  montoInicial!: number;
}
