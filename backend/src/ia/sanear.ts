/**
 * FarmaSys — Sistema de gestión para cadena de boticas
 * Copyright (c) 2026 Axel Huatuco Bravo <axelhdev@gmail.com>
 * Todos los derechos reservados. Código propietario — ver LICENSE.
 *
 * Publicado para lectura y evaluación profesional. Prohibido el uso comercial,
 * la redistribución y las obras derivadas sin autorización escrita.
 */
import { AnalisisIA } from './analizador-ia.interface';

/**
 * Cordón sanitario entre el modelo y el usuario.
 *
 * El prompt le prohíbe al modelo inventar códigos; esto comprueba que obedeció.
 * Todo código que no esté en la tabla real que se le envió se DESCARTA y se
 * cuenta. Es la diferencia entre "la IA sugiere pedir 500 de un producto que no
 * existe" y "el sistema no deja pasar eso".
 *
 * Además recorta longitudes: la respuesta de un modelo es entrada no confiable,
 * y no se le deja meter un texto de 40 KB en una pantalla.
 */

const MAX_GRUPOS = 8;
const MAX_CODIGOS_POR_GRUPO = 40;
const MAX_AVISOS = 6;
const LARGO_TITULO = 120;
const LARGO_MOTIVO = 400;
const LARGO_RESUMEN = 700;
const LARGO_AVISO = 300;

export interface ResultadoSaneado {
  analisis: AnalisisIA;
  /** Cuántos códigos citó el modelo que no existían en la tabla. */
  descartados: number;
}

function recortar(texto: string, max: number): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

export function sanearAnalisis(analisis: AnalisisIA, codigosValidos: Set<string>): ResultadoSaneado {
  let descartados = 0;
  const yaUsados = new Set<string>();

  const grupos = analisis.grupos
    .slice(0, MAX_GRUPOS)
    .map((grupo) => {
      const codigos: string[] = [];
      for (const codigo of grupo.codigos) {
        const clave = codigo.trim();
        if (!codigosValidos.has(clave)) {
          descartados += 1;
          continue;
        }
        // Un producto en dos grupos confunde más de lo que aporta.
        if (yaUsados.has(clave)) continue;
        if (codigos.length >= MAX_CODIGOS_POR_GRUPO) break;
        yaUsados.add(clave);
        codigos.push(clave);
      }
      return {
        titulo: recortar(grupo.titulo, LARGO_TITULO),
        motivo: recortar(grupo.motivo, LARGO_MOTIVO),
        codigos,
      };
    })
    .filter((grupo) => grupo.codigos.length > 0);

  const avisos = analisis.avisos
    .slice(0, MAX_AVISOS)
    .map((aviso) => recortar(aviso, LARGO_AVISO))
    .filter((aviso) => aviso.length > 0);

  if (descartados > 0) {
    avisos.push(
      `El sistema descartó ${descartados} código(s) citados por el modelo que no estaban en la tabla de reposición.`,
    );
  }

  return {
    analisis: {
      resumen: recortar(analisis.resumen, LARGO_RESUMEN),
      grupos,
      avisos,
    },
    descartados,
  };
}
