/**
 * FarmaSys — Sistema de gestión para cadena de boticas
 * Copyright (c) 2026 Axel Huatuco Bravo <axelhdev@gmail.com>
 * Todos los derechos reservados. Código propietario — ver LICENSE.
 *
 * Publicado para lectura y evaluación profesional. Prohibido el uso comercial,
 * la redistribución y las obras derivadas sin autorización escrita.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GastosService } from '../gastos/gastos.service';
import { obtenerTasaIgv } from '../configuracion/igv.util';

const D0 = new Prisma.Decimal(0);
// La tasa de IGV sale de Configuración (ver configuracion/igv.util.ts).

@Injectable()
export class ReportesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gastos: GastosService,
  ) {}

  private rango(desde?: string, hasta?: string) {
    if (!desde && !hasta) {
      // Por defecto: hoy (00:00 → ahora).
      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      return { gte: inicio };
    }
    return {
      ...(desde ? { gte: new Date(desde) } : {}),
      ...(hasta ? { lte: new Date(hasta) } : {}),
    };
  }

  /**
   * KPIs del dashboard por sucursal: total vendido, n.º de tickets, ticket
   * promedio, productos sin stock / en stock crítico y valor de inventario
   * (a costo promedio). Todo desde datos reales.
   */
  async kpis(sucursalId: string, desde?: string, hasta?: string) {
    const fecha = this.rango(desde, hasta);

    const ventas = await this.prisma.venta.findMany({
      where: { sucursalId, estado: 'COMPLETADA', fecha },
      select: { total: true },
    });
    const tickets = ventas.length;
    const totalVendido = ventas.reduce((acc, v) => acc.plus(v.total), D0);
    const ticketPromedio = tickets > 0 ? totalVendido.dividedBy(tickets) : D0;

    const stock = await this.prisma.stockSucursal.findMany({
      where: { sucursalId },
      select: { cantidadBase: true, stockMinimo: true, costoPromedio: true },
    });
    const sinStock = stock.filter((s) => s.cantidadBase <= 0).length;
    const stockCritico = stock.filter(
      (s) => s.stockMinimo > 0 && s.cantidadBase > 0 && s.cantidadBase <= s.stockMinimo,
    ).length;
    const valorInventario = stock.reduce(
      (acc, s) => acc.plus((s.costoPromedio ?? D0).times(s.cantidadBase)),
      D0,
    );

    // Ventana de alerta CONFIGURABLE (Ajustes → alerta de vencimiento). Estaba
    // fija en 90 días mientras el campo existía y no lo leía nadie.
    const cfg = await this.prisma.configuracion.findUnique({
      where: { id: 'global' },
      select: { alertaVencimientoDias: true },
    });
    const diasAlerta = cfg?.alertaVencimientoDias && cfg.alertaVencimientoDias > 0
      ? cfg.alertaVencimientoDias
      : 90;

    const limite = new Date();
    limite.setDate(limite.getDate() + diasAlerta);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const alertasVencimiento = await this.prisma.lote.count({
      where: { sucursalId, cantidadBase: { gt: 0 }, vencimiento: { gte: hoy, lte: limite } },
    });

    return {
      sucursalId,
      tickets,
      totalVendido,
      ticketPromedio,
      sinStock,
      stockCritico,
      valorInventario,
      alertasVencimiento,
    };
  }

  /**
   * KPIs del día de TODAS las sucursales + estado de caja (abierta/cerrada y por
   * quién). Es la fuente de la "torre de control" multi-botica. Reutiliza kpis().
   * N consultas por sucursal: aceptable para pocas boticas; cachear si escala.
   */
  async kpisPorSucursal() {
    const sucursales = await this.prisma.sucursal.findMany({
      select: { id: true, nombre: true, estado: true },
      orderBy: { nombre: 'asc' },
    });

    // Venta acumulada del MES en curso (mes-a-la-fecha) por sucursal.
    // Una sola consulta agregada para todas: alimenta la barra de avance vs meta.
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const mes = await this.prisma.venta.groupBy({
      by: ['sucursalId'],
      where: { estado: 'COMPLETADA', fecha: { gte: inicioMes } },
      _sum: { total: true },
    });
    const mesPorSucursal = new Map(mes.map((m) => [m.sucursalId, m._sum.total ?? D0]));

    // Serie de los últimos 7 días por sucursal (sparkline de tendencia).
    // Una sola consulta; el agrupado por día se hace en memoria para respetar
    // el día LOCAL (date_trunc en SQL agruparía en UTC y correría el corte).
    const DIAS_SERIE = 7;
    const MS_DIA = 86_400_000;
    const inicioSerie = new Date();
    inicioSerie.setHours(0, 0, 0, 0);
    inicioSerie.setDate(inicioSerie.getDate() - (DIAS_SERIE - 1));

    const ventasSerie = await this.prisma.venta.findMany({
      where: { estado: 'COMPLETADA', fecha: { gte: inicioSerie } },
      select: { sucursalId: true, fecha: true, total: true },
    });

    const seriePorSucursal = new Map<string, number[]>();
    for (const v of ventasSerie) {
      const dia = new Date(v.fecha);
      dia.setHours(0, 0, 0, 0);
      const idx = Math.floor((dia.getTime() - inicioSerie.getTime()) / MS_DIA);
      if (idx < 0 || idx >= DIAS_SERIE) continue;
      const arr = seriePorSucursal.get(v.sucursalId) ?? new Array<number>(DIAS_SERIE).fill(0);
      arr[idx] += Number(v.total);
      seriePorSucursal.set(v.sucursalId, arr);
    }

    // Personal activo por sucursal (para la tarjeta: "N en planilla").
    const personal = await this.prisma.usuario.groupBy({
      by: ['sucursalId'],
      where: { activo: true },
      _count: { _all: true },
    });
    const personalPorSucursal = new Map(
      personal.filter((p) => p.sucursalId).map((p) => [p.sucursalId as string, p._count._all]),
    );

    const resultado = [];
    for (const s of sucursales) {
      const k = await this.kpis(s.id); // por defecto: hoy
      const caja = await this.prisma.cajaSesion.findFirst({
        where: { sucursalId: s.id, estado: 'ABIERTA' },
        include: { cajero: { select: { nombres: true, apellidos: true } } },
        orderBy: { aperturaEn: 'desc' },
      });
      resultado.push({
        sucursalId: s.id,
        nombre: s.nombre,
        estado: s.estado,
        tickets: k.tickets,
        totalVendido: k.totalVendido,
        totalVendidoMes: mesPorSucursal.get(s.id) ?? D0,
        ticketPromedio: k.ticketPromedio,
        sinStock: k.sinStock,
        stockCritico: k.stockCritico,
        alertasVencimiento: k.alertasVencimiento,
        // Se calculaba y se tiraba. El dashboard del dueño lee su KPI de aquí,
        // así que la tarjeta "Valor inventario" mostraba S/ 0 junto al texto
        // "20 productos activos" — un cero que no era cero.
        valorInventario: k.valorInventario,
        /** Venta por día de los últimos 7 (la última posición es hoy). */
        serie7d: seriePorSucursal.get(s.id) ?? new Array<number>(DIAS_SERIE).fill(0),
        personalActivo: personalPorSucursal.get(s.id) ?? 0,
        cajaAbierta: !!caja,
        cajeroCaja: caja
          ? `${caja.cajero.nombres} ${caja.cajero.apellidos ?? ''}`.trim()
          : null,
      });
    }
    return resultado;
  }

  /**
   * Estado de resultados (P&L) del período: ventas, costo, utilidad bruta,
   * gastos operativos y utilidad NETA. La base del módulo de Finanzas.
   */
  async estadoResultados(sucursalId: string, desde?: string, hasta?: string) {
    const m = await this.margen(sucursalId, desde, hasta);     // ingreso(sin IGV), costo, utilidad, margenPct
    const k = await this.kpis(sucursalId, desde, hasta);        // tickets, totalVendido(con IGV), ticketPromedio
    const gastos = await this.gastos.total(sucursalId, desde, hasta);
    // E6: la mercadería que se vence o se rompe es plata perdida. Antes no
    // figuraba en ningún lado: la utilidad neta salía mejor de lo que fue.
    const perdidaMermas = await this.perdidaMermas(sucursalId, desde, hasta);
    // Filas viejas cargadas como gasto MERCADERIA: ya están sumadas en `gastos`
    // y además en `costoVentas`. Se devuelve el monto para poder avisarlo en
    // pantalla en vez de dejar una utilidad neta inexplicablemente baja.
    const gastosMercaderia = await this.gastos.totalMercaderia(sucursalId, desde, hasta);
    const utilidadNeta = m.utilidad.minus(perdidaMermas).minus(gastos);
    const margenNeto = m.ingreso.greaterThan(0)
      ? utilidadNeta.dividedBy(m.ingreso).times(100).toDecimalPlaces(2)
      : D0;
    return {
      ventasTotales: k.totalVendido,   // lo cobrado (con IGV)
      ventasNetas: m.ingreso,          // base imponible (sin IGV)
      costoVentas: m.costo,
      utilidadBruta: m.utilidad,
      margenBruto: m.margenPct,
      perdidaMermas,                   // vencidos, dañados, robos (a costo)
      gastos,
      gastosMercaderia,                // > 0 ⇒ hay doble conteo que corregir
      utilidadNeta,
      margenNeto,
      tickets: k.tickets,
      ticketPromedio: k.ticketPromedio,
      valorInventario: k.valorInventario,   // capital atado en stock (a costo)
    };
  }

  /**
   * E6 · Valor de la mercadería dada de baja en el período (a costo).
   *
   * Las bajas se registran como `MovimientoStock` de tipo BAJA_VENCIMIENTO o
   * MERMA con `cantidadBase` NEGATIVA. Se valorizan al costo promedio actual
   * del producto — misma aproximación que usa `inventario.listarMermas()`.
   */
  async perdidaMermas(sucursalId: string, desde?: string, hasta?: string): Promise<Prisma.Decimal> {
    const fecha = this.rango(desde, hasta);
    const bajas = await this.prisma.movimientoStock.findMany({
      where: { sucursalId, tipo: { in: ['BAJA_VENCIMIENTO', 'MERMA'] }, fecha },
      select: { productoId: true, cantidadBase: true },
    });
    if (bajas.length === 0) return D0;

    const costos = await this.prisma.stockSucursal.findMany({
      where: { sucursalId, productoId: { in: [...new Set(bajas.map((b) => b.productoId))] } },
      select: { productoId: true, costoPromedio: true },
    });
    const mapaCosto = new Map(costos.map((c) => [c.productoId, c.costoPromedio ?? D0]));

    let total = D0;
    for (const b of bajas) {
      // Math.abs: la cantidad viene negativa por ser una salida de stock.
      const unidades = Math.abs(b.cantidadBase);
      total = total.plus((mapaCosto.get(b.productoId) ?? D0).times(unidades));
    }
    return total.toDecimalPlaces(2);
  }

  /**
   * E7 · IGV del período: débito fiscal (ventas) − crédito fiscal (compras).
   *
   * ESTIMADO, no declaración jurada. Motivos: no distingue comprobantes que dan
   * derecho a crédito fiscal de los que no (una boleta de compra no lo da),
   * no considera notas de crédito ni percepciones/retenciones, y usa la fecha
   * de registro y no la del período tributario. Sirve para que el dueño sepa
   * cuánta plata debe ir apartando, no para presentar a SUNAT.
   */
  async igv(sucursalId: string, desde?: string, hasta?: string) {
    const fecha = this.rango(desde, hasta);

    const [ventas, compras] = await Promise.all([
      this.prisma.venta.aggregate({
        where: { sucursalId, estado: 'COMPLETADA', fecha },
        _sum: { igv: true },
      }),
      this.prisma.compra.aggregate({
        where: { sucursalId, estado: 'REGISTRADA', fecha },
        _sum: { igv: true },
      }),
    ]);

    const igvVentas = ventas._sum.igv ?? D0;
    const igvCompras = compras._sum.igv ?? D0;
    return {
      igvVentas,
      igvCompras,
      // Negativo = crédito a favor que se arrastra al mes siguiente.
      porPagar: igvVentas.minus(igvCompras).toDecimalPlaces(2),
      estimado: true,
    };
  }

  /** Ventas por método de pago (para el donut). */
  async metodosPago(sucursalId: string, desde?: string, hasta?: string) {
    const fecha = this.rango(desde, hasta);
    const grupos = await this.prisma.pago.groupBy({
      by: ['metodo'],
      where: { venta: { sucursalId, estado: 'COMPLETADA', fecha } },
      _sum: { monto: true },
      _count: true,
    });
    return grupos.map((g) => ({
      metodo: g.metodo,
      monto: g._sum.monto ?? D0,
      operaciones: g._count,
    }));
  }

  /** Ventas por categoría de producto (para el donut de mix de venta). */
  async ventasPorCategoria(sucursalId: string, desde?: string, hasta?: string) {
    const fecha = this.rango(desde, hasta);
    const items = await this.prisma.ventaItem.findMany({
      where: { venta: { sucursalId, estado: 'COMPLETADA', fecha } },
      select: { subtotal: true, producto: { select: { categoria: true } } },
    });
    const mapa = new Map<string, Prisma.Decimal>();
    for (const it of items) {
      const cat = it.producto?.categoria ?? 'Otros';
      mapa.set(cat, (mapa.get(cat) ?? D0).plus(it.subtotal));
    }
    return Array.from(mapa.entries())
      .map(([categoria, monto]) => ({ categoria, monto }))
      .sort((a, b) => (b.monto.greaterThan(a.monto) ? 1 : -1));
  }

  /** Flujo de caja del período: ingresos (ventas) vs egresos (compras + gastos). */
  async flujoCaja(sucursalId: string, desde?: string, hasta?: string) {
    const fecha = this.rango(desde, hasta);
    const ventas = await this.prisma.venta.aggregate({
      where: { sucursalId, estado: 'COMPLETADA', fecha },
      _sum: { total: true },
    });
    const compras = await this.prisma.compra.aggregate({
      where: { sucursalId, ...(fecha ? { fecha } : {}) },
      _sum: { total: true },
    });
    const gastos = await this.gastos.total(sucursalId, desde, hasta);
    const ingresos = ventas._sum.total ?? D0;
    const egresosCompras = compras._sum.total ?? D0;
    const egresos = egresosCompras.plus(gastos);
    return {
      ingresos,
      egresosCompras,
      egresosGastos: gastos,
      egresos,
      saldo: ingresos.minus(egresos),
    };
  }

  /** Top productos más vendidos (por unidades base) en el rango. */
  async topProductos(sucursalId: string, desde?: string, hasta?: string, limit = 10) {
    const fecha = this.rango(desde, hasta);
    const grupos = await this.prisma.ventaItem.groupBy({
      by: ['productoId'],
      where: { venta: { sucursalId, estado: 'COMPLETADA', fecha } },
      _sum: { cantidadBase: true, subtotal: true },
      orderBy: { _sum: { cantidadBase: 'desc' } },
      take: limit,
    });

    const ids = grupos.map((g) => g.productoId);
    const productos = await this.prisma.producto.findMany({
      where: { id: { in: ids } },
      select: { id: true, nombre: true, codigo: true },
    });
    const mapa = new Map(productos.map((p) => [p.id, p]));

    return grupos.map((g) => ({
      producto: mapa.get(g.productoId),
      unidades: g._sum.cantidadBase ?? 0,
      vendido: g._sum.subtotal ?? D0,
    }));
  }

  /**
   * Sugerencia de reposición por demanda: para cada producto calcula su
   * velocidad de venta (unidades base/día en los últimos `dias`), los días de
   * cobertura que le quedan con el stock actual y cuánto pedir para cubrir
   * `objetivo` días. Devuelve solo los que necesitan reponerse, ordenados por
   * urgencia (menos cobertura primero). Es la herramienta clave del almacenero.
   */
  async reposicion(sucursalId: string, dias = 30, objetivo = 30) {
    const desde = new Date();
    desde.setDate(desde.getDate() - dias);

    const grupos = await this.prisma.ventaItem.groupBy({
      by: ['productoId'],
      where: { venta: { sucursalId, estado: 'COMPLETADA', fecha: { gte: desde } } },
      _sum: { cantidadBase: true },
    });
    const vendidoMap = new Map(grupos.map((g) => [g.productoId, g._sum.cantidadBase ?? 0]));

    const stock = await this.prisma.stockSucursal.findMany({
      where: { sucursalId },
      select: {
        productoId: true,
        cantidadBase: true,
        stockMinimo: true,
        producto: { select: { nombre: true, codigo: true, unidadBase: true, activo: true } },
      },
    });

    const filas = stock
      .filter((s) => s.producto?.activo)
      .map((s) => {
        const vendido = vendidoMap.get(s.productoId) ?? 0;
        const velocidad = vendido / dias;
        const cobertura = velocidad > 0 ? s.cantidadBase / velocidad : null;
        const sugerido = Math.max(0, Math.ceil(velocidad * objetivo - s.cantidadBase));
        return {
          producto: s.producto,
          stockActual: s.cantidadBase,
          stockMinimo: s.stockMinimo,
          vendidoPeriodo: vendido,
          velocidadDia: Math.round(velocidad * 100) / 100,
          diasCobertura: cobertura !== null ? Math.round(cobertura) : null,
          sugerido,
        };
      });

    return filas
      .filter((f) => f.sugerido > 0 || (f.stockMinimo > 0 && f.stockActual <= f.stockMinimo))
      .sort((a, b) => (a.diasCobertura ?? 99999) - (b.diasCobertura ?? 99999));
  }

  /** Ventas agrupadas por día (para gráficos de tendencia). */
  async ventasPorDia(sucursalId: string, desde?: string, hasta?: string) {
    const fecha = this.rango(desde, hasta);
    const ventas = await this.prisma.venta.findMany({
      where: { sucursalId, estado: 'COMPLETADA', fecha },
      select: { fecha: true, total: true },
      orderBy: { fecha: 'asc' },
    });
    const porDia = new Map<string, Prisma.Decimal>();
    for (const v of ventas) {
      const dia = v.fecha.toISOString().slice(0, 10);
      porDia.set(dia, (porDia.get(dia) ?? D0).plus(v.total));
    }
    return Array.from(porDia.entries()).map(([dia, total]) => ({ dia, total }));
  }

  /**
   * Margen del periodo: ingreso neto − costo de lo vendido.
   *
   * INGRESO: se agrega sobre `Venta.subtotal`, NO sobre `VentaItem.subtotal`.
   * La diferencia no es cosmética:
   *   - `VentaItem.subtotal` = precioUnitario × cantidad → lleva IGV dentro y
   *     NO descuenta el descuento aplicado a la venta.
   *   - `Venta.subtotal`     = total − igv, ya neto de descuento.
   * Sumando los items, una venta de S/ 118 entraba al P&L como 118 en vez de
   * 100, y los descuentos no aparecían por ningún lado: el margen salía
   * inflado por partida doble.
   *
   * COSTO: costoUnitario congelado en la venta (E4); si la venta es anterior a
   * ese campo, se cae al costo promedio actual del producto.
   *
   * DEVOLUCIONES: se restan de ambos lados — la plata se devolvió y la
   * mercadería volvió al stock.
   */
  async margen(sucursalId: string, desde?: string, hasta?: string) {
    const fecha = this.rango(desde, hasta);

    // ── Ingreso: base imponible real del período ────────────────────────────
    const agregadoVentas = await this.prisma.venta.aggregate({
      where: { sucursalId, estado: 'COMPLETADA', fecha },
      _sum: { subtotal: true },
    });
    let ingreso = agregadoVentas._sum.subtotal ?? D0;

    // ── Costo de lo vendido ─────────────────────────────────────────────────
    const items = await this.prisma.ventaItem.findMany({
      where: { venta: { sucursalId, estado: 'COMPLETADA', fecha } },
      select: { productoId: true, cantidadBase: true, costoUnitario: true },
    });

    const costos = await this.prisma.stockSucursal.findMany({
      where: { sucursalId },
      select: { productoId: true, costoPromedio: true },
    });
    const mapaCosto = new Map(costos.map((c) => [c.productoId, c.costoPromedio ?? D0]));

    let costo = D0;
    for (const it of items) {
      const unitario = it.costoUnitario ?? mapaCosto.get(it.productoId) ?? D0;
      costo = costo.plus(unitario.times(it.cantidadBase));
    }

    // ── Devoluciones del período ────────────────────────────────────────────
    // Se filtran por la fecha de la DEVOLUCIÓN (no la de la venta original):
    // el P&L de este mes debe cargar con lo que se devolvió este mes.
    const devueltos = await this.prisma.devolucionItem.findMany({
      where: { devolucion: { sucursalId, fecha } },
      select: { productoId: true, cantidadBase: true, subtotal: true, ventaItemId: true },
    });

    if (devueltos.length > 0) {
      // Costo con el que se dio de baja el producto en su venta original. Debe
      // ser el MISMO que se cargó al vender, o la reversión deja un margen
      // fantasma cuando el costo promedio cambió entremedio.
      const itemsOriginales = await this.prisma.ventaItem.findMany({
        where: { id: { in: devueltos.map((d) => d.ventaItemId) } },
        select: { id: true, costoUnitario: true },
      });
      const costoOriginal = new Map(
        itemsOriginales.map((i) => [i.id, i.costoUnitario]),
      );

      // Tasa configurada, para que todo el sistema use el mismo número.
      // LIMITACIÓN: se aplica la tasa ACTUAL a devoluciones viejas; si el IGV
      // cambiara, los períodos anteriores se recalcularían con la tasa nueva.
      // Es una aproximación aceptable porque el ingreso principal ya sale de
      // `Venta.subtotal`, que sí guarda el IGV real de cada venta.
      const factorIgv = new Prisma.Decimal(1).plus(await obtenerTasaIgv(this.prisma));
      let ingresoDevuelto = D0;
      let costoDevuelto = D0;
      for (const d of devueltos) {
        // `DevolucionItem.subtotal` es bruto (precioUnitario × cantidad), así
        // que se le quita el IGV para dejarlo comparable con Venta.subtotal.
        ingresoDevuelto = ingresoDevuelto.plus(d.subtotal.dividedBy(factorIgv));
        const unitario =
          costoOriginal.get(d.ventaItemId) ?? mapaCosto.get(d.productoId) ?? D0;
        costoDevuelto = costoDevuelto.plus(unitario.times(d.cantidadBase));
      }
      ingreso = ingreso.minus(ingresoDevuelto.toDecimalPlaces(2));
      costo = costo.minus(costoDevuelto);
    }

    const utilidad = ingreso.minus(costo);
    const margenPct = ingreso.greaterThan(0)
      ? utilidad.dividedBy(ingreso).times(100).toDecimalPlaces(2)
      : D0;

    return {
      ingreso: ingreso.toDecimalPlaces(2),
      costo: costo.toDecimalPlaces(2),
      utilidad: utilidad.toDecimalPlaces(2),
      margenPct,
    };
  }

  /**
   * Ingreso NETO de una línea de venta.
   *
   * `VentaItem.subtotal` es bruto (precioUnitario × cantidad). Para bajarlo a
   * base imponible hay que quitarle el IGV — pero SOLO si el producto es
   * GRAVADO: los exonerados (muchos genéricos en Perú) no lo llevan dentro.
   *
   * LIMITACIÓN CONOCIDA: no prorratea el descuento de la venta, que se aplica
   * a nivel de comprobante y no de línea. Por eso los totales por categoría y
   * por producto suman un poco más que `ventasNetas` del P&L cuando hubo
   * descuentos. El P&L manda; esto sirve para comparar productos entre sí.
   */
  private ingresoNetoLinea(
    subtotal: Prisma.Decimal,
    afectacion: string,
    tasaIgv: Prisma.Decimal,
  ): Prisma.Decimal {
    if (afectacion !== 'GRAVADO') return subtotal;
    return subtotal.dividedBy(new Prisma.Decimal(1).plus(tasaIgv));
  }

  /**
   * E10 · Rentabilidad por categoría: cuánto deja cada familia de productos.
   * Ordenado por utilidad — no por venta, que es lo que suele engañar.
   */
  async margenCategorias(sucursalId: string, desde?: string, hasta?: string) {
    const fecha = this.rango(desde, hasta);
    const tasaIgv = await obtenerTasaIgv(this.prisma);
    const items = await this.prisma.ventaItem.findMany({
      where: { venta: { sucursalId, estado: 'COMPLETADA', fecha } },
      select: {
        productoId: true, cantidadBase: true, subtotal: true, costoUnitario: true,
        producto: { select: { categoria: true, afectacionIgv: true } },
      },
    });

    const costos = await this.prisma.stockSucursal.findMany({
      where: { sucursalId },
      select: { productoId: true, costoPromedio: true },
    });
    const mapaCosto = new Map(costos.map((c) => [c.productoId, c.costoPromedio ?? D0]));

    const acc = new Map<string, { ingreso: Prisma.Decimal; costo: Prisma.Decimal; unidades: number }>();
    for (const it of items) {
      const cat = it.producto?.categoria ?? 'Sin categoría';
      const fila = acc.get(cat) ?? { ingreso: D0, costo: D0, unidades: 0 };
      fila.ingreso = fila.ingreso.plus(
        this.ingresoNetoLinea(it.subtotal, it.producto?.afectacionIgv ?? 'GRAVADO', tasaIgv),
      );
      const unitario = it.costoUnitario ?? mapaCosto.get(it.productoId) ?? D0;
      fila.costo = fila.costo.plus(unitario.times(it.cantidadBase));
      fila.unidades += it.cantidadBase;
      acc.set(cat, fila);
    }

    return Array.from(acc.entries())
      .map(([categoria, f]) => {
        const ingreso = f.ingreso.toDecimalPlaces(2);
        const costo = f.costo.toDecimalPlaces(2);
        const utilidad = ingreso.minus(costo);
        return {
          categoria,
          unidades: f.unidades,
          ingreso,
          costo,
          utilidad,
          margenPct: ingreso.greaterThan(0)
            ? utilidad.dividedBy(ingreso).times(100).toDecimalPlaces(2)
            : D0,
        };
      })
      .sort((a, b) => b.utilidad.comparedTo(a.utilidad));
  }

  /**
   * E10 · Top productos por UTILIDAD generada (no por facturación).
   * Un producto puede vender muchísimo y dejar casi nada; este ranking es el
   * que dice qué conviene tener siempre en stock.
   */
  async topUtilidad(sucursalId: string, desde?: string, hasta?: string, limit = 20) {
    const fecha = this.rango(desde, hasta);
    const tasaIgv = await obtenerTasaIgv(this.prisma);
    const items = await this.prisma.ventaItem.findMany({
      where: { venta: { sucursalId, estado: 'COMPLETADA', fecha } },
      select: {
        productoId: true, cantidadBase: true, subtotal: true, costoUnitario: true,
        producto: { select: { nombre: true, codigo: true, categoria: true, afectacionIgv: true } },
      },
    });

    const costos = await this.prisma.stockSucursal.findMany({
      where: { sucursalId },
      select: { productoId: true, costoPromedio: true },
    });
    const mapaCosto = new Map(costos.map((c) => [c.productoId, c.costoPromedio ?? D0]));

    const acc = new Map<
      string,
      { nombre: string; codigo: string; categoria: string; ingreso: Prisma.Decimal; costo: Prisma.Decimal; unidades: number }
    >();
    for (const it of items) {
      const fila = acc.get(it.productoId) ?? {
        nombre: it.producto?.nombre ?? '—',
        codigo: it.producto?.codigo ?? '—',
        categoria: it.producto?.categoria ?? 'Sin categoría',
        ingreso: D0,
        costo: D0,
        unidades: 0,
      };
      fila.ingreso = fila.ingreso.plus(
        this.ingresoNetoLinea(it.subtotal, it.producto?.afectacionIgv ?? 'GRAVADO', tasaIgv),
      );
      const unitario = it.costoUnitario ?? mapaCosto.get(it.productoId) ?? D0;
      fila.costo = fila.costo.plus(unitario.times(it.cantidadBase));
      fila.unidades += it.cantidadBase;
      acc.set(it.productoId, fila);
    }

    return Array.from(acc.entries())
      .map(([productoId, f]) => {
        const ingreso = f.ingreso.toDecimalPlaces(2);
        const costo = f.costo.toDecimalPlaces(2);
        const utilidad = ingreso.minus(costo);
        return {
          productoId,
          nombre: f.nombre,
          codigo: f.codigo,
          categoria: f.categoria,
          unidades: f.unidades,
          ingreso,
          costo,
          utilidad,
          margenPct: ingreso.greaterThan(0)
            ? utilidad.dividedBy(ingreso).times(100).toDecimalPlaces(2)
            : D0,
        };
      })
      .sort((a, b) => b.utilidad.comparedTo(a.utilidad))
      .slice(0, limit);
  }

  /**
   * E11 · Días de inventario: cuántos días duraría el stock actual al ritmo de
   * consumo del período. Alto = capital dormido en los estantes.
   *
   *   días = valorInventario ÷ (costoVentas del período ÷ días del período)
   *
   * Devuelve el global y el desglose por categoría. `null` en días significa
   * que esa categoría no tuvo ventas en el período: no es que dure para
   * siempre, es que no hay con qué calcularlo.
   */
  async diasInventario(sucursalId: string, desde?: string, hasta?: string) {
    const diasPeriodo = this.diasDelRango(desde, hasta);

    const [stock, porCategoria] = await Promise.all([
      this.prisma.stockSucursal.findMany({
        where: { sucursalId },
        select: {
          cantidadBase: true,
          costoPromedio: true,
          producto: { select: { categoria: true } },
        },
      }),
      this.margenCategorias(sucursalId, desde, hasta),
    ]);

    const costoVendidoPorCat = new Map(porCategoria.map((c) => [c.categoria, c.costo]));

    let valorTotal = D0;
    const valorPorCat = new Map<string, Prisma.Decimal>();
    for (const s of stock) {
      const valor = (s.costoPromedio ?? D0).times(s.cantidadBase);
      valorTotal = valorTotal.plus(valor);
      const cat = s.producto?.categoria ?? 'Sin categoría';
      valorPorCat.set(cat, (valorPorCat.get(cat) ?? D0).plus(valor));
    }

    const calcular = (valor: Prisma.Decimal, costoVendido: Prisma.Decimal): number | null => {
      if (costoVendido.lessThanOrEqualTo(0)) return null;
      const consumoDiario = costoVendido.dividedBy(diasPeriodo);
      return Number(valor.dividedBy(consumoDiario).toDecimalPlaces(1));
    };

    const costoTotal = porCategoria.reduce((acc, c) => acc.plus(c.costo), D0);

    const categorias = Array.from(valorPorCat.entries())
      .map(([categoria, valor]) => {
        const dias = calcular(valor, costoVendidoPorCat.get(categoria) ?? D0);
        return {
          categoria,
          valorInventario: valor.toDecimalPlaces(2),
          costoVendido: (costoVendidoPorCat.get(categoria) ?? D0).toDecimalPlaces(2),
          dias,
          // Más de 60 días de stock: plata parada que podría estar rotando.
          capitalDormido: dias !== null && dias > 60,
        };
      })
      .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));

    return {
      diasPeriodo,
      valorInventario: valorTotal.toDecimalPlaces(2),
      costoVentas: costoTotal.toDecimalPlaces(2),
      dias: calcular(valorTotal, costoTotal),
      categorias,
    };
  }

  /** Días que abarca el rango (mínimo 1, para no dividir entre cero). */
  private diasDelRango(desde?: string, hasta?: string): number {
    const r = this.rango(desde, hasta);
    const inicio = r.gte ?? new Date();
    const fin = 'lte' in r && r.lte ? r.lte : new Date();
    const dias = Math.ceil((fin.getTime() - inicio.getTime()) / 86_400_000);
    return dias > 0 ? dias : 1;
  }
}
