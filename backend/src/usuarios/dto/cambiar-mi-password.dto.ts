import { IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Cambio de la PROPIA contraseña. Exige la actual para confirmar identidad y
 * una nueva que cumpla la política (mínimo 8 caracteres y al menos un número).
 */
export class CambiarMiPasswordDto {
  @ApiProperty({ description: 'Contraseña actual (para confirmar identidad).' })
  @IsString()
  actual!: string;

  @ApiProperty({ example: 'NuevaClave1', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La nueva contraseña debe tener al menos 8 caracteres' })
  @Matches(/\d/, { message: 'La nueva contraseña debe incluir al menos un número' })
  nueva!: string;
}
