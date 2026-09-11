import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActualizarConfiguracionDto } from './dto/actualizar-configuracion.dto';
import { JwtPayload } from '../auth/auth.types';
import { rucValido } from '../clientes/documento.util';

const ID = 'global';

/**
 * Normaliza cualquier valor de configuración a texto comparable, para detectar
 * si un campo cambió de verdad. Sin esto, un Decimal(18) de la base y un 18
 * del formulario parecerían distintos y ensuciarían la bitácora con cambios
 * que nadie hizo.
 */
function aTexto(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Prisma.Decimal) return v.toDecimalPlaces(2).toString();
  if (typeof v === 'number') return new Prisma.Decimal(v).toDecimalPlaces(2).toString();
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  return String(v);
}

@Injectable()
export class ConfiguracionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Devuelve la configuración global; la crea con defaults si aún no existe. */
  async obtener() {
    return this.prisma.configuracion.upsert({
      where: { id: ID },
      update: {},
      create: { id: ID },
    });
  }

  async actualizar(dto: ActualizarConfiguracionDto, user?: JwtPayload) {
    // El DTO ya exige 11 dígitos, pero eso no distingue un RUC real de un
    // número tecleado al azar. Este es el RUC del EMISOR: va en todos los
    // comprobantes, y un dígito mal puesto lo descubre SUNAT rechazándolos
    // todos. El validador módulo 11 ya existía para los clientes; faltaba
    // aplicarlo aquí.
    if (dto.ruc !== undefined && dto.ruc.trim() && !rucValido(dto.ruc.trim())) {
      throw new BadRequestException(
        'El RUC no es válido (falla el dígito verificador). Revisa el número: ' +
          'un error aquí hace que SUNAT rechace todos los comprobantes.',
      );
    }

    // Sin anotar el tipo: el objeto inferido (campos planos) sirve tanto para
    // `update` como para `create` del upsert (los tipos de campo difieren entre
    // ambos en Prisma, y un objeto plano es compatible con los dos).
    const data = {
      ...(dto.razonSocial !== undefined && { razonSocial: dto.razonSocial.trim() }),
      ...(dto.ruc !== undefined && { ruc: dto.ruc.trim() }),
      ...(dto.direccionFiscal !== undefined && { direccionFiscal: dto.direccionFiscal.trim() }),
      ...(dto.telefono !== undefined && { telefono: dto.telefono.trim() }),
      ...(dto.email !== undefined && { email: dto.email.trim() }),
      ...(dto.directorTecnico !== undefined && { directorTecnico: dto.directorTecnico.trim() }),
      ...(dto.colegiatura !== undefined && { colegiatura: dto.colegiatura.trim() }),
      ...(dto.registroSanitario !== undefined && { registroSanitario: dto.registroSanitario.trim() }),
      ...(dto.licenciaFuncionamiento !== undefined && { licenciaFuncionamiento: dto.licenciaFuncionamiento.trim() }),
      ...(dto.igvPorcentaje !== undefined && { igvPorcentaje: new Prisma.Decimal(dto.igvPorcentaje) }),
      ...(dto.moneda !== undefined && { moneda: dto.moneda }),
      ...(dto.simbolo !== undefined && { simbolo: dto.simbolo }),
      ...(dto.pieTicket !== undefined && { pieTicket: dto.pieTicket }),
      ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
      ...(dto.logoEnTicket !== undefined && { logoEnTicket: dto.logoEnTicket }),
      ...(dto.tipoImpresion !== undefined && { tipoImpresion: dto.tipoImpresion }),
      ...(dto.alertaVencimientoDias !== undefined && { alertaVencimientoDias: dto.alertaVencimientoDias }),
      ...(dto.stockMinimoDefault !== undefined && { stockMinimoDefault: dto.stockMinimoDefault }),
      ...(dto.umbralDescuadreCaja !== undefined && {
        umbralDescuadreCaja: new Prisma.Decimal(dto.umbralDescuadreCaja),
      }),
    };

    // Estado previo, para saber qué cambió realmente.
    const antes = await this.obtener();
    const cambios = Object.entries(data)
      .map(([campo, valor]) => ({
        campo,
        anterior: aTexto((antes as Record<string, unknown>)[campo]),
        nuevo: aTexto(valor),
      }))
      .filter((c) => c.anterior !== c.nuevo);

    // Guardado y bitácora en la MISMA transacción: si el registro falla, el
    // cambio tampoco entra. Un ajuste de dinero que se aplica sin dejar rastro
    // es justo lo que esta bitácora existe para impedir.
    return this.prisma.$transaction(async (tx) => {
      const config = await tx.configuracion.upsert({
        where: { id: ID },
        update: data,
        create: { id: ID, ...data },
      });
      if (cambios.length) {
        await tx.cambioConfiguracion.createMany({
          data: cambios.map((c) => ({
            usuarioId: user?.sub ?? null,
            email: user?.email ?? 'desconocido',
            campo: c.campo,
            anterior: c.anterior,
            nuevo: c.nuevo,
          })),
        });
      }
      return config;
    });
  }

  /** Bitácora de cambios, del más reciente al más antiguo. */
  async historial(limite = 50) {
    const registros = await this.prisma.cambioConfiguracion.findMany({
      orderBy: { fecha: 'desc' },
      take: Math.min(Math.max(limite, 1), 200),
      include: { usuario: { select: { nombres: true, apellidos: true } } },
    });
    return registros.map((r) => ({
      id: r.id,
      campo: r.campo,
      anterior: r.anterior,
      nuevo: r.nuevo,
      fecha: r.fecha,
      email: r.email,
      // Si la cuenta se borró, queda el email: el rastro no se pierde.
      nombre: r.usuario ? `${r.usuario.nombres} ${r.usuario.apellidos}`.trim() : r.email,
    }));
  }
}
