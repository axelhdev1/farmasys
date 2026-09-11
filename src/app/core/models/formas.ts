/**
 * Formas farmacéuticas — espejo de backend/src/productos/formas-farmaceuticas.ts.
 *
 * Lista cerrada: con texto libre convivirían "tableta", "Tableta" y "tabletas"
 * como valores distintos y el POS no podría filtrar por forma.
 */
export type FormaFarmaceutica =
  | 'TABLETA' | 'CAPSULA' | 'JARABE' | 'SUSPENSION' | 'AMPOLLA'
  | 'INYECTABLE' | 'CREMA' | 'UNGUENTO' | 'GOTAS' | 'SPRAY'
  | 'OVULO' | 'SUPOSITORIO' | 'PARCHE' | 'POLVO' | 'OTRO';

export interface OpcionForma {
  valor: FormaFarmaceutica;
  label: string;
}

/** Opciones para el selector, en el orden en que se usan en una botica. */
export const FORMAS_FARMACEUTICAS: OpcionForma[] = [
  { valor: 'TABLETA',     label: 'Tableta' },
  { valor: 'CAPSULA',     label: 'Cápsula' },
  { valor: 'JARABE',      label: 'Jarabe' },
  { valor: 'SUSPENSION',  label: 'Suspensión' },
  { valor: 'GOTAS',       label: 'Gotas' },
  { valor: 'AMPOLLA',     label: 'Ampolla' },
  { valor: 'INYECTABLE',  label: 'Inyectable' },
  { valor: 'CREMA',       label: 'Crema' },
  { valor: 'UNGUENTO',    label: 'Ungüento' },
  { valor: 'SPRAY',       label: 'Spray / Aerosol' },
  { valor: 'OVULO',       label: 'Óvulo' },
  { valor: 'SUPOSITORIO', label: 'Supositorio' },
  { valor: 'PARCHE',      label: 'Parche' },
  { valor: 'POLVO',       label: 'Polvo' },
  { valor: 'OTRO',        label: 'Otro' },
];

/** Etiqueta legible de una forma ('' si el producto no la tiene definida). */
export function etiquetaForma(valor?: string | null): string {
  if (!valor) return '';
  return FORMAS_FARMACEUTICAS.find((f) => f.valor === valor)?.label ?? valor;
}
