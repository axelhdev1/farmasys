import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Categorías de merma/baja de un lote. */
export const CATEGORIAS_MERMA = [
  'VENCIDO',
  'DANADO',
  'ROBO',
  'MUESTRA',
  'OTRO',
] as const;
export type CategoriaMerma = (typeof CATEGORIAS_MERMA)[number];

/** Baja de un lote (merma): retira stock que ya no se puede vender. */
export class BajaLoteDto {
  @ApiProperty({ enum: CATEGORIAS_MERMA, example: 'VENCIDO' })
  @IsIn(CATEGORIAS_MERMA, { message: 'Categoría de merma inválida' })
  categoria!: CategoriaMerma;

  @ApiPropertyOptional({ description: 'Detalle opcional (ej. "roto en traslado").' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nota?: string;

  @ApiPropertyOptional({
    description: 'Unidades base a dar de baja. Si se omite, se da de baja todo el lote.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  cantidadBase?: number;
}
