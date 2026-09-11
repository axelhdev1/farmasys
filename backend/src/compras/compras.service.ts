import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { obtenerTasaIgv } from '../configuracion/igv.util';
import {
  resolverStockMinimo,
  stockMinimoDefaultGlobal,
} from '../inventario/stock-minimo.util';
import {
  ActualizarProveedorDto,
  CrearProveedorDto,
} from './dto/proveedor.dto';
import { CrearCompraDto } from './dto/crear-compra.dto';

// La tasa de IGV sale de Configuración (ver configuracion/igv.util.ts).

@Injectable()
export class ComprasService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Proveedores ──────────────────────────────────────────────────────────

  async crearProveedor(dto: CrearProveedorDto) {
    const existe = await this.prisma.proveedor.findUnique({ where: { ruc: dto.ruc } });
    if (existe) throw new ConflictException('Ya existe un proveedor con ese RUC');
    return this.prisma.proveedor.create({ data: { ...dto } });
  }

  async listarProveedores(incluirInactivos = false) {
    return this.prisma.proveedor.findMany({
      where: incluirInactivos ? {} : { activo: true },
      orderBy: { razonSocial: 'asc' },
    });
  }

  async obtenerProveedor(id: string) {
    const prov = await this.prisma.proveedor.findUnique({ where: { id } });
    if (!prov) throw new NotFoundException('Proveedor no encontrado');
    return prov;
  }

  async actualizarProveedor(id: string, dto: ActualizarProveedorDto) {
    await this.obtenerProveedor(id);
    if (dto.ruc) {
      const otro = await this.prisma.proveedor.findUnique({ where: { ruc: dto.ruc } });
      if (otro && otro.id !== id) {
        throw new ConflictException('Ya existe otro proveedor con ese RUC');
      }
    }
    return this.prisma.proveedor.update({ where: { id }, data: { ...dto } });
  }

  async desactivarProveedor(id: string) {
    await this.obtenerProveedor(id);
    return this.prisma.proveedor.update({ where: { id }, data: { activo: false } });
  }

  // ── Ingreso de compra (TRANSACCIONAL) ─────────────────────────────────────

  /**
   * Registra una compra de forma atómica:
   *  1. Crea la Compra y sus CompraItem.
   *  2. Crea un Lote por ítem (con su vencimiento).
   *  3. Incrementa el StockSucursal y recalcula el costo promedio ponderado.
   *  4. Registra un MovimientoStock COMPRA por ítem (kardex).
   * Si algo falla, se revierte todo (consistencia garantizada).
   */
  async registrarCompra(dto: CrearCompraDto, usuarioId: string) {
    // Validaciones previas (fuera de la TX para fallar rápido).
    const proveedor = await this.prisma.proveedor.findUnique({
      where: { id: dto.proveedorId },
    });
    if (!proveedor || !proveedor.activo) {
      throw new BadRequestException('Proveedor inválido o inactivo');
    }
    const sucursal = await this.prisma.sucursal.findUnique({ where: { id: dto.sucursalId } });
    if (!sucursal) throw new BadRequestException('Sucursal inválida');

    // (D1) Misma factura del mismo proveedor = compra duplicada. Se valida acá
    // además del @@unique del schema, para dar un mensaje entendible.
    const duplicada = await this.prisma.compra.findFirst({
      where: {
        proveedorId: dto.proveedorId,
        numeroDocumento: dto.numeroDocumento.trim(),
        estado: 'REGISTRADA',
      },
      select: { fecha: true },
    });
    if (duplicada) {
      const cuando = duplicada.fecha.toLocaleDateString('es-PE');
      throw new ConflictException(`Esta factura ya fue registrada el ${cuando}`);
    }

    const productoIds = [...new Set(dto.items.map((i) => i.productoId))];
    const productos = await this.prisma.producto.findMany({
      where: { id: { in: productoIds } },
      // stockMinimo: se hereda a la fila de stock cuando el producto entra por
      // primera vez a esta sucursal (si no, nacía en 0 y no alertaba nunca).
      select: {
        id: true, afectacionIgv: true, activo: true, nombre: true, stockMinimo: true,
      },
    });
    const mapaProd = new Map(productos.map((p) => [p.id, p]));

    // (D3) Validaciones por ítem: nada de mercadería que llega vencida.
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    for (const item of dto.items) {
      const p = mapaProd.get(item.productoId);
      if (!p || !p.activo) {
        throw new BadRequestException(`Producto inválido o inactivo: ${item.productoId}`);
      }
      const vence = new Date(item.vencimiento);
      if (Number.isNaN(vence.getTime()) || vence <= hoy) {
        throw new BadRequestException(
          `Lote ${item.lote} de ${p.nombre} llegaría vencido (vence ${item.vencimiento})`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Mínimo global de Configuración: se usa cuando el producto no trae uno
      // propio. Se lee una sola vez por compra, no por ítem.
      const minimoGlobal = await stockMinimoDefaultGlobal(tx);
      // Tasa configurada en Ajustes (antes fija en 0.18 dentro del código).
      const tasaIgv = await obtenerTasaIgv(tx);

      // Totales: IGV solo sobre productos GRAVADOS.
      let subtotal = new Prisma.Decimal(0);
      let igv = new Prisma.Decimal(0);
      for (const item of dto.items) {
        const linea = new Prisma.Decimal(item.precioCompra).times(item.cantidadBase);
        subtotal = subtotal.plus(linea);
        if (mapaProd.get(item.productoId)!.afectacionIgv === 'GRAVADO') {
          igv = igv.plus(linea.times(tasaIgv));
        }
      }
      const total = subtotal.plus(igv);

      const compra = await tx.compra.create({
        data: {
          numeroDocumento: dto.numeroDocumento,
          tipoDocumento: dto.tipoDocumento ?? 'FACTURA',
          proveedorId: dto.proveedorId,
          sucursalId: dto.sucursalId,
          usuarioId,
          subtotal,
          igv,
          total,
        },
      });

      for (const item of dto.items) {
        const vencimiento = new Date(item.vencimiento);

        // (D2) Si ya existe ese lote (mismo producto+sucursal+código), NO se
        // crea otra fila: se suma. Duplicar el lote parte el stock en dos y
        // rompe el FEFO. Se busca por código y luego se compara el vencimiento.
        const loteMismoCodigo = await tx.lote.findFirst({
          where: {
            productoId: item.productoId,
            sucursalId: dto.sucursalId,
            lote: item.lote,
          },
        });

        let lote;
        if (loteMismoCodigo) {
          // Mismo código pero OTRA fecha = casi siempre un typo. Mejor frenar
          // que mezclar vencimientos distintos bajo un mismo lote.
          const mismaFecha =
            loteMismoCodigo.vencimiento.toISOString().slice(0, 10) ===
            vencimiento.toISOString().slice(0, 10);
          if (!mismaFecha) {
            const existente = loteMismoCodigo.vencimiento.toISOString().slice(0, 10);
            throw new BadRequestException(
              `El lote ${item.lote} ya existe con vencimiento ${existente}, ` +
                `pero se está ingresando con ${item.vencimiento}. Verifica el código de lote.`,
            );
          }
          lote = await tx.lote.update({
            where: { id: loteMismoCodigo.id },
            data: { cantidadBase: { increment: item.cantidadBase } },
          });
        } else {
          lote = await tx.lote.create({
            data: {
              productoId: item.productoId,
              sucursalId: dto.sucursalId,
              lote: item.lote,
              vencimiento,
              cantidadBase: item.cantidadBase,
            },
          });
        }

        await tx.compraItem.create({
          data: {
            compraId: compra.id,
            productoId: item.productoId,
            loteId: lote.id,
            lote: item.lote,
            vencimiento: new Date(item.vencimiento),
            cantidadBase: item.cantidadBase,
            precioCompra: new Prisma.Decimal(item.precioCompra),
            subtotal: new Prisma.Decimal(item.precioCompra).times(item.cantidadBase),
          },
        });

        // Costo promedio ponderado: (qOld*cOld + qNew*cNew) / (qOld+qNew)
        const stockActual = await tx.stockSucursal.findUnique({
          where: {
            productoId_sucursalId: {
              productoId: item.productoId,
              sucursalId: dto.sucursalId,
            },
          },
        });
        const qOld = stockActual?.cantidadBase ?? 0;
        const cOld = stockActual?.costoPromedio ?? new Prisma.Decimal(0);
        const qNew = item.cantidadBase;
        const cNew = new Prisma.Decimal(item.precioCompra);
        const qTotal = qOld + qNew;
        const costoPromedio = qTotal > 0
          ? cOld.times(qOld).plus(cNew.times(qNew)).dividedBy(qTotal)
          : cNew;

        await tx.stockSucursal.upsert({
          where: {
            productoId_sucursalId: {
              productoId: item.productoId,
              sucursalId: dto.sucursalId,
            },
          },
          create: {
            productoId: item.productoId,
            sucursalId: dto.sucursalId,
            cantidadBase: qNew,
            costoPromedio: cNew,
            // La fila nacía con mínimo 0 y las alertas de stock bajo exigen
            // mínimo > 0: ningún producto avisaba nunca. Se hereda el del
            // producto o, en su defecto, el global de Configuración.
            stockMinimo: resolverStockMinimo(
              mapaProd.get(item.productoId)?.stockMinimo,
              minimoGlobal,
            ),
          },
          update: {
            cantidadBase: qTotal,
            costoPromedio,
          },
        });

        await tx.movimientoStock.create({
          data: {
            productoId: item.productoId,
            sucursalId: dto.sucursalId,
            tipo: 'COMPRA',
            cantidadBase: item.cantidadBase,
            motivo: `Compra ${compra.numeroDocumento}`,
            referenciaId: compra.id,
            loteId: lote.id,
            registradoPor: usuarioId,
          },
        });
      }

      return tx.compra.findUnique({
        where: { id: compra.id },
        include: { items: true, proveedor: true },
      });
    });
  }

  async listarCompras(sucursalId?: string) {
    return this.prisma.compra.findMany({
      where: sucursalId ? { sucursalId } : {},
      include: { proveedor: { select: { razonSocial: true, ruc: true } } },
      orderBy: { fecha: 'desc' },
      take: 100,
    });
  }

  async obtenerCompra(id: string) {
    const compra = await this.prisma.compra.findUnique({
      where: { id },
      include: { items: true, proveedor: true, sucursal: true },
    });
    if (!compra) throw new NotFoundException('Compra no encontrada');
    return compra;
  }

  // ── Anulación de compra (reversa transaccional) ──────────────────────────

  /**
   * Anula una compra mal registrada y REVIERTE su efecto:
   *  1. Descuenta del lote la cantidad que ingresó esa compra.
   *  2. Descuenta el stock de la sucursal.
   *  3. Deshace el costo promedio: (qTot*cProm − qItem*cItem) / (qTot − qItem).
   *  4. Registra un AJUSTE negativo en el kardex.
   *
   * Solo se permite si la mercadería sigue INTACTA. Si ya se vendió parte del
   * lote, revertir dejaría stock negativo y un costo promedio sin sentido: en
   * ese caso hay que hacer un ajuste manual, que es lo honesto contablemente.
   */
  async anularCompra(id: string, motivo: string, anuladaPorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!compra) throw new NotFoundException('Compra no encontrada');
      if (compra.estado === 'ANULADA') {
        throw new BadRequestException('La compra ya está anulada');
      }

      for (const item of compra.items) {
        // 1) El lote debe conservar al menos lo que ingresó esta compra.
        if (!item.loteId) {
          throw new BadRequestException(
            `El ítem no tiene lote asociado; anula con un ajuste manual.`,
          );
        }
        const lote = await tx.lote.findUnique({ where: { id: item.loteId } });
        if (!lote || lote.cantidadBase < item.cantidadBase) {
          throw new BadRequestException(
            'Ya se vendió mercadería de esta compra; usa un ajuste',
          );
        }

        // 2) El stock de la sucursal también debe alcanzar.
        const stock = await tx.stockSucursal.findUnique({
          where: {
            productoId_sucursalId: {
              productoId: item.productoId,
              sucursalId: compra.sucursalId,
            },
          },
        });
        if (!stock || stock.cantidadBase < item.cantidadBase) {
          throw new BadRequestException(
            'Ya se vendió mercadería de esta compra; usa un ajuste',
          );
        }

        // 3) Costo promedio inverso. Si al quitar esta compra el stock queda
        //    en 0, el costo vuelve a 0 (no hay mercadería que costear).
        const qTot = stock.cantidadBase;
        const cProm = stock.costoPromedio ?? new Prisma.Decimal(0);
        const qItem = item.cantidadBase;
        const cItem = item.precioCompra;
        const qResto = qTot - qItem;
        const costoPromedio =
          qResto > 0
            ? cProm.times(qTot).minus(cItem.times(qItem)).dividedBy(qResto)
            : new Prisma.Decimal(0);

        await tx.lote.update({
          where: { id: lote.id },
          data: { cantidadBase: { decrement: qItem } },
        });

        await tx.stockSucursal.update({
          where: {
            productoId_sucursalId: {
              productoId: item.productoId,
              sucursalId: compra.sucursalId,
            },
          },
          data: {
            cantidadBase: qResto,
            // Guard: un costo negativo por redondeos no debe persistirse.
            costoPromedio: costoPromedio.lessThan(0) ? new Prisma.Decimal(0) : costoPromedio,
          },
        });

        await tx.movimientoStock.create({
          data: {
            productoId: item.productoId,
            sucursalId: compra.sucursalId,
            tipo: 'AJUSTE',
            cantidadBase: -qItem,
            motivo: `Anulación compra ${compra.numeroDocumento}: ${motivo}`,
            referenciaId: compra.id,
            loteId: lote.id,
            registradoPor: anuladaPorId,
          },
        });
      }

      return tx.compra.update({
        where: { id },
        data: {
          estado: 'ANULADA',
          motivoAnulacion: motivo,
          anuladaEn: new Date(),
          anuladaPorId,
        },
        include: { items: true, proveedor: true },
      });
    });
  }
}
