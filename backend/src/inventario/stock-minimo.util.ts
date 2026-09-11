import { Prisma } from '@prisma/client';

/**
 * Stock mínimo con el que nace la fila de stock de un producto en una sucursal.
 *
 * EL PROBLEMA QUE RESUELVE: `StockSucursal.stockMinimo` tenía default 0, y ni
 * el alta de producto ni la compra lo definían. Las dos consultas de alerta
 * exigen `stockMinimo > 0` (reportes.service y inventario.service), así que
 * ningún producto disparaba jamás un aviso de stock bajo: la botica se enteraba
 * de que se había quedado sin algo cuando el cliente lo pedía. Y existía un
 * `Configuracion.stockMinimoDefault` que se guardaba en Ajustes y no leía nadie.
 *
 * Prioridad: el mínimo del PRODUCTO manda (un analgésico de alta rotación no
 * necesita el mismo colchón que un producto de nicho); si no está definido, se
 * usa el default global de Configuración.
 */
export function resolverStockMinimo(
  minimoProducto: number | null | undefined,
  defaultGlobal: number,
): number {
  if (minimoProducto && minimoProducto > 0) return minimoProducto;
  return defaultGlobal > 0 ? defaultGlobal : 0;
}

/**
 * Lee el default global de Configuración. Devuelve 5 si aún no hay fila creada
 * (mismo valor que el default del schema), para no dejar el mínimo en 0.
 */
export async function stockMinimoDefaultGlobal(
  tx: Prisma.TransactionClient | { configuracion: { findUnique: Function } },
): Promise<number> {
  try {
    const cfg = await (tx as Prisma.TransactionClient).configuracion.findUnique({
      where: { id: 'global' },
      select: { stockMinimoDefault: true },
    });
    return cfg?.stockMinimoDefault ?? 5;
  } catch {
    return 5;
  }
}
