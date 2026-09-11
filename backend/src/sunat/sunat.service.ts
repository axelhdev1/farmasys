import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TipoComprobanteElectronico } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PSE_PROVIDER, PseProvider } from './pse.interface';

/**
 * Orquesta la emisión electrónica: arma el comprobante desde la venta, lo envía
 * al PSE/OSE (vía contrato inyectado) y persiste estado/hash/CDR. Pensado para
 * ejecutarse en background (cola BullMQ) en producción: aquí es síncrono.
 */
@Injectable()
export class SunatService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PSE_PROVIDER) private readonly pse: PseProvider,
  ) {}

  private mapTipo(tipoVenta: string): TipoComprobanteElectronico {
    return tipoVenta === 'FACTURA' ? 'FACTURA' : 'BOLETA';
  }

  /** Emite (o reintenta) el comprobante electrónico de una venta. */
  async emitir(ventaId: string) {
    const venta = await this.prisma.venta.findUnique({
      where: { id: ventaId },
      include: { items: { include: { producto: true } }, cliente: true },
    });
    if (!venta) throw new NotFoundException('Venta no encontrada');
    if (venta.estado === 'ANULADA') {
      throw new BadRequestException('No se emite comprobante de una venta anulada');
    }

    // Idempotente: si ya hay comprobante aceptado, lo devuelve.
    const existente = await this.prisma.comprobanteElectronico.findUnique({
      where: { ventaId },
    });
    if (existente && existente.estado === 'ACEPTADO') return existente;

    const tipo = this.mapTipo(venta.tipoComprobante);
    const [serie, numeroStr] = venta.numeroComprobante.split('-');
    const numero = Number(numeroStr);

    const respuesta = await this.pse.enviar({
      tipo,
      serie,
      numero,
      total: venta.total.toFixed(2),
      igv: venta.igv.toFixed(2),
      cliente: venta.cliente
        ? {
            tipoDocumento: venta.cliente.tipoDocumento,
            numeroDocumento: venta.cliente.numeroDocumento,
            nombre: venta.cliente.razonSocial ?? `${venta.cliente.nombres} ${venta.cliente.apellidos ?? ''}`.trim(),
          }
        : undefined,
      items: venta.items.map((it) => ({
        descripcion: it.producto.nombre,
        cantidad: it.cantidad,
        precio: it.precioUnitario.toFixed(2),
      })),
    });

    const estado = respuesta.estado === 'ACEPTADO'
      ? 'ACEPTADO'
      : respuesta.estado === 'RECHAZADO'
        ? 'RECHAZADO'
        : 'ENVIADO';

    const data = {
      tipo,
      serie,
      numero,
      estado: estado as 'ACEPTADO' | 'RECHAZADO' | 'ENVIADO',
      hash: respuesta.hash,
      xml: respuesta.xml,
      cdr: respuesta.cdr,
      ticketSunat: respuesta.ticket,
      observaciones: respuesta.observaciones,
      enviadoEn: new Date(),
      aceptadoEn: estado === 'ACEPTADO' ? new Date() : null,
    };

    return this.prisma.comprobanteElectronico.upsert({
      where: { ventaId },
      create: { ventaId, ...data },
      update: data,
    });
  }

  /** Emite una nota de crédito que anula el comprobante de una venta. */
  async emitirNotaCredito(ventaId: string, motivo: string) {
    const original = await this.prisma.comprobanteElectronico.findUnique({
      where: { ventaId },
    });
    if (!original) throw new NotFoundException('La venta no tiene comprobante emitido');

    const venta = await this.prisma.venta.findUnique({
      where: { id: ventaId },
      include: { items: { include: { producto: true } } },
    });
    if (!venta) throw new NotFoundException('Venta no encontrada');

    const respuesta = await this.pse.enviar({
      tipo: 'NOTA_CREDITO',
      serie: `NC${original.serie.slice(1)}`,
      numero: original.numero,
      total: venta.total.toFixed(2),
      igv: venta.igv.toFixed(2),
      items: venta.items.map((it) => ({
        descripcion: it.producto.nombre,
        cantidad: it.cantidad,
        precio: it.precioUnitario.toFixed(2),
      })),
    });

    await this.prisma.comprobanteElectronico.update({
      where: { ventaId },
      data: { estado: 'ANULADO', observaciones: `Nota de crédito: ${motivo}` },
    });

    return { ok: true, notaCredito: respuesta };
  }

  async estado(ventaId: string) {
    const comp = await this.prisma.comprobanteElectronico.findUnique({
      where: { ventaId },
    });
    if (!comp) throw new NotFoundException('Comprobante no encontrado');
    return comp;
  }
}
