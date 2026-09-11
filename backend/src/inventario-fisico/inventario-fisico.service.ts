import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GuardarConteosDto } from './dto/guardar-conteos.dto';

@Injectable()
export class InventarioFisicoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Abre una sesión de conteo: toma una "foto" de los lotes con stock de la
   * sucursal. Solo puede haber una sesión EN_PROCESO por sucursal.
   */
  async abrir(sucursalId: string, userId: string) {
    const abierta = await this.prisma.conteoInventario.findFirst({
      where: { sucursalId, estado: 'EN_PROCESO' },
    });
    if (abierta) {
      throw new BadRequestException('Ya hay un conteo en proceso en esta sucursal');
    }

    const lotes = await this.prisma.lote.findMany({
      where: { sucursalId, cantidadBase: { gt: 0 } },
      include: { producto: { select: { nombre: true } } },
      orderBy: { vencimiento: 'asc' },
    });

    return this.prisma.conteoInventario.create({
      data: {
        sucursalId,
        registradoPor: userId,
        items: {
          create: lotes.map((l) => ({
            loteId: l.id,
            productoId: l.productoId,
            productoNombre: l.producto?.nombre ?? l.productoId,
            loteNumero: l.lote,
            vencimiento: l.vencimiento,
            sistemaCantidad: l.cantidadBase,
          })),
        },
      },
      include: { items: true },
    });
  }

  /** Sesión EN_PROCESO de una sucursal (con sus ítems), o null. */
  async actual(sucursalId: string) {
    return this.prisma.conteoInventario.findFirst({
      where: { sucursalId, estado: 'EN_PROCESO' },
      include: { items: { orderBy: { productoNombre: 'asc' } } },
    });
  }

  /** Guarda las cantidades contadas (parcial: solo actualiza las enviadas). */
  async guardar(conteoId: string, dto: GuardarConteosDto) {
    const conteo = await this.prisma.conteoInventario.findUnique({ where: { id: conteoId } });
    if (!conteo) throw new NotFoundException('Conteo no encontrado');
    if (conteo.estado !== 'EN_PROCESO') {
      throw new BadRequestException('El conteo ya está cerrado');
    }
    await this.prisma.$transaction(
      dto.items.map((i) =>
        this.prisma.conteoItem.updateMany({
          where: { id: i.itemId, conteoId },
          data: { contadaCantidad: i.contadaCantidad },
        }),
      ),
    );
    return { ok: true, guardados: dto.items.length };
  }

  /**
   * Cierra el conteo y AJUSTA el stock a lo contado, lote por lote. El delta se
   * calcula contra la cantidad ACTUAL del lote (no la foto), para no pisar
   * ventas ocurridas durante el conteo. Todo atómico.
   */
  async cerrar(conteoId: string, observacion?: string, registradoPor?: string) {
    return this.prisma.$transaction(async (tx) => {
      const conteo = await tx.conteoInventario.findUnique({
        where: { id: conteoId },
        include: { items: true },
      });
      if (!conteo) throw new NotFoundException('Conteo no encontrado');
      if (conteo.estado !== 'EN_PROCESO') {
        throw new BadRequestException('El conteo ya está cerrado');
      }

      let ajustados = 0;
      for (const item of conteo.items) {
        if (item.contadaCantidad == null) continue; // no contado → sin cambio
        const lote = await tx.lote.findUnique({ where: { id: item.loteId } });
        if (!lote) continue; // lote ya no existe
        const delta = item.contadaCantidad - lote.cantidadBase;
        if (delta === 0) continue;

        await tx.lote.update({
          where: { id: lote.id },
          data: { cantidadBase: item.contadaCantidad },
        });
        await tx.stockSucursal.update({
          where: { productoId_sucursalId: { productoId: item.productoId, sucursalId: conteo.sucursalId } },
          data: { cantidadBase: { increment: delta } },
        });
        await tx.movimientoStock.create({
          data: {
            productoId: item.productoId,
            sucursalId: conteo.sucursalId,
            tipo: 'AJUSTE',
            cantidadBase: delta,
            motivo: `Conteo físico · Lote ${item.loteNumero} (${delta > 0 ? '+' : ''}${delta})`,
            referenciaId: conteo.id,
            loteId: lote.id,
            registradoPor,
          },
        });
        ajustados++;
      }

      await tx.conteoInventario.update({
        where: { id: conteoId },
        data: { estado: 'CERRADO', cerradoEn: new Date(), observacion: observacion?.trim() || null },
      });

      return { ok: true, ajustados };
    });
  }

  /** Detalle completo de un conteo (acta): ítems lote por lote. */
  async obtener(id: string) {
    const conteo = await this.prisma.conteoInventario.findUnique({
      where: { id },
      include: {
        items: { orderBy: { productoNombre: 'asc' } },
        usuario: { select: { nombres: true, apellidos: true } },
        sucursal: { select: { nombre: true } },
      },
    });
    if (!conteo) throw new NotFoundException('Conteo no encontrado');
    return conteo;
  }

  /** Historial de conteos cerrados de una sucursal. */
  async historial(sucursalId: string) {
    const conteos = await this.prisma.conteoInventario.findMany({
      where: { sucursalId, estado: 'CERRADO' },
      include: {
        items: { select: { sistemaCantidad: true, contadaCantidad: true } },
        usuario: { select: { nombres: true, apellidos: true } },
      },
      orderBy: { cerradoEn: 'desc' },
      take: 50,
    });
    return conteos.map((c) => {
      let sobrantes = 0;
      let faltantes = 0;
      for (const it of c.items) {
        if (it.contadaCantidad == null) continue;
        const d = it.contadaCantidad - it.sistemaCantidad;
        if (d > 0) sobrantes += d;
        else if (d < 0) faltantes += -d;
      }
      return {
        id: c.id,
        cerradoEn: c.cerradoEn,
        observacion: c.observacion,
        usuario: c.usuario,
        lineas: c.items.length,
        sobrantes,
        faltantes,
      };
    });
  }
}
