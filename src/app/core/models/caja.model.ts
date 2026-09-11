import { MetodoPago } from './carrito.model';

/**
 * Caja (turno de cajero) — apertura, movimientos y cierre con arqueo.
 *
 * Cada cajero abre SU caja con un fondo (monto inicial). Durante el turno se
 * acumulan las ventas por método de pago y los movimientos de efectivo
 * (ingresos/egresos). Al cerrar se cuenta el efectivo físico y se compara
 * contra el esperado → diferencia. Todo queda auditado por usuario y hora.
 *
 * La sesión se define por apertura → cierre (puede cruzar la medianoche en el
 * turno noche), no por fecha calendario.
 */

export type TipoMovimientoCaja = 'INGRESO' | 'EGRESO';

/** Categorías típicas de movimiento de efectivo en una botica. */
export type CategoriaMovimientoCaja =
  | 'APORTE_SENCILLO'   // ingreso: se agrega sencillo a la caja
  | 'AJUSTE_INGRESO'    // ingreso: ajuste / devolución de gasto
  | 'RETIRO'            // egreso: retiro de efectivo a bóveda/depósito
  | 'PAGO_PROVEEDOR'    // egreso: pago a proveedor
  | 'GASTO'             // egreso: gasto menor (delivery, limpieza, servicios)
  | 'VUELTO';           // egreso: ajuste de vuelto/sencillo entregado

export interface MovimientoCaja {
  id: string;
  tipo: TipoMovimientoCaja;
  categoria: CategoriaMovimientoCaja;
  monto: number;        // SIEMPRE positivo; el signo lo da `tipo`
  motivo: string;       // obligatorio (trazabilidad)
  fecha: string;        // ISO
}

/** Snapshot de una venta cobrada, asociada a la caja para el arqueo. */
export interface VentaCaja {
  comprobante: string;
  metodo: MetodoPago;
  total: number;
  fecha: string;        // ISO
}

/** Resultado del cierre (arqueo). */
export interface CierreCaja {
  efectivoEsperado: number;   // montoInicial + ventasEfectivo + ingresos − egresos
  efectivoContado: number;    // lo que contó el cajero
  diferencia: number;         // contado − esperado (negativo = faltante)
  totalEfectivo: number;      // solo ventas en efectivo
  totalYapePlin: number;
  totalTarjeta: number;
  totalOtros: number;         // transferencia / mixto
  totalIngresos: number;
  totalEgresos: number;
  totalVentas: number;
  cantidadTickets: number;
  cerradaEn: string;          // ISO
  /** Quién cerró la caja. Normalmente el cajero; un admin puede forzarlo. */
  cerradaPorNombre?: string;
  cerradaPorAdmin?: boolean;  // true si fue cierre forzado por un admin
}

export interface CajaSesion {
  id: string;
  sucursalId: string;
  cajeroId: string;
  cajeroNombre: string;
  terminal: string;
  montoInicial: number;
  aperturaEn: string;         // ISO
  estado: 'ABIERTA' | 'CERRADA';
  ventas: VentaCaja[];
  movimientos: MovimientoCaja[];
  cierre?: CierreCaja;
}

/** Totales en vivo de una sesión (para el panel y el arqueo). */
export interface TotalesCaja {
  totalEfectivo: number;
  totalYapePlin: number;
  totalTarjeta: number;
  totalOtros: number;
  totalVentas: number;
  cantidadTickets: number;
  totalIngresos: number;
  totalEgresos: number;
  efectivoEsperado: number;
}
