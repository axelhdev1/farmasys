/**
 * Formas farmacéuticas admitidas.
 *
 * Lista CERRADA a propósito. Con texto libre acabarían conviviendo "tableta",
 * "Tableta", "tabletas" y "tab." como cosas distintas, y el buscador del POS
 * dejaría de poder filtrar por forma.
 *
 * Debe coincidir con el catálogo del front (src/app/core/models/formas.ts).
 */
export const FORMAS_FARMACEUTICAS = [
  'TABLETA',
  'CAPSULA',
  'JARABE',
  'SUSPENSION',
  'AMPOLLA',
  'INYECTABLE',
  'CREMA',
  'UNGUENTO',
  'GOTAS',
  'SPRAY',
  'OVULO',
  'SUPOSITORIO',
  'PARCHE',
  'POLVO',
  'OTRO',
] as const;

export type FormaFarmaceutica = (typeof FORMAS_FARMACEUTICAS)[number];
