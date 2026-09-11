import { Injectable, computed, signal } from '@angular/core';
import { StockSucursal, MovimientoStock, TipoMovimiento } from '../models/stock-sucursal.model';
import { Lote } from '../models/lote.model';

// NOTA: enDias() se eliminó junto con los mocks; solo lo usaba el bloque de
// datos ficticios (ahora comentado). Los vencimientos reales llegan del backend.

/**
 * StockSucursalService — gestiona el inventario por sucursal.
 *
 * ── Por qué este servicio existe ─────────────────────────────────────────
 *  Antes el stock vivía en Producto.stockTotal (un solo número global).
 *  Ahora cada sucursal tiene su propio inventario:
 *    Botica Central tiene 45 cajas de Amoxicilina
 *    Botica San Juan tiene 12 cajas
 *    Botica Comas tiene 0 (no la venden)
 *
 *  Toda la lógica de stock pasa por este servicio. El POS, Dashboard,
 *  Inventario y Reportes lo consumen filtrando por sucursalActivaId.
 *
 * ── Unidad base ──────────────────────────────────────────────────────────
 *  cantidadBase está SIEMPRE en la unidad atómica del producto.
 *  Si vendes 1 caja de Amoxicilina (= 100 pastillas), se descuenta 100.
 *  Si vendes 1 blíster (= 10 pastillas), se descuenta 10.
 *  Si vendes 1 pastilla, se descuenta 1.
 *
 * ── Conexión al backend ──────────────────────────────────────────────────
 *  Tabla: stock_sucursal (producto_id, sucursal_id, cantidad_base)
 *  Endpoints:
 *    GET    /api/v1/stock?sucursalId=s-1
 *    PATCH  /api/v1/stock/{productoId}/{sucursalId}  body: { delta, motivo }
 *  El método decrementarEn() hará el PATCH; el resto solo lee.
 */
@Injectable({ providedIn: 'root' })
export class StockSucursalService {

  // ── Estado: lista plana de stocks ─────────────────────────────────────
  // Nace VACÍO: el stock real lo inyecta cargar() desde el backend. Nunca
  // debe mostrarse stock inventado (llevaría a vender lo que no existe).
  private readonly _stocks = signal<StockSucursal[]>([]);

  /* ────────────────────────────────────────────────────────────────────────
     MOCK HISTÓRICO — NO USAR. Sucursales ficticias 's-1'..'s-5' de la etapa
     sin backend. Se conserva solo como referencia del formato de datos.

    { productoId: 'MOCK', sucursalId: 's-1', cantidadBase: 0, stockMinimo: 0 },
    ── AMOXICILINA 500mg (id producto = '1') ──
    // Unidad base: pastilla. 1 caja = 100 pastillas.
    { productoId: '1', sucursalId: 's-1', cantidadBase: 4500, stockMinimo: 1000 }, // 45 cajas
    { productoId: '1', sucursalId: 's-2', cantidadBase: 1200, stockMinimo: 1000 }, // 12 cajas
    { productoId: '1', sucursalId: 's-3', cantidadBase: 800,  stockMinimo: 500  }, // 8 cajas
    { productoId: '1', sucursalId: 's-4', cantidadBase: 0,    stockMinimo: 500  }, // sin stock
    { productoId: '1', sucursalId: 's-5', cantidadBase: 300,  stockMinimo: 500  }, // bajo

    // ════════ IBUPROFENO 400mg (id producto = '2') ═════════════════════
    // Unidad base: tableta. 1 caja = 20 tabletas.
    { productoId: '2', sucursalId: 's-1', cantidadBase: 100,  stockMinimo: 200 }, // 5 cajas — BAJO
    { productoId: '2', sucursalId: 's-2', cantidadBase: 400,  stockMinimo: 200 },
    { productoId: '2', sucursalId: 's-3', cantidadBase: 320,  stockMinimo: 200 },
    { productoId: '2', sucursalId: 's-4', cantidadBase: 180,  stockMinimo: 200 },
    { productoId: '2', sucursalId: 's-5', cantidadBase: 0,    stockMinimo: 200 },

    // ════════ MULTIVITAMÍNICO Junior (id = '3') ═════════════════════════
    // Unidad base: frasco (no fraccionable).
    { productoId: '3', sucursalId: 's-1', cantidadBase: 12 },
    { productoId: '3', sucursalId: 's-2', cantidadBase: 8 },
    { productoId: '3', sucursalId: 's-3', cantidadBase: 5 },
    { productoId: '3', sucursalId: 's-4', cantidadBase: 0 },
    { productoId: '3', sucursalId: 's-5', cantidadBase: 3 },

    // ════════ BLOQUEADOR SOLAR (id = '4') ═══════════════════════════════
    { productoId: '4', sucursalId: 's-1', cantidadBase: 22 },
    { productoId: '4', sucursalId: 's-2', cantidadBase: 10 },
    { productoId: '4', sucursalId: 's-3', cantidadBase: 7 },
    { productoId: '4', sucursalId: 's-4', cantidadBase: 4 },
    { productoId: '4', sucursalId: 's-5', cantidadBase: 0 },

    // ════════ PARACETAMOL 500mg (id = '5') ══════════════════════════════
    // Unidad base: pastilla. 1 caja = 100 pastillas.
    { productoId: '5', sucursalId: 's-1', cantidadBase: 8000,  stockMinimo: 2000 }, // 80 cajas
    { productoId: '5', sucursalId: 's-2', cantidadBase: 5000,  stockMinimo: 2000 },
    { productoId: '5', sucursalId: 's-3', cantidadBase: 3500,  stockMinimo: 2000 },
    { productoId: '5', sucursalId: 's-4', cantidadBase: 2200,  stockMinimo: 2000 },
    { productoId: '5', sucursalId: 's-5', cantidadBase: 1800,  stockMinimo: 2000 },

    // ════════ SUERO ORAL (id = '6') ═════════════════════════════════════
    { productoId: '6', sucursalId: 's-1', cantidadBase: 30 },
    { productoId: '6', sucursalId: 's-2', cantidadBase: 24 },
    { productoId: '6', sucursalId: 's-3', cantidadBase: 18 },
    { productoId: '6', sucursalId: 's-4', cantidadBase: 12 },
    { productoId: '6', sucursalId: 's-5', cantidadBase: 8 },

    // ════════ CEFALEXINA (id = '7') ═════════════════════════════════════
    { productoId: '7', sucursalId: 's-1', cantidadBase: 216 }, // 18 cajas x 12
    { productoId: '7', sucursalId: 's-2', cantidadBase: 96 },
    { productoId: '7', sucursalId: 's-3', cantidadBase: 60 },
    { productoId: '7', sucursalId: 's-4', cantidadBase: 0 },
    { productoId: '7', sucursalId: 's-5', cantidadBase: 36 },

    // ════════ CETAPHIL (id = '8') ═══════════════════════════════════════
    { productoId: '8', sucursalId: 's-1', cantidadBase: 14 },
    { productoId: '8', sucursalId: 's-2', cantidadBase: 8 },
    { productoId: '8', sucursalId: 's-3', cantidadBase: 5 },
    { productoId: '8', sucursalId: 's-4', cantidadBase: 3 },
    { productoId: '8', sucursalId: 's-5', cantidadBase: 0 },

    // ════════ LORATADINA (id = '9') ═════════════════════════════════════
    { productoId: '9', sucursalId: 's-1', cantidadBase: 650 },  // 65 cajas x 10
    { productoId: '9', sucursalId: 's-2', cantidadBase: 280 },
    { productoId: '9', sucursalId: 's-3', cantidadBase: 200 },
    { productoId: '9', sucursalId: 's-4', cantidadBase: 100 },
    { productoId: '9', sucursalId: 's-5', cantidadBase: 70 },

    // ════════ NAPROXENO Roche (id = '10') ═══════════════════════════════
    { productoId: '10', sucursalId: 's-1', cantidadBase: 0 },   // agotado
    { productoId: '10', sucursalId: 's-2', cantidadBase: 80 },  // 8 cajas
    { productoId: '10', sucursalId: 's-3', cantidadBase: 50 },
    { productoId: '10', sucursalId: 's-4', cantidadBase: 0 },
    { productoId: '10', sucursalId: 's-5', cantidadBase: 30 },

    // ════════ NAPROXENO alternativas (mejora 2) ═════════════════════════
    // Apronax 250mg (id = '11')
    { productoId: '11', sucursalId: 's-1', cantidadBase: 180 }, // 9 cajas x 20
    { productoId: '11', sucursalId: 's-2', cantidadBase: 120 },
    { productoId: '11', sucursalId: 's-3', cantidadBase: 80 },
    { productoId: '11', sucursalId: 's-4', cantidadBase: 40 },
    { productoId: '11', sucursalId: 's-5', cantidadBase: 60 },

    // Naproxeno Genfar 550mg (id = '12')
    { productoId: '12', sucursalId: 's-1', cantidadBase: 240 }, // 12 cajas x 20
    { productoId: '12', sucursalId: 's-2', cantidadBase: 100 },
    { productoId: '12', sucursalId: 's-3', cantidadBase: 60 },
    { productoId: '12', sucursalId: 's-4', cantidadBase: 80 },
    { productoId: '12', sucursalId: 's-5', cantidadBase: 0 },

    // Naproxeno Bayer 500mg (id = '13')
    { productoId: '13', sucursalId: 's-1', cantidadBase: 100 }, // 10 cajas x 10
    { productoId: '13', sucursalId: 's-2', cantidadBase: 60 },
    { productoId: '13', sucursalId: 's-3', cantidadBase: 0 },
    { productoId: '13', sucursalId: 's-4', cantidadBase: 30 },
    { productoId: '13', sucursalId: 's-5', cantidadBase: 20 },

    // ════════ PARES GENÉRICO / MARCA (mejora 2) ═════════════════════════
    // Paracetamol genérico IQ Farma (id = '14') — base tableta, caja x100
    { productoId: '14', sucursalId: 's-1', cantidadBase: 6000, stockMinimo: 2000 },
    { productoId: '14', sucursalId: 's-2', cantidadBase: 4000, stockMinimo: 2000 },
    { productoId: '14', sucursalId: 's-3', cantidadBase: 2500, stockMinimo: 2000 },
    { productoId: '14', sucursalId: 's-4', cantidadBase: 1500, stockMinimo: 2000 },
    { productoId: '14', sucursalId: 's-5', cantidadBase: 1000, stockMinimo: 2000 },

    // Panadol Antigripal GSK (id = '15') — base tableta, caja x24
    { productoId: '15', sucursalId: 's-1', cantidadBase: 960 }, // 40 cajas x 24
    { productoId: '15', sucursalId: 's-2', cantidadBase: 600 },
    { productoId: '15', sucursalId: 's-3', cantidadBase: 360 },
    { productoId: '15', sucursalId: 's-4', cantidadBase: 240 },
    { productoId: '15', sucursalId: 's-5', cantidadBase: 120 },

    // Amoxicilina genérico Genfar (id = '16') — base cápsula, caja x100
    { productoId: '16', sucursalId: 's-1', cantidadBase: 3500, stockMinimo: 1000 },
    { productoId: '16', sucursalId: 's-2', cantidadBase: 2000, stockMinimo: 1000 },
    { productoId: '16', sucursalId: 's-3', cantidadBase: 1200, stockMinimo: 1000 },
    { productoId: '16', sucursalId: 's-4', cantidadBase: 0,    stockMinimo: 1000 }, // agotado → ver alternativa Amoxil
    { productoId: '16', sucursalId: 's-5', cantidadBase: 800,  stockMinimo: 1000 },

    // Amoxil GSK (id = '17') — base cápsula, caja x12
    { productoId: '17', sucursalId: 's-1', cantidadBase: 240 }, // 20 cajas x 12
    { productoId: '17', sucursalId: 's-2', cantidadBase: 144 },
    { productoId: '17', sucursalId: 's-3', cantidadBase: 96 },
    { productoId: '17', sucursalId: 's-4', cantidadBase: 60 },
    { productoId: '17', sucursalId: 's-5', cantidadBase: 0 },

    // Ibuprofeno genérico Medifarma (id = '18') — base tableta, caja x100
    { productoId: '18', sucursalId: 's-1', cantidadBase: 5000, stockMinimo: 2000 },
    { productoId: '18', sucursalId: 's-2', cantidadBase: 3000, stockMinimo: 2000 },
    { productoId: '18', sucursalId: 's-3', cantidadBase: 2000, stockMinimo: 2000 },
    { productoId: '18', sucursalId: 's-4', cantidadBase: 1200, stockMinimo: 2000 },
    { productoId: '18', sucursalId: 's-5', cantidadBase: 600,  stockMinimo: 2000 },

    // Doloral Hersil (id = '19') — base tableta, caja x20
    { productoId: '19', sucursalId: 's-1', cantidadBase: 600 }, // 30 cajas x 20
    { productoId: '19', sucursalId: 's-2', cantidadBase: 400 },
    { productoId: '19', sucursalId: 's-3', cantidadBase: 200 },
    { productoId: '19', sucursalId: 's-4', cantidadBase: 100 },
    { productoId: '19', sucursalId: 's-5', cantidadBase: 80 },

    // Dexametasona ampolla Medifarma (id = '20') — base ampolla, caja x5
    { productoId: '20', sucursalId: 's-1', cantidadBase: 50, stockMinimo: 20 }, // 10 cajas x 5
    { productoId: '20', sucursalId: 's-2', cantidadBase: 35, stockMinimo: 20 },
    { productoId: '20', sucursalId: 's-3', cantidadBase: 20, stockMinimo: 20 },
    { productoId: '20', sucursalId: 's-4', cantidadBase: 15, stockMinimo: 20 },
    { productoId: '20', sucursalId: 's-5', cantidadBase: 0,  stockMinimo: 20 },
     ──────────────────── fin MOCK HISTÓRICO de stock ──────────────────── */

  /** Lista completa (solo lectura) */
  readonly stocks = this._stocks.asReadonly();

  // ── Lotes con vencimiento (FEFO) ──────────────────────────────────────
  // También vacío: cargar() inyecta los lotes sintéticos (FEFO + vencidos)
  // derivados del backend.
  private readonly _lotes = signal<Lote[]>([]);

  /* ────────────────────────────────────────────────────────────────────────
     MOCK HISTÓRICO de lotes — NO USAR (sucursal ficticia 's-1').

    ── Amoxicilina (1) ──
    { productoId: '1',  sucursalId: 's-1', lote: 'L-AMX180', vencimiento: enDias(180), cantidadBase: 3000 },
    { productoId: '1',  sucursalId: 's-1', lote: 'L-AMX025', vencimiento: enDias(25),  cantidadBase: 1500 },
    // Ibuprofeno (2) — incluye un lote VENCIDO
    { productoId: '2',  sucursalId: 's-1', lote: 'L-IBU-V',  vencimiento: enDias(-3),  cantidadBase: 40 },
    { productoId: '2',  sucursalId: 's-1', lote: 'L-IBU060', vencimiento: enDias(60),  cantidadBase: 60 },
    // Paracetamol (5)
    { productoId: '5',  sucursalId: 's-1', lote: 'L-PAR008', vencimiento: enDias(8),   cantidadBase: 2000 },
    { productoId: '5',  sucursalId: 's-1', lote: 'L-PAR300', vencimiento: enDias(300), cantidadBase: 6000 },
    // Cefalexina (7)
    { productoId: '7',  sucursalId: 's-1', lote: 'L-CEF020', vencimiento: enDias(20),  cantidadBase: 216 },
    // Amoxicilina genérica (16)
    { productoId: '16', sucursalId: 's-1', lote: 'L-AGX045', vencimiento: enDias(45),  cantidadBase: 3500 },
    // Dexametasona ampolla (20)
    { productoId: '20', sucursalId: 's-1', lote: 'L-DEX015', vencimiento: enDias(15),  cantidadBase: 30 },
    { productoId: '20', sucursalId: 's-1', lote: 'L-DEX400', vencimiento: enDias(400), cantidadBase: 20 },
     ──────────────────── fin MOCK HISTÓRICO de lotes ──────────────────── */
  readonly lotes = this._lotes.asReadonly();

  // ── Movimientos (auditoría) ──────────────────────────────────────────
  private readonly _movimientos = signal<MovimientoStock[]>([]);
  readonly movimientos = this._movimientos.asReadonly();

  /**
   * Reemplaza el stock y lotes en memoria con datos REALES del backend.
   * Lo llama ProductoService.cargar() para que el POS y el resto trabajen
   * con stock verdadero por sucursal (ids reales).
   */
  cargar(
    stockRows: { productoId: string; sucursalId: string; cantidadBase: number; stockMinimo: number }[],
    loteRows: { productoId: string; sucursalId: string; lote: string; vencimiento: string; cantidadBase: number }[],
  ): void {
    this._stocks.set(
      stockRows.map((s) => ({
        productoId: s.productoId,
        sucursalId: s.sucursalId,
        cantidadBase: s.cantidadBase,
        stockMinimo: s.stockMinimo,
      })),
    );
    this._lotes.set(
      loteRows.map((l) => ({
        productoId: l.productoId,
        sucursalId: l.sucursalId,
        lote: l.lote,
        vencimiento: l.vencimiento.slice(0, 10),
        cantidadBase: l.cantidadBase,
      })),
    );
  }

  /**
   * Refresh PARCIAL: reemplaza stock y lotes SOLO de los productos indicados
   * (post-venta se refrescan los vendidos, sin recargar todo el catálogo).
   */
  actualizarParcial(
    sucursalId: string,
    stockRows: { productoId: string; sucursalId: string; cantidadBase: number; stockMinimo: number }[],
    loteRows: { productoId: string; sucursalId: string; lote: string; vencimiento: string; cantidadBase: number }[],
  ): void {
    const ids = new Set(stockRows.map((s) => s.productoId));
    this._stocks.update((rows) => [
      ...rows.filter((r) => !(r.sucursalId === sucursalId && ids.has(r.productoId))),
      ...stockRows.map((s) => ({
        productoId: s.productoId,
        sucursalId: s.sucursalId,
        cantidadBase: s.cantidadBase,
        stockMinimo: s.stockMinimo,
      })),
    ]);
    this._lotes.update((rows) => [
      ...rows.filter((r) => !(r.sucursalId === sucursalId && ids.has(r.productoId))),
      ...loteRows.map((l) => ({
        productoId: l.productoId,
        sucursalId: l.sucursalId,
        lote: l.lote,
        vencimiento: l.vencimiento.slice(0, 10),
        cantidadBase: l.cantidadBase,
      })),
    ]);
  }

  // ── Lotes / vencimiento ───────────────────────────────────────────────

  /** Lotes de un producto en una sucursal, ordenados FEFO (vence antes primero). */
  lotesEn(productoId: string, sucursalId: string): Lote[] {
    return this._lotes()
      .filter(l => l.productoId === productoId && l.sucursalId === sucursalId && l.cantidadBase > 0)
      .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
  }

  /** Días que faltan para vencer (negativo = ya vencido). */
  diasParaVencer(vencimiento: string): number {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const v = new Date(vencimiento + 'T00:00:00');
    return Math.round((v.getTime() - hoy.getTime()) / 86_400_000);
  }

  /** Lotes por vencer en <= `dias` (incluye vencidos), ordenados FEFO. */
  proximosAVencer(sucursalId: string, dias = 90): Lote[] {
    return this._lotes()
      .filter(l => l.sucursalId === sucursalId && l.cantidadBase > 0 && this.diasParaVencer(l.vencimiento) <= dias)
      .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
  }

  /** ¿El producto tiene control por lotes en esta sucursal? */
  tieneLotes(productoId: string, sucursalId: string): boolean {
    return this._lotes().some(l => l.productoId === productoId && l.sucursalId === sucursalId);
  }

  /** Lotes vigentes (no vencidos) con stock, ordenados FEFO. */
  lotesVigentesEn(productoId: string, sucursalId: string): Lote[] {
    return this.lotesEn(productoId, sucursalId).filter(l => this.diasParaVencer(l.vencimiento) >= 0);
  }

  /** Lotes vencidos con stock (no vendibles, deben darse de baja). */
  lotesVencidosEn(productoId: string, sucursalId: string): Lote[] {
    return this.lotesEn(productoId, sucursalId).filter(l => this.diasParaVencer(l.vencimiento) < 0);
  }

  /**
   * Stock VENDIBLE en unidad base. Si el producto se controla por lotes,
   * solo cuenta los lotes vigentes (los vencidos quedan bloqueados). Si no
   * tiene lotes, usa el stock agregado de siempre.
   */
  stockVendibleEn(productoId: string, sucursalId: string): number {
    if (!this.tieneLotes(productoId, sucursalId)) return this.stockEn(productoId, sucursalId);
    return this.lotesVigentesEn(productoId, sucursalId).reduce((s, l) => s + l.cantidadBase, 0);
  }

  /** Lote que se despacharía ahora (el vigente que vence primero), o null. */
  loteDespacho(productoId: string, sucursalId: string): Lote | null {
    return this.lotesVigentesEn(productoId, sucursalId)[0] ?? null;
  }

  /** Consume unidades base de los lotes más próximos a vencer (FEFO). */
  private consumirLotesFEFO(productoId: string, sucursalId: string, cantidad: number): void {
    let restante = cantidad;
    const todos = this._lotes();
    const orden = todos
      .map((l, i) => ({ l, i }))
      .filter(x => x.l.productoId === productoId && x.l.sucursalId === sucursalId
        && x.l.cantidadBase > 0 && this.diasParaVencer(x.l.vencimiento) >= 0)
      .sort((a, b) => a.l.vencimiento.localeCompare(b.l.vencimiento));
    if (!orden.length) return;
    const nuevo = [...todos];
    for (const { l, i } of orden) {
      if (restante <= 0) break;
      const quita = Math.min(l.cantidadBase, restante);
      nuevo[i] = { ...l, cantidadBase: l.cantidadBase - quita };
      restante -= quita;
    }
    this._lotes.set(nuevo);
  }

  // ════════════════════════════════════════════════════════════════════════
  // Consultas
  // ════════════════════════════════════════════════════════════════════════

  /** Stock actual de un producto en una sucursal específica (en unidad base) */
  stockEn(productoId: string, sucursalId: string): number {
    const r = this._stocks().find(s => s.productoId === productoId && s.sucursalId === sucursalId);
    return r?.cantidadBase ?? 0;
  }

  /** Stock total de un producto sumando todas las sucursales */
  stockGlobal(productoId: string): number {
    return this._stocks()
      .filter(s => s.productoId === productoId)
      .reduce((acc, s) => acc + s.cantidadBase, 0);
  }

  /** Stock mínimo configurado para el par (producto, sucursal) */
  stockMinimoEn(productoId: string, sucursalId: string): number {
    return this._stocks().find(s => s.productoId === productoId && s.sucursalId === sucursalId)
      ?.stockMinimo ?? 0;
  }

  /** Lista de stocks de una sucursal (para módulo de Inventario) */
  stocksDeSucursal(sucursalId: string): StockSucursal[] {
    return this._stocks().filter(s => s.sucursalId === sucursalId);
  }

  /** Productos con stock bajo (cantidad <= stockMinimo) en una sucursal */
  alertasStockBajo(sucursalId: string): StockSucursal[] {
    return this._stocks().filter(s =>
      s.sucursalId === sucursalId &&
      s.stockMinimo !== undefined &&
      s.cantidadBase <= s.stockMinimo
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // Mutaciones — todas registran un movimiento de auditoría
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Descuenta stock (venta) en una sucursal.
   * @returns true si pudo descontar, false si no había suficiente stock.
   */
  decrementarEn(
    productoId: string,
    sucursalId: string,
    cantidadBase: number,
    tipo: TipoMovimiento = 'VENTA',
    referenciaId?: string,
  ): boolean {
    if (cantidadBase <= 0) return false;
    const actual = this.stockEn(productoId, sucursalId);
    if (actual < cantidadBase) return false;

    this._stocks.update(lista =>
      lista.map(s =>
        s.productoId === productoId && s.sucursalId === sucursalId
          ? { ...s, cantidadBase: s.cantidadBase - cantidadBase, actualizadoEn: new Date().toISOString() }
          : s
      )
    );
    this.consumirLotesFEFO(productoId, sucursalId, cantidadBase);
    this.registrarMovimiento(productoId, sucursalId, -cantidadBase, tipo, referenciaId);
    return true;
  }

  /**
   * Aumenta stock (compra, ajuste, ingreso de mercadería) en una sucursal.
   */
  aumentarEn(
    productoId: string,
    sucursalId: string,
    cantidadBase: number,
    tipo: TipoMovimiento = 'COMPRA',
    motivo?: string,
  ): void {
    if (cantidadBase <= 0) return;

    // Si no existe el registro (productoId, sucursalId), lo creamos
    const existe = this._stocks().some(s => s.productoId === productoId && s.sucursalId === sucursalId);
    if (!existe) {
      this._stocks.update(lista => [
        ...lista,
        { productoId, sucursalId, cantidadBase, actualizadoEn: new Date().toISOString() },
      ]);
    } else {
      this._stocks.update(lista =>
        lista.map(s =>
          s.productoId === productoId && s.sucursalId === sucursalId
            ? { ...s, cantidadBase: s.cantidadBase + cantidadBase, actualizadoEn: new Date().toISOString() }
            : s
        )
      );
    }
    this.registrarMovimiento(productoId, sucursalId, cantidadBase, tipo, undefined, motivo);
  }

  /**
   * Traslado entre sucursales: descuenta de origen y suma a destino.
   * @returns true si pudo trasladar, false si no había stock en origen.
   */
  trasladar(
    productoId: string,
    sucursalOrigenId: string,
    sucursalDestinoId: string,
    cantidadBase: number,
    motivo?: string,
  ): boolean {
    if (cantidadBase <= 0) return false;
    if (sucursalOrigenId === sucursalDestinoId) return false;

    const ok = this.decrementarEn(productoId, sucursalOrigenId, cantidadBase, 'TRASLADO_SALIDA', motivo);
    if (!ok) return false;
    this.aumentarEn(productoId, sucursalDestinoId, cantidadBase, 'TRASLADO_INGRESO', motivo);
    return true;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Internos
  // ════════════════════════════════════════════════════════════════════════

  private registrarMovimiento(
    productoId: string,
    sucursalId: string,
    delta: number,
    tipo: TipoMovimiento,
    referenciaId?: string,
    motivo?: string,
  ): void {
    const mov: MovimientoStock = {
      id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productoId,
      sucursalId,
      tipo,
      cantidadBase: delta,
      motivo,
      referenciaId,
      fecha: new Date().toISOString(),
    };
    this._movimientos.update(lista => [mov, ...lista].slice(0, 500)); // mantener últimos 500
  }
}
