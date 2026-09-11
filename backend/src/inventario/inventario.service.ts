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
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AjusteStockDto } from './dto/ajuste-stock.dto';
import { resolverStockMinimo, stockMinimoDefaultGlobal } from './stock-minimo.util';
import { BajaLoteDto, CategoriaMerma } from './dto/baja-lote.dto';

/**
 * Inventario por sucursal con control de lotes y lógica FEFO
 * (First-Expired, First-Out). Reglas:
 *  - El stock vendible excluye lotes vencidos.
 *  - El consumo descuenta primero el lote que vence antes.
 *  - Todo movimiento queda registrado en MovimientoStock (kardex).
 * Las operaciones que tocan stock + lotes + kardex van en una transacción.
 */
@Injectable()
export class InventarioService {
  constructor(private readonly prisma: PrismaService) {}

  /** Inicio del día actual (sin hora) para comparar vencimientos. */
  private hoy(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ── Consultas de stock ───────────────────────────────────────────────────

  /** Stock total (todas las unidades base) de un producto en una sucursal. */
  async stockEn(productoId: string, sucursalId: string): Promise<number> {
    const row = await this.prisma.stockSucursal.findUnique({
      where: { productoId_sucursalId: { productoId, sucursalId } },
    });
    return row?.cantidadBase ?? 0;
  }

  /** Stock total del producto en todas las sucursales. */
  async stockGlobal(productoId: string): Promise<number> {
    const agg = await this.prisma.stockSucursal.aggregate({
      where: { productoId },
      _sum: { cantidadBase: true },
    });
    return agg._sum.cantidadBase ?? 0;
  }

  /**
   * Stock del producto en TODAS las sucursales, sucursal por sucursal.
   *
   * Es una excepción deliberada al aislamiento por botica: cuando un cliente
   * pide algo que no hay, el vendedor tiene que poder decirle en qué sede sí
   * está en vez de llamar por teléfono a las otras cuatro.
   *
   * Solo devuelve CANTIDADES y el teléfono de contacto. Nada de costos,
   * precios ni márgenes: eso sigue siendo información financiera y no sale
   * de la sucursal de cada uno.
   */
  async stockPorSucursal(productoId: string) {
    const [filas, lotesVigentes, sucursales] = await Promise.all([
      this.prisma.stockSucursal.findMany({
        where: { productoId },
        select: { sucursalId: true, cantidadBase: true },
      }),
      // Vendible = lotes con stock y sin vencer. El agregado StockSucursal
      // incluye lo vencido, y mandar a un cliente por mercadería vencida sería
      // peor que decirle que no hay.
      this.prisma.lote.groupBy({
        by: ['sucursalId'],
        where: { productoId, cantidadBase: { gt: 0 }, vencimiento: { gte: this.hoy() } },
        _sum: { cantidadBase: true },
      }),
      this.prisma.sucursal.findMany({
        // Se incluye EN_MANTENIMIENTO: sigue teniendo la mercadería físicamente.
        where: { estado: { not: 'INACTIVA' } },
        select: { id: true, nombre: true, telefono: true, direccion: true },
      }),
    ]);

    const total = new Map(filas.map((f) => [f.sucursalId, f.cantidadBase]));
    const vendible = new Map(lotesVigentes.map((l) => [l.sucursalId, l._sum.cantidadBase ?? 0]));

    return sucursales
      .map((s) => ({
        sucursalId: s.id,
        nombre: s.nombre,
        telefono: s.telefono,
        direccion: s.direccion,
        total: total.get(s.id) ?? 0,
        vendible: vendible.get(s.id) ?? 0,
      }))
      .sort((a, b) => b.vendible - a.vendible);
  }

  /** Lotes con stock y NO vencidos, ordenados por vencimiento (FEFO). */
  async lotesVigentesEn(productoId: string, sucursalId: string) {
    return this.prisma.lote.findMany({
      where: {
        productoId,
        sucursalId,
        cantidadBase: { gt: 0 },
        vencimiento: { gte: this.hoy() },
      },
      orderBy: { vencimiento: 'asc' },
    });
  }

  /** Lotes con stock pero ya vencidos (candidatos a baja/merma). */
  async lotesVencidosEn(productoId: string, sucursalId: string) {
    return this.prisma.lote.findMany({
      where: {
        productoId,
        sucursalId,
        cantidadBase: { gt: 0 },
        vencimiento: { lt: this.hoy() },
      },
      orderBy: { vencimiento: 'asc' },
    });
  }

  /** Stock VENDIBLE = suma de lotes vigentes (excluye vencidos). */
  async stockVendibleEn(productoId: string, sucursalId: string): Promise<number> {
    const lotes = await this.lotesVigentesEn(productoId, sucursalId);
    return lotes.reduce((acc, l) => acc + l.cantidadBase, 0);
  }

  /** Días para vencer del lote más próximo vigente (o null si no hay). */
  async diasParaVencer(productoId: string, sucursalId: string): Promise<number | null> {
    const lotes = await this.lotesVigentesEn(productoId, sucursalId);
    if (lotes.length === 0) return null;
    const ms = lotes[0].vencimiento.getTime() - this.hoy().getTime();
    return Math.floor(ms / 86_400_000);
  }

  /**
   * Lotes próximos a vencer en una sucursal dentro de `dias` (default 90).
   * Útil para el dashboard de alertas de vencimiento.
   */
  async proximosAVencer(sucursalId: string, dias = 90) {
    const limite = new Date(this.hoy());
    limite.setDate(limite.getDate() + dias);
    return this.prisma.lote.findMany({
      where: {
        sucursalId,
        cantidadBase: { gt: 0 },
        vencimiento: { gte: this.hoy(), lte: limite },
      },
      include: { producto: { select: { nombre: true, codigo: true } } },
      orderBy: { vencimiento: 'asc' },
    });
  }

  /** Productos con stock por debajo de su mínimo en una sucursal. */
  async alertasStockBajo(sucursalId: string) {
    const rows = await this.prisma.stockSucursal.findMany({
      where: { sucursalId, stockMinimo: { gt: 0 } },
      include: { producto: { select: { nombre: true, codigo: true } } },
    });
    return rows
      .filter((r) => r.cantidadBase <= r.stockMinimo)
      .sort((a, b) => a.cantidadBase - b.cantidadBase);
  }

  /**
   * Todo el stock de una sucursal en una sola llamada (para hidratar el front).
   * Devuelve cada fila producto×sucursal con su cantidad base y mínimo.
   */
  async stockDeSucursal(sucursalId: string) {
    return this.prisma.stockSucursal.findMany({
      where: { sucursalId },
      orderBy: { productoId: 'asc' },
    });
  }

  /**
   * Todos los lotes con stock de una sucursal (para FEFO y alertas en el front).
   * Ordenados por vencimiento ascendente.
   */
  async lotesDeSucursal(sucursalId: string) {
    return this.prisma.lote.findMany({
      where: { sucursalId, cantidadBase: { gt: 0 } },
      orderBy: { vencimiento: 'asc' },
    });
  }

  /**
   * Kardex (historial de movimientos) de un producto en una sucursal, con el
   * saldo resultante calculado. Devuelve del más reciente al más antiguo.
   */
  async movimientosDe(sucursalId: string, productoId: string) {
    const movs = await this.prisma.movimientoStock.findMany({
      where: { sucursalId, productoId },
      orderBy: { fecha: 'asc' },
      include: { usuario: { select: { nombres: true, apellidos: true } } },
    });
    let saldo = 0;
    const conSaldo = movs.map((m) => {
      saldo += m.cantidadBase;
      return {
        id: m.id,
        tipo: m.tipo,
        cantidadBase: m.cantidadBase,
        motivo: m.motivo,
        fecha: m.fecha,
        stockResultante: saldo,
        // Vacío en los movimientos anteriores a que existiera la columna, y en
        // las ventas: ahí el cajero se recupera por `referenciaId` → Venta.
        usuario: m.usuario
          ? `${m.usuario.nombres} ${m.usuario.apellidos ?? ''}`.trim()
          : '',
      };
    });
    return conSaldo.reverse().slice(0, 50);
  }

  /** Actualiza el stock mínimo (punto de reposición) de un producto en una sucursal. */
  async actualizarStockMinimo(sucursalId: string, productoId: string, stockMinimo: number) {
    if (stockMinimo < 0) {
      throw new BadRequestException('El stock mínimo no puede ser negativo');
    }
    return this.prisma.stockSucursal.upsert({
      where: { productoId_sucursalId: { productoId, sucursalId } },
      create: { productoId, sucursalId, stockMinimo },
      update: { stockMinimo },
    });
  }

  // ── Mutaciones de stock ──────────────────────────────────────────────────

  /**
   * Ajuste manual de stock (conteo físico, corrección). Actualiza el agregado
   * StockSucursal y registra el movimiento. No toca lotes (usar baja para eso).
   */
  async ajustar(dto: AjusteStockDto, registradoPor?: string) {
    if (dto.cantidadBase === 0) {
      throw new BadRequestException('La cantidad del ajuste no puede ser 0');
    }

    return this.prisma.$transaction(async (tx) => {
      const { productoId, sucursalId } = dto;

      if (dto.cantidadBase < 0) {
        // SALIDA: descuenta por FEFO de los lotes → lotes y stock siempre cuadran.
        let restante = -dto.cantidadBase;
        const lotes = await tx.lote.findMany({
          where: { productoId, sucursalId, cantidadBase: { gt: 0 } },
          orderBy: { vencimiento: 'asc' },
        });
        const disponible = lotes.reduce((a, l) => a + l.cantidadBase, 0);
        if (disponible < restante) {
          throw new BadRequestException(`Stock insuficiente para el ajuste (disponible ${disponible})`);
        }
        for (const lote of lotes) {
          if (restante <= 0) break;
          const tomar = Math.min(lote.cantidadBase, restante);
          await tx.lote.update({ where: { id: lote.id }, data: { cantidadBase: lote.cantidadBase - tomar } });
          await tx.movimientoStock.create({
            data: { productoId, sucursalId, tipo: 'AJUSTE', cantidadBase: -tomar, motivo: dto.motivo, loteId: lote.id, registradoPor },
          });
          restante -= tomar;
        }
      } else {
        // INGRESO: exige lote + vencimiento (para no crear stock sin trazabilidad).
        if (!dto.loteNumero || !dto.vencimiento) {
          throw new BadRequestException('Para sumar stock indica lote y vencimiento (o usa Compras)');
        }
        const venc = new Date(dto.vencimiento);
        // Compras rechaza mercadería que llega vencida; el ajuste no lo hacía,
        // así que era una puerta trasera para meter stock ya vencido al
        // inventario (FEFO lo ignora al vender, pero infla el valor del stock).
        if (Number.isNaN(venc.getTime()) || venc <= this.hoy()) {
          throw new BadRequestException(
            `No se puede ingresar un lote vencido o sin fecha válida (${dto.vencimiento}). ` +
              'Si el producto ya venció, regístralo como merma.',
          );
        }
        const existente = await tx.lote.findFirst({
          where: { productoId, sucursalId, lote: dto.loteNumero, vencimiento: venc },
        });
        let loteId: string;
        if (existente) {
          await tx.lote.update({ where: { id: existente.id }, data: { cantidadBase: { increment: dto.cantidadBase } } });
          loteId = existente.id;
        } else {
          const creado = await tx.lote.create({
            data: { productoId, sucursalId, lote: dto.loteNumero, vencimiento: venc, cantidadBase: dto.cantidadBase },
          });
          loteId = creado.id;
        }
        await tx.movimientoStock.create({
          data: { productoId, sucursalId, tipo: 'AJUSTE', cantidadBase: dto.cantidadBase, motivo: dto.motivo, loteId, registradoPor },
        });
      }

      // Stock agregado consistente con el cambio de lotes.
      // El `create` heredaba mínimo 0 (igual que pasaba en Compras): si el
      // producto entraba a la sucursal por un ajuste, nunca alertaba por stock
      // bajo. Se resuelve con el mínimo del producto o el global.
      const prod = await tx.producto.findUnique({
        where: { id: productoId },
        select: { stockMinimo: true },
      });
      const minimoGlobal = await stockMinimoDefaultGlobal(tx);

      return tx.stockSucursal.upsert({
        where: { productoId_sucursalId: { productoId, sucursalId } },
        create: {
          productoId,
          sucursalId,
          cantidadBase: Math.max(0, dto.cantidadBase),
          stockMinimo: resolverStockMinimo(prod?.stockMinimo, minimoGlobal),
        },
        update: { cantidadBase: { increment: dto.cantidadBase } },
      });
    });
  }

  /**
   * Baja de un lote (merma). Descuenta del lote y del stock agregado y registra
   * un MovimientoStock BAJA_VENCIMIENTO. Todo en una transacción.
   */
  /** Etiqueta legible por categoría de merma. */
  private readonly etiquetaMerma: Record<CategoriaMerma, string> = {
    VENCIDO: 'Vencido',
    DANADO: 'Dañado / roto',
    ROBO: 'Robo / pérdida',
    MUESTRA: 'Muestra médica',
    OTRO: 'Otro',
  };

  /**
   * Lote por id. Lo usa el controller para resolver a qué sucursal pertenece
   * y validar el scope ANTES de permitir la baja.
   */
  async obtenerLote(loteId: string) {
    const lote = await this.prisma.lote.findUnique({ where: { id: loteId } });
    if (!lote) throw new NotFoundException('Lote no encontrado');
    return lote;
  }

  async darDeBajaLote(loteId: string, dto: BajaLoteDto, registradoPor?: string) {
    return this.prisma.$transaction(async (tx) => {
      const lote = await tx.lote.findUnique({ where: { id: loteId } });
      if (!lote) throw new NotFoundException('Lote no encontrado');

      const cantidad = dto.cantidadBase ?? lote.cantidadBase;
      if (cantidad <= 0 || cantidad > lote.cantidadBase) {
        throw new BadRequestException('Cantidad de baja inválida para el lote');
      }

      await tx.lote.update({
        where: { id: loteId },
        data: { cantidadBase: lote.cantidadBase - cantidad },
      });

      await tx.stockSucursal.update({
        where: {
          productoId_sucursalId: {
            productoId: lote.productoId,
            sucursalId: lote.sucursalId,
          },
        },
        data: { cantidadBase: { decrement: cantidad } },
      });

      // El vencimiento tiene su propio tipo (para reportes); el resto es MERMA.
      const tipo = dto.categoria === 'VENCIDO' ? 'BAJA_VENCIMIENTO' : 'MERMA';
      const nota = dto.nota?.trim();
      const motivo =
        `${this.etiquetaMerma[dto.categoria]} · Lote ${lote.lote}` +
        (nota ? ` · ${nota}` : '');

      await tx.movimientoStock.create({
        data: {
          productoId: lote.productoId,
          sucursalId: lote.sucursalId,
          tipo,
          cantidadBase: -cantidad,
          motivo,
          loteId,
          registradoPor,
        },
      });

      return { ok: true, dadoDeBaja: cantidad };
    });
  }

  /**
   * Lotes candidatos a baja: ya VENCIDOS o POR_VENCER dentro de `dias`.
   * Devuelve el producto y los días restantes (negativo = vencido).
   */
  async lotesParaBaja(sucursalId: string, dias = 30) {
    const hoy = this.hoy();
    const limite = new Date(hoy);
    limite.setDate(limite.getDate() + dias);
    const lotes = await this.prisma.lote.findMany({
      where: { sucursalId, cantidadBase: { gt: 0 }, vencimiento: { lte: limite } },
      include: { producto: { select: { nombre: true, codigo: true } } },
      orderBy: { vencimiento: 'asc' },
    });
    return lotes.map((l) => {
      const diasRestantes = Math.floor((l.vencimiento.getTime() - hoy.getTime()) / 86_400_000);
      return {
        id: l.id,
        lote: l.lote,
        vencimiento: l.vencimiento,
        cantidadBase: l.cantidadBase,
        productoId: l.productoId,
        producto: l.producto,
        estado: diasRestantes < 0 ? 'VENCIDO' : 'POR_VENCER',
        diasRestantes,
      };
    });
  }

  /**
   * Historial de mermas/bajas de una sucursal en los últimos `dias`, con el
   * valor perdido (cantidad × costo promedio del producto).
   */
  async listarMermas(sucursalId: string, dias = 30) {
    const desde = new Date(this.hoy());
    desde.setDate(desde.getDate() - dias);
    const movs = await this.prisma.movimientoStock.findMany({
      where: {
        sucursalId,
        tipo: { in: ['BAJA_VENCIMIENTO', 'MERMA'] },
        fecha: { gte: desde },
      },
      include: {
        producto: { select: { nombre: true, codigo: true } },
        usuario: { select: { nombres: true, apellidos: true } },
      },
      orderBy: { fecha: 'desc' },
      take: 300,
    });

    const prodIds = [...new Set(movs.map((m) => m.productoId))];
    const stock = prodIds.length
      ? await this.prisma.stockSucursal.findMany({
          where: { sucursalId, productoId: { in: prodIds } },
          select: { productoId: true, costoPromedio: true },
        })
      : [];
    const costo = new Map(
      stock.map((s) => [s.productoId, s.costoPromedio ? Number(s.costoPromedio) : 0]),
    );

    const items = movs.map((m) => {
      const cantidad = Math.abs(m.cantidadBase);
      const valor = cantidad * (costo.get(m.productoId) ?? 0);
      return {
        id: m.id,
        fecha: m.fecha,
        tipo: m.tipo,
        cantidad,
        motivo: m.motivo,
        producto: m.producto,
        valor,
        // Quién dio de baja la mercadería. Vacío en las bajas anteriores a que
        // existiera la columna.
        usuario: m.usuario
          ? `${m.usuario.nombres} ${m.usuario.apellidos ?? ''}`.trim()
          : '',
      };
    });
    const valorTotal = items.reduce((s, i) => s + i.valor, 0);
    const unidadesTotal = items.reduce((s, i) => s + i.cantidad, 0);
    return { items, valorTotal, unidadesTotal };
  }

  /**
   * Consume `cantidadBase` aplicando FEFO dentro de una transacción existente.
   * Pensado para reutilizarse desde Ventas (Fase 4). Devuelve el desglose de
   * lotes consumidos. Lanza si no hay stock vendible suficiente.
   */
  async consumirFefo(
    tx: Prisma.TransactionClient,
    productoId: string,
    sucursalId: string,
    cantidadBase: number,
    referenciaId?: string,
  ): Promise<{ loteId: string; cantidad: number }[]> {
    if (cantidadBase <= 0) {
      throw new BadRequestException('La cantidad a consumir debe ser positiva');
    }

    const hoy = this.hoy();
    const lotes = await tx.lote.findMany({
      where: {
        productoId,
        sucursalId,
        cantidadBase: { gt: 0 },
        vencimiento: { gte: hoy },
      },
      orderBy: { vencimiento: 'asc' },
    });

    const disponible = lotes.reduce((acc, l) => acc + l.cantidadBase, 0);
    if (disponible < cantidadBase) {
      // Nombra el producto en el error: en un carrito de varios ítems el
      // cajero necesita saber CUÁL falló. La consulta solo corre al fallar.
      const prod = await tx.producto.findUnique({
        where: { id: productoId },
        select: { nombre: true },
      });
      throw new BadRequestException(
        `Stock insuficiente de ${prod?.nombre ?? 'producto'} (disponible ${disponible}, requerido ${cantidadBase})`,
      );
    }

    let restante = cantidadBase;
    const consumo: { loteId: string; cantidad: number }[] = [];

    for (const lote of lotes) {
      if (restante <= 0) break;
      const tomar = Math.min(lote.cantidadBase, restante);
      await tx.lote.update({
        where: { id: lote.id },
        data: { cantidadBase: lote.cantidadBase - tomar },
      });
      consumo.push({ loteId: lote.id, cantidad: tomar });
      restante -= tomar;
    }

    await tx.stockSucursal.update({
      where: { productoId_sucursalId: { productoId, sucursalId } },
      data: { cantidadBase: { decrement: cantidadBase } },
    });

    // Kardex: UN movimiento por lote consumido. Esto deja trazabilidad exacta
    // (qué lote y cuánto) para poder revertir al lote original en anulaciones y
    // devoluciones, en vez de adivinar el "lote más reciente".
    await tx.movimientoStock.createMany({
      data: consumo.map((c) => ({
        productoId,
        sucursalId,
        tipo: 'VENTA' as const,
        cantidadBase: -c.cantidad,
        motivo: 'Salida por venta (FEFO)',
        referenciaId,
        loteId: c.loteId,
      })),
    });

    return consumo;
  }

  /**
   * Reingresa `cantidadBase` de un producto al inventario devolviéndolo a los
   * LOTES ORIGINALES de la venta (según el kardex FEFO por `referenciaId`),
   * del que vence primero al que vence después, sin exceder lo que cada lote
   * aportó (descontando reingresos previos → soporta devoluciones parciales
   * repetidas). Lo que no tenga rastro por lote (ventas antiguas) cae al lote
   * más reciente. Actualiza StockSucursal y registra el/los movimiento(s).
   *
   * DEBE ejecutarse dentro de una transacción (`tx`).
   */
  async reingresarStock(
    tx: Prisma.TransactionClient,
    params: {
      productoId: string;
      sucursalId: string;
      cantidadBase: number;
      referenciaId?: string;
      motivo: string;
      registradoPor?: string;
    },
  ): Promise<void> {
    const { productoId, sucursalId, cantidadBase, referenciaId, motivo, registradoPor } =
      params;
    if (cantidadBase <= 0) return;

    // Consumo original por lote y lo ya reingresado antes (para parciales).
    const consumidoPorLote = new Map<string, number>();
    const reingresadoPorLote = new Map<string, number>();
    if (referenciaId) {
      const movs = await tx.movimientoStock.findMany({
        where: { referenciaId, productoId, sucursalId, loteId: { not: null } },
      });
      for (const m of movs) {
        if (!m.loteId) continue;
        if (m.cantidadBase < 0) {
          consumidoPorLote.set(m.loteId, (consumidoPorLote.get(m.loteId) ?? 0) + Math.abs(m.cantidadBase));
        } else {
          reingresadoPorLote.set(m.loteId, (reingresadoPorLote.get(m.loteId) ?? 0) + m.cantidadBase);
        }
      }
    }

    // Candidatos: lotes con saldo por devolver (consumido − ya reingresado).
    const candidatos = [...consumidoPorLote.entries()]
      .map(([loteId, cons]) => ({ loteId, disp: cons - (reingresadoPorLote.get(loteId) ?? 0) }))
      .filter((c) => c.disp > 0);

    // Ordenar por vencimiento (FEFO): primero el que vence antes.
    if (candidatos.length > 1) {
      const info = await tx.lote.findMany({ where: { id: { in: candidatos.map((c) => c.loteId) } } });
      const venc = new Map(info.map((l) => [l.id, l.vencimiento.getTime()]));
      candidatos.sort((a, b) => (venc.get(a.loteId) ?? 0) - (venc.get(b.loteId) ?? 0));
    }

    let restante = cantidadBase;
    for (const c of candidatos) {
      if (restante <= 0) break;
      const poner = Math.min(c.disp, restante);
      await tx.lote.update({ where: { id: c.loteId }, data: { cantidadBase: { increment: poner } } });
      await tx.movimientoStock.create({
        data: { productoId, sucursalId, tipo: 'AJUSTE', cantidadBase: poner, motivo, referenciaId, loteId: c.loteId, registradoPor },
      });
      restante -= poner;
    }

    // Sobrante sin rastro por lote → al lote más reciente (o solo movimiento).
    if (restante > 0) {
      const lote = await tx.lote.findFirst({
        where: { productoId, sucursalId },
        orderBy: { creadoEn: 'desc' },
      });
      await tx.movimientoStock.create({
        data: { productoId, sucursalId, tipo: 'AJUSTE', cantidadBase: restante, motivo, referenciaId, loteId: lote?.id, registradoPor },
      });
      if (lote) {
        await tx.lote.update({ where: { id: lote.id }, data: { cantidadBase: { increment: restante } } });
      }
    }

    await tx.stockSucursal.update({
      where: { productoId_sucursalId: { productoId, sucursalId } },
      data: { cantidadBase: { increment: cantidadBase } },
    });
  }
}
