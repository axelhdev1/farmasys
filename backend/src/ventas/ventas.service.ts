/**
 * FarmaSys — Sistema de gestión para cadena de boticas
 * Copyright (c) 2026 Axel Huatuco Bravo <axelhdev@gmail.com>
 * Todos los derechos reservados. Código propietario — ver LICENSE.
 *
 * Publicado para lectura y evaluación profesional. Prohibido el uso comercial,
 * la redistribución y las obras derivadas sin autorización escrita.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TipoComprobante, EstadoVenta, MetodoPago } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { obtenerTasaIgv } from '../configuracion/igv.util';
import { InventarioService } from '../inventario/inventario.service';
import { CrearVentaDto } from './dto/crear-venta.dto';
import { AnularVentaDto } from './dto/anular-venta.dto';

// La tasa de IGV ahora sale de Configuración (ver configuracion/igv.util.ts).

@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventario: InventarioService,
  ) {}

  /**
   * Correlativo atómico de comprobante. Incrementa siguienteBoleta/Factura de la
   * sucursal DENTRO de la transacción y devuelve "SERIE-000001". El update
   * atómico evita números duplicados ante ventas concurrentes.
   */
  private async siguienteComprobante(
    tx: Prisma.TransactionClient,
    sucursalId: string,
    tipo: TipoComprobante,
  ): Promise<string> {
    // Cada tipo tiene serie y contador PROPIOS. Antes TICKET compartía el
    // correlativo de BOLETA y "quemaba" números legales — nunca más.
    const data =
      tipo === 'FACTURA' ? { siguienteFactura: { increment: 1 } } :
      tipo === 'TICKET'  ? { siguienteTicket:  { increment: 1 } } :
                           { siguienteBoleta:  { increment: 1 } };
    const sucursal = await tx.sucursal.update({
      where: { id: sucursalId },
      data,
    });
    const serie =
      tipo === 'FACTURA' ? sucursal.serieFactura :
      tipo === 'TICKET'  ? sucursal.serieTicket  :
                           sucursal.serieBoleta;
    const numero =
      (tipo === 'FACTURA' ? sucursal.siguienteFactura :
       tipo === 'TICKET'  ? sucursal.siguienteTicket  :
                            sucursal.siguienteBoleta) - 1;
    return `${serie}-${String(numero).padStart(6, '0')}`;
  }

  /**
   * Registra una venta de forma ATÓMICA:
   *  1. (Idempotencia) Si la clave ya existe, devuelve la venta previa.
   *  2. Calcula precios desde la BD (no confía en el cliente).
   *  3. Descuenta stock por FEFO (lote que vence primero) por cada ítem.
   *  4. Genera correlativo atómico, crea Venta + items + pagos.
   *  5. Suma la venta a la caja (vía relación cajaSesionId).
   * Todo en una sola transacción: si algo falla, no se descuenta stock ni se
   * emite comprobante.
   */
  /** Tope de descuento (%) por rol — misma regla que la UI del POS. */
  private topeDescuentoPct(roles: string[]): number {
    if (roles.includes('SUPER_ADMIN') || roles.includes('ADMIN')) return 100;
    if (roles.includes('FARMACEUTICO')) return 15;
    return 10; // vendedor u otros
  }

  async registrar(dto: CrearVentaDto, cajeroId: string, roles: string[] = []) {
    // Idempotencia: corto antes de la TX si ya existe.
    if (dto.idempotencyKey) {
      const previa = await this.prisma.venta.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { items: true, pagos: true },
      });
      if (previa) return previa;
    }

    // Toda venta debe colgar de una caja abierta. El POS ya lo impide, pero la
    // validación tiene que estar TAMBIÉN aquí: una llamada directa a la API
    // podía registrar una venta sin caja, y esa plata no aparecía en ningún
    // arqueo — justo el agujero que el módulo de caja existe para cerrar.
    if (!dto.cajaSesionId) {
      throw new BadRequestException(
        'La venta debe registrarse con una caja abierta. Abre tu turno en Caja.',
      );
    }

    // Además, esa caja debe pertenecer al cajero, ser de la misma sucursal y
    // estar ABIERTA: no se confía en lo que manda el cliente.
    if (dto.cajaSesionId) {
      const caja = await this.prisma.cajaSesion.findUnique({
        where: { id: dto.cajaSesionId },
      });
      if (
        !caja ||
        caja.cajeroId !== cajeroId ||
        caja.sucursalId !== dto.sucursalId ||
        caja.estado !== 'ABIERTA'
      ) {
        throw new BadRequestException(
          'La caja indicada no es válida para este cajero/sucursal o está cerrada',
        );
      }
    }

    // Cargar productos + presentaciones referenciados.
    const productoIds = [...new Set(dto.items.map((i) => i.productoId))];
    const productos = await this.prisma.producto.findMany({
      where: { id: { in: productoIds } },
      include: { presentaciones: true },
    });
    const mapaProd = new Map(productos.map((p) => [p.id, p]));

    // Construir líneas con precio y unidades base reales.
    const lineas = dto.items.map((item) => {
      const prod = mapaProd.get(item.productoId);
      if (!prod || !prod.activo) {
        throw new BadRequestException(`Producto inválido: ${item.productoId}`);
      }
      const pres = item.presentacionId
        ? prod.presentaciones.find((p) => p.id === item.presentacionId)
        : prod.presentaciones.find((p) => p.esBase) ?? prod.presentaciones[0];
      if (!pres) {
        throw new BadRequestException(`El producto ${prod.nombre} no tiene presentación válida`);
      }
      const precio = new Prisma.Decimal(pres.precioVenta);
      // Un producto sin precio se despacharía GRATIS: el total daría 0, la
      // validación de pago (pagado < total) pasaría, y la botica entregaría
      // mercadería registrando una venta válida de S/ 0. Se corta aquí porque
      // pueden existir productos cargados antes de exigir precio > 0.
      if (precio.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          `"${prod.nombre}" no tiene precio de venta asignado. ` +
            'Corrígelo en Compras → Medicamentos antes de venderlo. ' +
            'Si es una muestra o donación, regístrala en Mermas.',
        );
      }
      const cantidadBase = pres.factor * item.cantidad;
      const subtotalLinea = precio.times(item.cantidad);
      return {
        productoId: prod.id,
        presentacionId: pres.id,
        gravado: prod.afectacionIgv === 'GRAVADO',
        cantidad: item.cantidad,
        cantidadBase,
        precioUnitario: precio,
        subtotal: subtotalLinea,
      };
    });

    // Totales. El precio de venta ya incluye IGV (precio final al público):
    // separamos la base y el IGV de las líneas gravadas.
    let total = new Prisma.Decimal(0);
    let baseGravada = new Prisma.Decimal(0);
    for (const l of lineas) {
      total = total.plus(l.subtotal);
      if (l.gravado) baseGravada = baseGravada.plus(l.subtotal);
    }

    // Descuento total (opcional). Reduce el total y la base gravada de forma
    // proporcional, para que el IGV se recalcule sobre el monto ya rebajado.
    // Sin descuento (0), el cálculo es idéntico al de siempre.
    let descuento = new Prisma.Decimal(0);
    if (dto.descuento && dto.descuento > 0) {
      descuento = new Prisma.Decimal(dto.descuento);
      if (descuento.greaterThan(total)) {
        throw new BadRequestException('El descuento no puede superar el total de la venta');
      }
      // Autorización REAL del descuento: el tope por rol se valida en el
      // servidor (la UI solo lo refleja). Evita saltarse el límite vía API.
      const topePct = this.topeDescuentoPct(roles);
      if (topePct < 100 && total.greaterThan(0)) {
        const pct = descuento.dividedBy(total).times(100);
        if (pct.greaterThan(topePct)) {
          throw new BadRequestException(
            `El descuento supera el tope permitido para tu rol (${topePct}%)`,
          );
        }
      }
      const proporcion = total.greaterThan(0)
        ? descuento.dividedBy(total)
        : new Prisma.Decimal(0);
      baseGravada = baseGravada.times(new Prisma.Decimal(1).minus(proporcion));
      total = total.minus(descuento);
    }

    // Tasa CONFIGURADA (Ajustes), no fija en el código: el campo "IGV %"
    // existía y no lo leía nadie. Cae a 18% si no hay configuración.
    const tasaIgv = await obtenerTasaIgv(this.prisma);
    const factor = tasaIgv.plus(1); // 1.18 con el IGV estándar
    const igv = baseGravada.minus(baseGravada.dividedBy(factor)).toDecimalPlaces(2);
    const subtotal = total.minus(igv);

    // Validar que los pagos cubran el total.
    const pagado = dto.pagos.reduce(
      (acc, p) => acc.plus(new Prisma.Decimal(p.monto)),
      new Prisma.Decimal(0),
    );
    if (pagado.lessThan(total)) {
      throw new BadRequestException('Los pagos no cubren el total de la venta');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const numeroComprobante = await this.siguienteComprobante(
          tx,
          dto.sucursalId,
          dto.tipoComprobante,
        );

        const venta = await tx.venta.create({
          data: {
            numeroComprobante,
            tipoComprobante: dto.tipoComprobante,
            sucursalId: dto.sucursalId,
            cajeroId,
            cajaSesionId: dto.cajaSesionId,
            clienteId: dto.clienteId,
            subtotal,
            igv,
            descuento,
            total,
            idempotencyKey: dto.idempotencyKey,
          },
        });

        // Costo promedio VIGENTE de cada producto, leído dentro de la TX antes
        // de tocar el stock. Se congela en cada VentaItem para que el margen
        // histórico no se distorsione cuando el proveedor cambie de precio.
        // Una sola consulta para todas las líneas: no pesa en el cobro.
        const stockActual = await tx.stockSucursal.findMany({
          where: {
            sucursalId: dto.sucursalId,
            productoId: { in: lineas.map((l) => l.productoId) },
          },
          select: { productoId: true, costoPromedio: true },
        });
        const costoVigente = new Map(
          stockActual.map((s) => [s.productoId, s.costoPromedio]),
        );

        // Descontar stock por FEFO + crear items (orden importa: si falta stock,
        // la TX revierte todo).
        for (const l of lineas) {
          await this.inventario.consumirFefo(
            tx,
            l.productoId,
            dto.sucursalId,
            l.cantidadBase,
            venta.id,
          );
          await tx.ventaItem.create({
            data: {
              ventaId: venta.id,
              productoId: l.productoId,
              presentacionId: l.presentacionId,
              cantidad: l.cantidad,
              cantidadBase: l.cantidadBase,
              precioUnitario: l.precioUnitario,
              subtotal: l.subtotal,
              costoUnitario: costoVigente.get(l.productoId) ?? null,
            },
          });
        }

        await tx.pago.createMany({
          data: dto.pagos.map((p) => ({
            ventaId: venta.id,
            metodo: p.metodo,
            monto: new Prisma.Decimal(p.monto),
            referencia: p.referencia,
          })),
        });

        return tx.venta.findUnique({
          where: { id: venta.id },
          include: { items: true, pagos: true },
        });
      });
    } catch (e) {
      // Choque de idempotencia por carrera: devuelve la venta ya creada.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        dto.idempotencyKey
      ) {
        return this.prisma.venta.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: { items: true, pagos: true },
        });
      }
      throw e;
    }
  }

  /**
   * Anula una venta (no se borra). Devuelve el stock a un lote por cada ítem y
   * registra el movimiento. Atómico.
   */
  async anular(id: string, dto: AnularVentaDto, anuladaPorId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const venta = await tx.venta.findUnique({ where: { id }, include: { items: true } });
      if (!venta) throw new NotFoundException('Venta no encontrada');
      if (venta.estado === 'ANULADA') {
        throw new BadRequestException('La venta ya está anulada');
      }

      for (const item of venta.items) {
        // Reingreso al/los LOTE(S) ORIGINAL(ES) de la venta (kardex FEFO),
        // no al lote más reciente. Mantiene la trazabilidad de vencimientos.
        await this.inventario.reingresarStock(tx, {
          productoId: item.productoId,
          sucursalId: venta.sucursalId,
          cantidadBase: item.cantidadBase,
          referenciaId: venta.id,
          motivo: `Anulación venta ${venta.numeroComprobante}`,
          registradoPor: anuladaPorId,
        });
      }

      // ── Reembolso en efectivo ────────────────────────────────────────
      // Anular devuelve plata al cliente. Si esa salida no se registra en una
      // caja, el arqueo del turno queda descuadrado sin explicación.
      // Solo el EFECTIVO sale del cajón: tarjeta/Yape se reversan por su canal.
      const pagos = await tx.pago.findMany({ where: { ventaId: id } });
      const efectivo = pagos
        .filter((p) => p.metodo === 'EFECTIVO')
        .reduce((acc, p) => acc.plus(p.monto), new Prisma.Decimal(0));

      if (efectivo.greaterThan(0)) {
        // 1) La caja original, si sigue abierta.
        let destino = venta.cajaSesionId
          ? await tx.cajaSesion.findUnique({ where: { id: venta.cajaSesionId } })
          : null;

        // 2) Si esa caja YA CERRÓ (o la venta no tenía caja), el reembolso sale
        //    de la caja abierta de quien anula, en esa misma sucursal.
        if (!destino || destino.estado !== 'ABIERTA') {
          destino = anuladaPorId
            ? await tx.cajaSesion.findFirst({
                where: { sucursalId: venta.sucursalId, cajeroId: anuladaPorId, estado: 'ABIERTA' },
              })
            : null;
        }

        if (!destino) {
          throw new BadRequestException(
            `La caja de la venta ya está cerrada y no tienes una caja abierta en esta sucursal. ` +
              `Abre tu caja para registrar el reembolso de S/.${efectivo.toFixed(2)}.`,
          );
        }

        await tx.movimientoCaja.create({
          data: {
            cajaSesionId: destino.id,
            tipo: 'EGRESO',
            categoria: 'DEVOLUCION',
            monto: efectivo,
            motivo: `Reembolso por anulación ${venta.numeroComprobante}`,
            registradoPorId: anuladaPorId,
          },
        });
      }

      return tx.venta.update({
        where: { id },
        data: {
          estado: 'ANULADA',
          motivoAnulacion: dto.motivo,
          anuladaEn: new Date(),
          // Auditoría: QUIÉN anuló (del JWT, no del body — no se confía en el cliente).
          anuladaPorId,
        },
      });
    });
  }

  /** Include estándar para el listado (incluye devoluciones para el Historial). */
  private readonly listaInclude = {
    items: { include: { producto: { select: { nombre: true, codigo: true } } } },
    pagos: true,
    cliente: true,
    cajero: { select: { nombres: true, apellidos: true } },
    devoluciones: { select: { id: true, monto: true } },
  } satisfies Prisma.VentaInclude;

  /** Construye el filtro WHERE a partir de los parámetros (compartido). */
  private construirWhere(params: {
    sucursalId?: string;
    cajaSesionId?: string;
    clienteId?: string;
    estado?: string;
    metodoPago?: string;
    q?: string;
    desde?: string;
    hasta?: string;
  }): Prisma.VentaWhereInput {
    const q = params.q?.trim();
    return {
      ...(params.sucursalId ? { sucursalId: params.sucursalId } : {}),
      ...(params.cajaSesionId ? { cajaSesionId: params.cajaSesionId } : {}),
      // Historial de compras de un cliente concreto (ficha de Clientes).
      ...(params.clienteId ? { clienteId: params.clienteId } : {}),
      ...(params.estado ? { estado: params.estado as EstadoVenta } : {}),
      ...(params.metodoPago
        ? { pagos: { some: { metodo: params.metodoPago as MetodoPago } } }
        : {}),
      ...(params.desde || params.hasta
        ? {
            fecha: {
              ...(params.desde ? { gte: new Date(params.desde) } : {}),
              ...(params.hasta ? { lte: new Date(params.hasta) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { numeroComprobante: { contains: q, mode: 'insensitive' } },
              {
                cliente: {
                  is: {
                    OR: [
                      { nombres: { contains: q, mode: 'insensitive' } },
                      { apellidos: { contains: q, mode: 'insensitive' } },
                      { razonSocial: { contains: q, mode: 'insensitive' } },
                      { numeroDocumento: { contains: q } },
                    ],
                  },
                },
              },
              {
                cajero: {
                  is: {
                    OR: [
                      { nombres: { contains: q, mode: 'insensitive' } },
                      { apellidos: { contains: q, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  /** Orden dinámico por columna (con dirección). */
  private construirOrden(orden?: string): Prisma.VentaOrderByWithRelationInput {
    switch (orden) {
      case 'fecha_asc':  return { fecha: 'asc' };
      case 'total_desc': return { total: 'desc' };
      case 'total_asc':  return { total: 'asc' };
      case 'fecha_desc':
      default:           return { fecha: 'desc' };
    }
  }

  /**
   * Listado plano (array). Se mantiene para el Dashboard y los KPIs, que
   * piden la lista del día completa sin metadatos de paginación.
   */
  async listar(params: {
    sucursalId?: string;
    cajaSesionId?: string;
    clienteId?: string;
    estado?: string;
    metodoPago?: string;
    q?: string;
    desde?: string;
    hasta?: string;
    page?: string | number;
    size?: string | number;
  }) {
    const where = this.construirWhere(params);
    const size = params.size != null ? Math.min(Number(params.size) || 50, 200) : 200;
    const page = params.page != null ? Math.max(Number(params.page) || 0, 0) : 0;

    return this.prisma.venta.findMany({
      where,
      include: this.listaInclude,
      orderBy: { fecha: 'desc' },
      skip: page * size,
      take: size,
    });
  }

  /**
   * Listado paginado para el HISTORIAL: devuelve página + total real de la
   * consulta (para "Mostrando X de N" y calcular si hay más). Filtros de
   * búsqueda, método, estado, fechas y orden se aplican en el SERVIDOR.
   */
  async listarHistorial(params: {
    sucursalId?: string;
    estado?: string;
    metodoPago?: string;
    q?: string;
    desde?: string;
    hasta?: string;
    orden?: string;
    page?: string | number;
    size?: string | number;
  }) {
    const where = this.construirWhere(params);
    const size = Math.min(Math.max(Number(params.size) || 50, 1), 200);
    const page = Math.max(Number(params.page) || 0, 0);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.venta.findMany({
        where,
        include: this.listaInclude,
        orderBy: this.construirOrden(params.orden),
        skip: page * size,
        take: size,
      }),
      this.prisma.venta.count({ where }),
    ]);

    return { items, total, page, size };
  }

  /**
   * Cuenta las anulaciones REALIZADAS en un rango (por `anuladaEn`, no por la
   * fecha de la venta). Es lo correcto para el KPI "Anuladas hoy".
   */
  async contarAnuladas(params: { sucursalId?: string; desde?: string; hasta?: string }) {
    const count = await this.prisma.venta.count({
      where: {
        estado: 'ANULADA',
        ...(params.sucursalId ? { sucursalId: params.sucursalId } : {}),
        anuladaEn: {
          not: null,
          ...(params.desde ? { gte: new Date(params.desde) } : {}),
          ...(params.hasta ? { lte: new Date(params.hasta) } : {}),
        },
      },
    });
    return { count };
  }

  async obtener(id: string) {
    const venta = await this.prisma.venta.findUnique({
      where: { id },
      include: { items: { include: { producto: true } }, pagos: true, cliente: true, sucursal: true },
    });
    if (!venta) throw new NotFoundException('Venta no encontrada');
    return venta;
  }
}
