import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventarioService } from '../inventario/inventario.service';
import { CrearDevolucionDto } from './dto/crear-devolucion.dto';

@Injectable()
export class DevolucionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventario: InventarioService,
  ) {}

  /**
   * Registra una devolución (parcial o total) de forma ATÓMICA:
   *  1. Valida que no se devuelva más de lo vendido (menos lo ya devuelto).
   *  2. Reingresa el stock al inventario (y a un lote) + movimiento.
   *  3. Crea la devolución + sus ítems.
   *  4. Si el usuario tiene caja abierta, registra el egreso de efectivo
   *     (para que el arqueo cuadre).
   */
  async crear(dto: CrearDevolucionDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const venta = await tx.venta.findUnique({
        where: { id: dto.ventaId },
        include: { items: true, devoluciones: { include: { items: true } } },
      });
      if (!venta) throw new NotFoundException('Venta no encontrada');
      if (venta.estado === 'ANULADA') {
        throw new BadRequestException('La venta está anulada; no admite devoluciones');
      }

      // Cantidades ya devueltas por ítem de venta.
      const yaDevuelto = new Map<string, number>();
      for (const d of venta.devoluciones) {
        for (const di of d.items) {
          yaDevuelto.set(di.ventaItemId, (yaDevuelto.get(di.ventaItemId) ?? 0) + di.cantidad);
        }
      }
      const itemsVenta = new Map(venta.items.map((i) => [i.id, i]));

      let monto = new Prisma.Decimal(0);
      const itemsCrear: Array<{
        ventaItemId: string;
        productoId: string;
        cantidad: number;
        cantidadBase: number;
        subtotal: Prisma.Decimal;
      }> = [];

      for (const it of dto.items) {
        const vi = itemsVenta.get(it.ventaItemId);
        if (!vi) throw new BadRequestException('Ítem de venta inválido');

        const disponible = vi.cantidad - (yaDevuelto.get(vi.id) ?? 0);
        if (it.cantidad < 1 || it.cantidad > disponible) {
          throw new BadRequestException(
            `No puedes devolver ${it.cantidad}; disponible para devolver: ${disponible}`,
          );
        }

        const factor = vi.cantidad > 0 ? vi.cantidadBase / vi.cantidad : 1;
        const cantidadBase = Math.round(factor * it.cantidad);
        const subtotal = new Prisma.Decimal(vi.precioUnitario).times(it.cantidad);
        monto = monto.plus(subtotal);

        // Reingreso al/los LOTE(S) ORIGINAL(ES) de la venta (kardex FEFO),
        // descontando lo ya devuelto antes → soporta devoluciones parciales.
        await this.inventario.reingresarStock(tx, {
          productoId: vi.productoId,
          sucursalId: venta.sucursalId,
          cantidadBase,
          referenciaId: venta.id,
          motivo: `Devolución venta ${venta.numeroComprobante}`,
          registradoPor: userId,
        });

        itemsCrear.push({
          ventaItemId: vi.id,
          productoId: vi.productoId,
          cantidad: it.cantidad,
          cantidadBase,
          subtotal,
        });
      }

      const devolucion = await tx.devolucion.create({
        data: {
          ventaId: venta.id,
          sucursalId: venta.sucursalId,
          motivo: dto.motivo.trim(),
          monto,
          registradoPor: userId,
          items: { create: itemsCrear },
        },
        include: { items: true },
      });

      // Egreso de efectivo en la caja abierta del usuario (si tiene una).
      const caja = await tx.cajaSesion.findFirst({
        where: { cajeroId: userId, sucursalId: venta.sucursalId, estado: 'ABIERTA' },
      });
      if (caja) {
        await tx.movimientoCaja.create({
          data: {
            cajaSesionId: caja.id,
            tipo: 'EGRESO',
            categoria: 'DEVOLUCION',
            monto,
            motivo: `Devolución venta ${venta.numeroComprobante}`,
          },
        });
      }

      return devolucion;
    });
  }

  /** Lista devoluciones (opcionalmente de una venta o sucursal). */
  async listar(params: { ventaId?: string; sucursalId?: string }) {
    return this.prisma.devolucion.findMany({
      where: {
        ...(params.ventaId ? { ventaId: params.ventaId } : {}),
        ...(params.sucursalId ? { sucursalId: params.sucursalId } : {}),
      },
      include: {
        items: true,
        venta: { select: { numeroComprobante: true } },
        usuario: { select: { nombres: true, apellidos: true } },
      },
      orderBy: { fecha: 'desc' },
      take: 200,
    });
  }
}
