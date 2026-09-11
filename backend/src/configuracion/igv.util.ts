import { Prisma } from '@prisma/client';

/** IGV peruano vigente. Se usa si Configuración no tiene un valor propio. */
export const IGV_POR_DEFECTO = new Prisma.Decimal(0.18);

/**
 * Tasa de IGV configurada, como decimal (0.18 = 18%).
 *
 * Estaba fija en 0.18 dentro del código, en tres archivos, mientras Ajustes
 * mostraba un campo "IGV %" que no hacía nada: se guardaba y nadie lo leía.
 *
 * `Configuracion.igvPorcentaje` se guarda como PORCENTAJE (18), no como
 * fracción — por eso se divide entre 100.
 *
 * Nunca lanza: si la configuración no existe o trae un valor absurdo, se cae
 * al 18% para no romper un cobro en curso.
 */
export async function obtenerTasaIgv(
  tx: Prisma.TransactionClient | { configuracion: { findUnique: Function } },
): Promise<Prisma.Decimal> {
  try {
    const cfg = await (tx as Prisma.TransactionClient).configuracion.findUnique({
      where: { id: 'global' },
      select: { igvPorcentaje: true },
    });
    if (!cfg?.igvPorcentaje) return IGV_POR_DEFECTO;

    const pct = new Prisma.Decimal(cfg.igvPorcentaje);
    // Rango sensato: entre 0% y 50%. Fuera de ahí es un error de captura.
    if (pct.lessThan(0) || pct.greaterThan(50)) return IGV_POR_DEFECTO;
    return pct.dividedBy(100);
  } catch {
    return IGV_POR_DEFECTO;
  }
}
