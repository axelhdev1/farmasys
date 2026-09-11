import { IsJWT } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token JWT emitido en el login.' })
  @IsJWT({ message: 'refreshToken inválido' })
  refreshToken!: string;
}
