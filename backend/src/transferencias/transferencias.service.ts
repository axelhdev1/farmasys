import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrearTransferenciaDto } from './dto/crear-transferencia.dto';
import {
  resolverStockMinimo,
  stockMinimoDefaultGlobal,
} from '../inventario/stock-minimo.util';

@Injectable()
export class TransferenciasService {
  constructor(private readonly prisma: PrismaService) {}

  private hoy(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Traslada stock entre sucursales de forma ATÓMICA, preservando lotes y
   * vencimientos: sale de la sucursal origen por FEFO (TRASLADO_SALIDA) y
   * entra a destino al MISMO lote/vencimiento (TRASLADO_INGRESO). No toca el
   * flujo de venta.
   */
  async crear(dto: CrearTransferenciaDto, userId: string) {
    if (dto.origenId === dto.destinoId) {
      throw new BadRequestException('El origen y el destino deben ser distintos');
    }

    return this.prisma.$transaction(async (tx) => {
      const numero = await this.siguienteNumero(tx);
      const transferencia = await tx.transferencia.create({
        data: {
          numero,
          origenId: dto.origenId,
          destinoId: dto.destinoId,
          motivo: dto.motivo?.trim() || null,
          registradoPor: userId,
          items: {
            create: dto.items.map((i) => ({
              productoId: i.productoId,
              cantidadBase: i.cantidadBase,
            })),
          },
        },
      });

      for (const item of dto.items) {
        await this.trasladarProducto(
          tx,
          item.productoId,
          dto.origenId,
          dto.destinoId,
          item.cantidadBase,
          transferencia.id,
          numero,
          userId,
        );
      }

      return tx.transferencia.findUnique({
        where: { id: transferencia.id },
        include: { items: true },
      });
    });
  }

  /** Traslada un producto de origen→destino respetando lotes y vencimientos. */
  private async trasladarProducto(
    tx: Prisma.TransactionClient,
    productoId: string,
    origenId: string,
    destinoId: string,
    cantidadBase: number,
    referenciaId: string,
    numero: string,
    registradoPor?: string,
  ): Promise<void> {
    // Lotes vendibles del origen, FEFO (primero el que vence antes).
    const lotes = await tx.lote.findMany({
      where: {
        productoId,
        sucursalId: origenId,
        cantidadBase: { gt: 0 },
        vencimiento: { gte: this.hoy() },
      },
      orderBy: { vencimiento: 'asc' },
    });
    const disponible = lotes.reduce((a, l) => a + l.cantidadBase, 0);
    if (disponible < cantidadBase) {
      throw new BadRequestException(
        `Stock insuficiente en origen (disponible ${disponible}, requerido ${cantidadBase})`,
      );
    }

    let restante = cantidadBase;
    for (const lote of lotes) {
      if (restante <= 0) break;
      const tomar = Math.min(lote.cantidadBase, restante);

      // Salida del lote de origen.
      await tx.lote.update({
        where: { id: lote.id },
        data: { cantidadBase: lote.cantidadBase - tomar },
      });

      // Entrada al MISMO lote/vencimiento en destino (crea si no existe).
      const loteDestino = await tx.lote.findFirst({
        where: { productoId, sucursalId: destinoId, lote: lote.lote, vencimiento: lote.vencimiento },
      });
      if (loteDestino) {
        await tx.lote.update({
          where: { id: loteDestino.id },
          data: { cantidadBase: { increment: tomar } },
        });
      } else {
        await tx.lote.create({
          data: {
            productoId,
            sucursalId: destinoId,
            lote: lote.lote,
            vencimiento: lote.vencimiento,
            cantidadBase: tomar,
          },
        });
      }

      // Kardex en ambas sucursales.
      await tx.movimientoStock.create({
        data: {
          productoId, sucursalId: origenId, tipo: 'TRASLADO_SALIDA',
          cantidadBase: -tomar, motivo: `Transferencia ${numero}`, referenciaId, loteId: lote.id,
          registradoPor,
        },
      });
      await tx.movimientoStock.create({
        data: {
          productoId, sucursalId: destinoId, tipo: 'TRASLADO_INGRESO',
          cantidadBase: tomar, motivo: `Transferencia ${numero}`, referenciaId,
          registradoPor,
        },
      });

      restante -= tomar;
    }

    // ── Stock agregado: baja en origen, sube en destino ──────────────────
    //
    // EL COSTO VIAJA CON LA MERCADERÍA. Antes solo se movía la cantidad: el
    // destino recibía el producto con costoPromedio nulo (o con el suyo viejo,
    // sin recalcular). Consecuencias reales:
    //   · esas unidades se vendían con costo 0 → Finanzas mostraba 100% de
    //     margen en esa botica, que es falso;
    //   · el valor del inventario del destino salía en S/ 0 aunque tuviera
    //     mercadería física.
    // Se recalcula el promedio ponderado en destino igual que hace una compra.
    const stockOrigen = await tx.stockSucursal.findUnique({
      where: { productoId_sucursalId: { productoId, sucursalId: origenId } },
      select: { costoPromedio: true },
    });
    const costoOrigen = stockOrigen?.costoPromedio ?? new Prisma.Decimal(0);

    await tx.stockSucursal.update({
      where: { productoId_sucursalId: { productoId, sucursalId: origenId } },
      // El costo promedio del ORIGEN no cambia al sacar unidades: sacar al
      // costo medio no altera el costo medio de lo que queda.
      data: { cantidadBase: { decrement: cantidadBase } },
    });

    // Si el producto llega por primera vez a la sucursal destino, su fila de
    // stock nacía además con mínimo 0 y esa botica nunca recibía alerta de
    // stock bajo para ese producto.
    const prod = await tx.producto.findUnique({
      where: { id: productoId },
      select: { stockMinimo: true },
    });
    const minimoGlobal = await stockMinimoDefaultGlobal(tx);

    const stockDestino = await tx.stockSucursal.findUnique({
      where: { productoId_sucursalId: { productoId, sucursalId: destinoId } },
      select: { cantidadBase: true, costoPromedio: true },
    });

    // Promedio ponderado: (qDestino×cDestino + qTransferida×cOrigen) / total.
    const qDestino = stockDestino?.cantidadBase ?? 0;
    const cDestino = stockDestino?.costoPromedio ?? new Prisma.Decimal(0);
    const qTotal = qDestino + cantidadBase;
    const costoDestino = qTotal > 0
      ? cDestino.times(qDestino).plus(costoOrigen.times(cantidadBase)).dividedBy(qTotal)
      : costoOrigen;

    await tx.stockSucursal.upsert({
      where: { productoId_sucursalId: { productoId, sucursalId: destinoId } },
      create: {
        productoId,
        sucursalId: destinoId,
        cantidadBase,
        costoPromedio: costoOrigen,
        stockMinimo: resolverStockMinimo(prod?.stockMinimo, minimoGlobal),
      },
      update: {
        cantidadBase: { increment: cantidadBase },
        costoPromedio: costoDestino,
      },
    });
  }

  private async siguienteNumero(tx: Prisma.TransactionClient): Promise<string> {
    const n = await tx.transferencia.count();
    return `TR-${String(n + 1).padStart(6, '0')}`;
  }

  /** Historial de transferencias donde la sucursal participa (origen o destino). */
  async listar(sucursalId?: string) {
    return this.prisma.transferencia.findMany({
      where: sucursalId
        ? { OR: [{ origenId: sucursalId }, { destinoId: sucursalId }] }
        : {},
      include: {
        items: { include: { producto: { select: { nombre: true, codigo: true } } } },
        origen: { select: { nombre: true } },
        destino: { select: { nombre: true } },
        usuario: { select: { nombres: true, apellidos: true } },
      },
      orderBy: { fecha: 'desc' },
      take: 200,
    });
  }
}
