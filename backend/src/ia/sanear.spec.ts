/**
 * FarmaSys — Sistema de gestión para cadena de boticas
 * Copyright (c) 2026 Axel Huatuco Bravo <axelhdev@gmail.com>
 * Todos los derechos reservados. Código propietario — ver LICENSE.
 */
import { sanearAnalisis } from './sanear';
import { AnalisisIA } from './analizador-ia.interface';

/**
 * Lo que se prueba aquí es la garantía del módulo: por mucho que el modelo
 * invente, al cliente solo llegan códigos que existen en la tabla real.
 */
describe('sanearAnalisis', () => {
  const validos = new Set(['P001', 'P002', 'P003']);

  const base = (parcial: Partial<AnalisisIA>): AnalisisIA => ({
    resumen: '',
    grupos: [],
    avisos: [],
    ...parcial,
  });

  it('descarta los códigos que el modelo se inventó', () => {
    const { analisis, descartados } = sanearAnalisis(
      base({
        grupos: [
          { titulo: 'Urgentes', motivo: 'Se quiebran esta semana', codigos: ['P001', 'NO-EXISTE', 'P002'] },
        ],
      }),
      validos,
    );

    expect(descartados).toBe(1);
    expect(analisis.grupos[0].codigos).toEqual(['P001', 'P002']);
    expect(analisis.avisos.some((a) => a.includes('descartó'))).toBe(true);
  });

  it('elimina los grupos que se quedan sin ningún código válido', () => {
    const { analisis } = sanearAnalisis(
      base({ grupos: [{ titulo: 'Fantasma', motivo: 'x', codigos: ['XXX', 'YYY'] }] }),
      validos,
    );

    expect(analisis.grupos).toHaveLength(0);
  });

  it('no repite un producto en dos grupos', () => {
    const { analisis } = sanearAnalisis(
      base({
        grupos: [
          { titulo: 'A', motivo: 'x', codigos: ['P001', 'P002'] },
          { titulo: 'B', motivo: 'y', codigos: ['P002', 'P003'] },
        ],
      }),
      validos,
    );

    expect(analisis.grupos[0].codigos).toEqual(['P001', 'P002']);
    expect(analisis.grupos[1].codigos).toEqual(['P003']);
  });

  it('recorta textos desmedidos del modelo', () => {
    const { analisis } = sanearAnalisis(
      base({ resumen: 'a'.repeat(5000), grupos: [{ titulo: 'b'.repeat(500), motivo: '', codigos: ['P001'] }] }),
      validos,
    );

    expect(analisis.resumen.length).toBeLessThanOrEqual(700);
    expect(analisis.grupos[0].titulo.length).toBeLessThanOrEqual(120);
  });
});
