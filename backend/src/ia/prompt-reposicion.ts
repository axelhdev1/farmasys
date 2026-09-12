/**
 * FarmaSys — Sistema de gestión para cadena de boticas
 * Copyright (c) 2026 Axel Huatuco Bravo <axelhdev@gmail.com>
 * Todos los derechos reservados. Código propietario — ver LICENSE.
 *
 * Publicado para lectura y evaluación profesional. Prohibido el uso comercial,
 * la redistribución y las obras derivadas sin autorización escrita.
 */
import { EntradaAnalisis } from './analizador-ia.interface';

/**
 * Instrucción de sistema.
 *
 * Está escrita para CERRAR la puerta a lo único que puede hacer daño aquí:
 * que el modelo invente cifras o códigos.
 *
 * La regla 2 (no escribir cifras) no es teórica: en la primera corrida real el
 * modelo copió "26.63 un/día" de una fila que decía 27.63. No calculó mal —
 * transcribió mal. Los números ya están en la tabla, a dos centímetros del
 * texto; que el modelo los repita solo añade una superficie donde equivocarse. Se le prohíbe calcular, se le dice
 * que los códigos son un conjunto cerrado, y aun así la salida se valida
 * contra la tabla real en `sanear.ts` — el prompt es la primera barrera, no
 * la única. Nunca se confía en que el modelo obedezca.
 */
export const INSTRUCCION_SISTEMA = [
  'Eres el asistente de compras de FarmaSys, un sistema de gestión para una cadena de boticas en Perú.',
  'Recibes una tabla YA CALCULADA por el sistema con la sugerencia de reposición por demanda.',
  '',
  'REGLAS INNEGOCIABLES:',
  '1. NO calcules, no estimes y no corrijas ningún número. Las cifras son las del sistema.',
  '2. NO ESCRIBAS CIFRAS en tus textos: ni stock, ni unidades por día, ni días de cobertura,',
  '   ni cantidades a pedir. La tabla ya las muestra al lado. Di "el de mayor rotación" o',
  '   "los que se agotan esta semana", nunca el número. Copiar un número mal es peor que no ponerlo.',
  '3. NO inventes códigos ni productos. Solo puedes citar códigos que aparezcan en la tabla.',
  '4. NO recomiendes tratamientos, dosis ni sustituciones clínicas. Esto es logística, no salud.',
  '5. Si la tabla es pobre o ambigua, dilo en "avisos" en vez de rellenar con suposiciones.',
  '',
  'TU TRABAJO es convertir una tabla larga en un plan de compra legible:',
  '- Agrupa los productos en 3 a 6 grupos accionables (por urgencia de quiebre, por rotación,',
  '  por si conviene pedirlos juntos al mismo proveedor, por stock muerto que NO conviene reponer).',
  '- Explica en una frase por qué cada grupo importa, en castellano de Perú, directo y sin adornos.',
  '- Prioriza: lo que se queda sin stock antes va primero.',
  '- Señala en "avisos" los casos raros que el encargado debe mirar con ojo',
  '  (ventas de golpe, productos sin rotación con stock alto, cobertura nula).',
  '',
  'FORMATO: responde SOLO con un objeto JSON válido, sin texto alrededor y sin bloques de código:',
  '{"resumen":"2 o 3 frases","grupos":[{"titulo":"...","motivo":"...","codigos":["ABC123"]}],"avisos":["..."]}',
].join('\n');

/**
 * Arma el mensaje del usuario. La tabla va como CSV con `;` en lugar de JSON:
 * mismo contenido, bastante menos tokens (importa en el tier gratuito, que
 * tiene tope diario de peticiones).
 */
export function construirPrompt(entrada: EntradaAnalisis): string {
  const cabecera = 'codigo;producto;stock;stock_minimo;vendido_periodo;venta_dia;dias_cobertura;sugerido';
  const lineas = entrada.filas.map((f) =>
    [
      f.codigo,
      f.nombre.replace(/;/g, ','),
      f.stockActual,
      f.stockMinimo,
      f.vendidoPeriodo,
      f.velocidadDia,
      f.diasCobertura === null ? 'sin_rotacion' : f.diasCobertura,
      f.sugerido,
    ].join(';'),
  );

  return [
    `Ventana de análisis: últimos ${entrada.dias} días. Cobertura objetivo: ${entrada.objetivo} días.`,
    `Productos que el sistema marcó para reponer: ${entrada.filas.length}.`,
    '',
    'Tabla (unidades en la unidad base del producto):',
    cabecera,
    ...lineas,
    '',
    'Devuelve el JSON del plan de compra.',
  ].join('\n');
}
