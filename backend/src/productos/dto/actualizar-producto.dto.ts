import { OmitType, PartialType } from '@nestjs/swagger';
import { CrearProductoDto } from './crear-producto.dto';

/**
 * Actualiza datos del producto. Las presentaciones se gestionan por sus propios
 * endpoints (POST/PATCH/DELETE /productos/:id/presentaciones) para no perder
 * referencias en ventas históricas; por eso se omiten aquí.
 */
export class ActualizarProductoDto extends PartialType(
  OmitType(CrearProductoDto, ['presentaciones'] as const),
) {}
