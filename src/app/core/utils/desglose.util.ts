import { Producto, Presentacion, DesgloseVenta, ItemDesglose } from '../models/producto.model';

/**
 * calcularDesgloseVenta — algoritmo greedy de venta fraccionada.
 *
 * Dada una cantidad en UNIDADES BASE (ej. 23 pastillas), devuelve la mejor
 * combinación de presentaciones (caja → blíster → unidad) que la cubre
 * exactamente, usando primero las de mayor factor.
 *
 * Ej. Amoxicilina (caja x100 / blíster x10 / unidad) con cantidad = 123:
 *   1 caja (100) + 2 blísters (20) + 3 unidades (3) = 123 → totalPrecio sumado.
 *
 * Greedy es óptimo aquí porque los factores son divisibles entre sí
 * (100 → 10 → 1), que es el caso real de las presentaciones farmacéuticas.
 *
 * @param producto       Producto con presentaciones[] definidas.
 * @param cantidadBase   Cantidad solicitada en la unidad atómica.
 * @returns DesgloseVenta o null si el producto no tiene presentaciones.
 */
export function calcularDesgloseVenta(
  producto: Producto,
  cantidadBase: number,
): DesgloseVenta | null {
  const presentaciones = producto.presentaciones;
  if (!presentaciones || presentaciones.length === 0) return null;
  if (cantidadBase <= 0) {
    return { items: [], totalUnidadesBase: 0, totalPrecio: 0 };
  }

  // Mayor factor primero (caja → blíster → unidad)
  const ordenadas = [...presentaciones].sort((a, b) => b.factor - a.factor);

  const items: ItemDesglose[] = [];
  let restante = cantidadBase;
  let totalPrecio = 0;

  for (const p of ordenadas) {
    if (restante <= 0) break;
    const cantidad = Math.floor(restante / p.factor);
    if (cantidad <= 0) continue;

    const subtotal = redondear(cantidad * p.precioVenta);
    items.push({ presentacion: p, cantidad, subtotal });
    totalPrecio += subtotal;
    restante -= cantidad * p.factor;
  }

  return {
    items,
    totalUnidadesBase: cantidadBase - restante, // lo efectivamente cubierto
    totalPrecio: redondear(totalPrecio),
  };
}

/**
 * Convierte una cantidad de cierta presentación a unidades base.
 * Útil cuando el cajero elige "3 blísters" y necesitamos descontar stock.
 */
export function aUnidadesBase(presentacion: Presentacion, cantidad: number): number {
  return presentacion.factor * cantidad;
}

/** Redondeo monetario a 2 decimales evitando errores de coma flotante. */
function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
