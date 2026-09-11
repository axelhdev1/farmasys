import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Anulación de una compra mal registrada (factura duplicada, cantidades
 * equivocadas). Exige motivo: revertir mercadería mueve stock y costo.
 */
export class AnularCompraDto {
  @ApiProperty({
    example: 'Factura cargada con cantidades equivocadas',
    description: 'Motivo de la anulación (mínimo 10 caracteres).',
  })
  @IsString()
  @MinLength(10, { message: 'Explica el motivo de la anulación (mínimo 10 caracteres)' })
  motivo!: string;
}
