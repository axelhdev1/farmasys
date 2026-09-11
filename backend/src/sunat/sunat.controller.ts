import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SunatService } from './sunat.service';
import { Roles } from '../auth/decorators/roles.decorator';

class NotaCreditoDto {
  @ApiProperty({ example: 'Anulación por devolución del cliente' })
  @IsString()
  @MinLength(5)
  motivo!: string;
}

@ApiTags('sunat')
@ApiBearerAuth('access-token')
@Roles('SUPER_ADMIN', 'ADMIN', 'FARMACEUTICO', 'VENDEDOR')
@Controller('sunat')
export class SunatController {
  constructor(private readonly sunat: SunatService) {}

  @Post('emitir/:ventaId')
  @ApiOperation({ summary: 'Emitir comprobante electrónico de una venta' })
  emitir(@Param('ventaId') ventaId: string) {
    return this.sunat.emitir(ventaId);
  }

  @Get('estado/:ventaId')
  @ApiOperation({ summary: 'Estado del comprobante electrónico de una venta' })
  estado(@Param('ventaId') ventaId: string) {
    return this.sunat.estado(ventaId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('nota-credito/:ventaId')
  @ApiOperation({ summary: 'Emitir nota de crédito (anula comprobante)' })
  notaCredito(@Param('ventaId') ventaId: string, @Body() dto: NotaCreditoDto) {
    return this.sunat.emitirNotaCredito(ventaId, dto.motivo);
  }
}
