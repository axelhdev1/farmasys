import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoAfectacionIgv } from '@prisma/client';
import { PresentacionDto } from './presentacion.dto';
import { FORMAS_FARMACEUTICAS } from '../formas-farmaceuticas';

export class CrearProductoDto {
  @ApiProperty({ example: 'PARA500', description: 'Código interno único.' })
  @IsString()
  @MinLength(1)
  codigo!: string;

  @ApiProperty({ example: 'Paracetamol 500mg' })
  @IsString()
  @MinLength(2)
  nombre!: string;

  @ApiPropertyOptional({ example: 'Paracetamol' })
  @IsOptional()
  @IsString()
  principioActivo?: string;

  @ApiPropertyOptional({ example: '500mg' })
  @IsOptional()
  @IsString()
  concentracion?: string;

  @ApiPropertyOptional({ enum: FORMAS_FARMACEUTICAS, example: 'TABLETA' })
  @IsOptional()
  @IsIn(FORMAS_FARMACEUTICAS as unknown as string[], {
    message: 'Forma farmacéutica inválida',
  })
  formaFarmaceutica?: string;

  @ApiProperty({ example: 'Analgésicos' })
  @IsString()
  @MinLength(2)
  categoria!: string;

  @ApiPropertyOptional({ example: 'Genfar' })
  @IsOptional()
  @IsString()
  laboratorio?: string;

  @ApiPropertyOptional({ example: 'Estante A-3' })
  @IsOptional()
  @IsString()
  ubicacion?: string;

  @ApiPropertyOptional({ example: 'EN-12345' })
  @IsOptional()
  @IsString()
  registroSanitario?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  esGenerico?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiereReceta?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  controlado?: boolean;

  @ApiPropertyOptional({ enum: TipoAfectacionIgv, default: TipoAfectacionIgv.GRAVADO })
  @IsOptional()
  @IsEnum(TipoAfectacionIgv)
  afectacionIgv?: TipoAfectacionIgv;

  @ApiPropertyOptional({ example: 'unidad', default: 'unidad' })
  @IsOptional()
  @IsString()
  unidadBase?: string;

  /**
   * Stock mínimo sugerido. Se hereda a la fila de stock de cada sucursal la
   * primera vez que el producto entra ahí. Si es 0, se usa el default global
   * de Configuración. Sin un mínimo > 0 las alertas de stock bajo no suenan.
   */
  @ApiPropertyOptional({ example: 10, description: 'Stock mínimo para alertas (0 = usar el global).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockMinimo?: number;

  @ApiProperty({ type: [PresentacionDto], description: 'Al menos una presentación.' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Define al menos una presentación' })
  @ValidateNested({ each: true })
  @Type(() => PresentacionDto)
  presentaciones!: PresentacionDto[];
}
