import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * Una fila del archivo de importación. Varias filas con el MISMO código
 * son el mismo producto con distintas presentaciones (caja/blíster/unidad).
 */
export class FilaImportacionDto {
  @IsString()
  codigo!: string;

  @IsString()
  nombre!: string;

  @IsOptional() @IsString()
  principioActivo?: string;

  @IsOptional() @IsString()
  concentracion?: string;

  @IsString()
  categoria!: string;

  @IsOptional() @IsString()
  laboratorio?: string;

  @IsOptional() @IsString()
  ubicacion?: string;

  @IsOptional() @IsString()
  registroSanitario?: string;

  @IsOptional() @IsBoolean()
  esGenerico?: boolean;

  @IsOptional() @IsBoolean()
  requiereReceta?: boolean;

  @IsOptional() @IsBoolean()
  controlado?: boolean;

  @IsOptional() @IsString()
  unidadBase?: string;

  @IsString()
  presentacionNombre!: string;

  @IsNumber()
  factor!: number;

  @IsNumber()
  precioVenta!: number;

  @IsOptional() @IsString()
  codigoBarras?: string;

  @IsOptional() @IsBoolean()
  esBase?: boolean;

  /** Número de fila en el archivo original (para el reporte de errores). */
  @IsOptional() @IsNumber()
  filaArchivo?: number;
}

export class ImportarCatalogoDto {
  /** true = solo validar y reportar, sin escribir nada en la BD. */
  @IsBoolean()
  simular!: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilaImportacionDto)
  filas!: FilaImportacionDto[];
}
