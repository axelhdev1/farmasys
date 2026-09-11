import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class DevolucionItemDto {
  @ApiProperty({ description: 'Id del ítem de la venta que se devuelve.' })
  @IsString()
  ventaItemId!: string;

  @ApiProperty({ example: 1, description: 'Cantidad (de la presentación) a devolver.' })
  @IsInt()
  @Min(1)
  cantidad!: number;
}

export class CrearDevolucionDto {
  @ApiProperty({ description: 'Id de la venta a la que pertenece la devolución.' })
  @IsString()
  ventaId!: string;

  @ApiProperty({ example: 'Producto en mal estado' })
  @IsString()
  @MinLength(4, { message: 'Indica un motivo (mín. 4 caracteres)' })
  motivo!: string;

  @ApiProperty({ type: [DevolucionItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecciona al menos un producto a devolver' })
  @ValidateNested({ each: true })
  @Type(() => DevolucionItemDto)
  items!: DevolucionItemDto[];
}
