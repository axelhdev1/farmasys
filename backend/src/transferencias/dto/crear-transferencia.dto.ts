import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransferenciaItemDto {
  @ApiProperty()
  @IsString()
  productoId!: string;

  @ApiProperty({ example: 10, description: 'Unidades base a trasladar.' })
  @IsInt()
  @Min(1)
  cantidadBase!: number;
}

export class CrearTransferenciaDto {
  @ApiProperty()
  @IsString()
  origenId!: string;

  @ApiProperty()
  @IsString()
  destinoId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;

  @ApiProperty({ type: [TransferenciaItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Agrega al menos un producto a transferir' })
  @ValidateNested({ each: true })
  @Type(() => TransferenciaItemDto)
  items!: TransferenciaItemDto[];
}
