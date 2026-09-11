import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnularVentaDto {
  @ApiProperty({ example: 'Error de digitación en el comprobante' })
  @IsString()
  @MinLength(5, { message: 'El motivo de anulación es obligatorio' })
  motivo!: string;
}
