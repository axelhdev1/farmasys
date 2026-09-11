import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CerrarCajaDto {
  @ApiProperty({ example: 350.5, description: 'Efectivo contado en el arqueo (S/.).' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  efectivoContado!: number;

  @ApiPropertyOptional({ description: 'Motivo obligatorio si la diferencia es grande (> S/.20).' })
  @IsOptional()
  @IsString()
  motivoDiferencia?: string;
}
