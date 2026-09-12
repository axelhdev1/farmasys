/**
 * FarmaSys — Sistema de gestión para cadena de boticas
 * Copyright (c) 2026 Axel Huatuco Bravo <axelhdev@gmail.com>
 * Todos los derechos reservados. Código propietario — ver LICENSE.
 *
 * Publicado para lectura y evaluación profesional. Prohibido el uso comercial,
 * la redistribución y las obras derivadas sin autorización escrita.
 */

/**
 * Contrato del analizador de IA.
 *
 * El proveedor concreto (hoy Gemini) queda DETRÁS de esta interfaz. Cambiar a
 * Claude, a un modelo local con Ollama o a OpenAI es escribir otra clase que
 * implemente `AnalizadorIA` y cambiar una línea en `ia.module.ts`: ni el
 * servicio ni el controlador se enteran.
 *
 * Regla dura del módulo: EL MODELO NO CALCULA NÚMEROS.
 * Todas las cifras (velocidad de venta, días de cobertura, cantidad sugerida)
 * salen del módulo de Reposición, que consulta la base de datos. El modelo solo
 * LEE esa tabla y devuelve texto: agrupa, prioriza y explica. Un LLM alucinando
 * una cantidad de compra en una botica es plata real perdida en mercadería
 * parada o en un quiebre de stock.
 */

/** Fila de la tabla de reposición, ya compactada para enviarla al modelo. */
export interface FilaReposicionIA {
  codigo: string;
  nombre: string;
  stockActual: number;
  stockMinimo: number;
  vendidoPeriodo: number;
  velocidadDia: number;
  /** null = no se vendió nada en la ventana, no hay cobertura calculable. */
  diasCobertura: number | null;
  sugerido: number;
}

/** Lo que se le entrega al analizador. Solo datos ya calculados por el sistema. */
export interface EntradaAnalisis {
  dias: number;
  objetivo: number;
  filas: FilaReposicionIA[];
}

/**
 * Grupo propuesto por el modelo. `codigos` SIEMPRE se valida contra la tabla
 * real antes de devolverse al cliente (ver `sanear.ts`).
 */
export interface GrupoIA {
  titulo: string;
  motivo: string;
  codigos: string[];
}

/** Salida textual del modelo, ya normalizada. */
export interface AnalisisIA {
  resumen: string;
  grupos: GrupoIA[];
  avisos: string[];
}

export interface AnalizadorIA {
  /** Identificador del modelo, para mostrarlo en la respuesta y en los logs. */
  readonly nombre: string;
  /** ¿Hay credenciales configuradas? Si no, el módulo degrada sin llamar a nadie. */
  disponible(): boolean;
  analizarReposicion(entrada: EntradaAnalisis): Promise<AnalisisIA>;
}

/** Token de inyección del proveedor de IA. */
export const ANALIZADOR_IA = 'ANALIZADOR_IA';
