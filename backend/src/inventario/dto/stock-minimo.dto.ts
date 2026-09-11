import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StockMinimoDto {
  @ApiProperty({ example: 50, description: 'Punto de reposición (unidad base).' })
  @IsInt()
  @Min(0)
  stockMinimo!: number;
}
