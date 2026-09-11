import { PartialType } from '@nestjs/swagger';
import { CrearSucursalDto } from './crear-sucursal.dto';

/**
 * Actualización parcial de una sucursal. Hereda todas las validaciones de
 * CrearSucursalDto pero con todos los campos opcionales (PartialType).
 */
export class ActualizarSucursalDto extends PartialType(CrearSucursalDto) {}
