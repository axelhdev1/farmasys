import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoSucursal } from '@prisma/client';

export class CrearSucursalDto {
  @ApiProperty({ example: 'Botica San José' })
  @IsString()
  @MinLength(2)
  nombre!: string;

  @ApiPropertyOptional({ example: 'Miraflores' })
  @IsOptional()
  @IsString()
  distrito?: string;

  @ApiPropertyOptional({ example: 'Av. Larco 456' })
  @IsOptional()
  @IsString()
  direccion?: string;

  @ApiPropertyOptional({ example: '(01) 555-1234' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional({ enum: EstadoSucursal, default: EstadoSucursal.ACTIVA })
  @IsOptional()
  @IsEnum(EstadoSucursal)
  estado?: EstadoSucursal;

  // Las series llevan la letra del tipo de comprobante: B=boleta, F=factura,
  // T=ticket interno. Así no se cruzan entre sí por error.
  @ApiPropertyOptional({ example: 'B001', description: 'Serie de boleta (formato BNNN).' })
  @IsOptional()
  @Matches(/^B\d{3}$/, { message: 'Serie de boleta inválida: debe ser B + 3 dígitos (ej. B001)' })
  serieBoleta?: string;

  @ApiPropertyOptional({ example: 'F001', description: 'Serie de factura (formato FNNN).' })
  @IsOptional()
  @Matches(/^F\d{3}$/, { message: 'Serie de factura inválida: debe ser F + 3 dígitos (ej. F001)' })
  serieFactura?: string;

  @ApiPropertyOptional({ example: 'T001', description: 'Serie del ticket interno (formato TNNN).' })
  @IsOptional()
  @Matches(/^T\d{3}$/, { message: 'Serie de ticket inválida: debe ser T + 3 dígitos (ej. T001)' })
  serieTicket?: string;

  @ApiPropertyOptional({ description: 'URL/clave del QR Yape.' })
  @IsOptional()
  @IsString()
  qrYape?: string;

  @ApiPropertyOptional({ description: 'URL/clave del QR Plin.' })
  @IsOptional()
  @IsString()
  qrPlin?: string;

  @ApiPropertyOptional({ description: 'Id del usuario responsable/encargado de la botica.' })
  @IsOptional()
  @IsString()
  responsableId?: string;

  @ApiPropertyOptional({ example: 'central@farmasys.pe' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsString()
  horarioApertura?: string;

  @ApiPropertyOptional({ example: '22:00' })
  @IsOptional()
  @IsString()
  horarioCierre?: string;

  @ApiPropertyOptional({ example: 50000, description: 'Meta de venta mensual (S/).' })
  @IsOptional()
  @IsNumber()
  metaVentaMensual?: number;

  @ApiPropertyOptional({ description: 'Latitud (para el mapa, uso futuro).' })
  @IsOptional()
  @IsNumber()
  latitud?: number;

  @ApiPropertyOptional({ description: 'Longitud (para el mapa, uso futuro).' })
  @IsOptional()
  @IsNumber()
  longitud?: number;
}
