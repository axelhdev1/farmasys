import { IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CambiarPasswordDto {
  @ApiProperty({ example: 'NuevaClave1234', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @Matches(/\d/, { message: 'La contraseña debe incluir al menos un número' })
  password!: string;
}
