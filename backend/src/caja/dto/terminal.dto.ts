import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Terminal = cajón físico de cobro. El nombre se normaliza a MAYÚSCULAS en el
 * service; aquí solo se valida el formato para evitar "caja 1", "Caja-1", etc.
 */
export class CrearTerminalDto {
  @ApiProperty({ example: 'clx123...', description: 'Sucursal donde vive el terminal.' })
  @IsString()
  sucursalId!: string;

  @ApiProperty({ example: 'CAJA-01', description: 'Formato CAJA-NN.' })
  @IsString()
  @MinLength(3)
  @Matches(/^CAJA-\d{2}$/i, { message: 'Formato de terminal inválido: usa CAJA-01, CAJA-02, …' })
  nombre!: string;
}

export class ActualizarTerminalDto {
  @ApiPropertyOptional({ example: 'CAJA-02' })
  @IsOptional()
  @IsString()
  @Matches(/^CAJA-\d{2}$/i, { message: 'Formato de terminal inválido: usa CAJA-01, CAJA-02, …' })
  nombre?: string;

  @ApiPropertyOptional({ description: 'Desactivar el terminal (no se borra: conserva histórico).' })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
