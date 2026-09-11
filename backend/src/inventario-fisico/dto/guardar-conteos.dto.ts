import { ArrayMinSize, IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ConteoLineaDto {
  @ApiProperty()
  @IsString()
  itemId!: string;

  @ApiProperty({ example: 12, description: 'Unidades contadas físicamente.' })
  @IsInt()
  @Min(0)
  contadaCantidad!: number;
}

export class GuardarConteosDto {
  @ApiProperty({ type: [ConteoLineaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConteoLineaDto)
  items!: ConteoLineaDto[];
}
