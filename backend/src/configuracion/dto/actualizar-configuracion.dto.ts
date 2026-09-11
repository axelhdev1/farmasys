import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Actualización de la configuración global (todos los campos opcionales).
 *
 * TODOS los números llevan techo a propósito. Antes solo tenían `@Min(0)`:
 * un dedo pegado (180 en vez de 18) se guardaba, la pantalla mostraba 180%
 * y el sistema seguía cobrando 18% porque `igv.util.ts` descarta lo absurdo.
 * Pantalla y realidad decían cosas distintas — peor que no tener el campo.
 * Con el tope, el error se rechaza en la cara del usuario y no llega a la base.
 */
export class ActualizarConfiguracionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  razonSocial?: string;

  @ApiPropertyOptional({ example: '20123456789' })
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'El RUC debe tener 11 dígitos' })
  ruc?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) direccionFiscal?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) telefono?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) directorTecnico?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) colegiatura?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) registroSanitario?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) licenciaFuncionamiento?: string;

  @ApiPropertyOptional({ example: 18, description: 'Porcentaje, no fracción: 18 = 18%.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50, { message: 'El IGV debe estar entre 0 y 50 %. En Perú hoy es 18.' })
  igvPorcentaje?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) moneda?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5) simbolo?: string;

  // El pie sale impreso en cada ticket: un texto larguísimo desperdicia papel
  // en todas las ventas del día.
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) pieTicket?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() logoEnTicket?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) tipoImpresion?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365, {
    message:
      'La alerta de vencimiento debe estar entre 1 y 365 días. ' +
      'Un valor enorme marca todo el inventario como "por vencer" y las alertas dejan de servir.',
  })
  alertaVencimientoDias?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000, {
    message:
      'El stock mínimo por defecto debe estar entre 0 y 1000. ' +
      'Un valor enorme deja todos los productos en alerta roja desde el primer día.',
  })
  stockMinimoDefault?: number;

  @ApiPropertyOptional({
    example: 20,
    description: 'Diferencia de efectivo (S/) a partir de la cual el cierre exige motivo.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000, {
    message:
      'El umbral de descuadre debe estar entre 0 y 1000 soles. ' +
      'Más alto equivale a desactivar el control: el cajero nunca tendría que justificar un faltante.',
  })
  umbralDescuadreCaja?: number;
}
