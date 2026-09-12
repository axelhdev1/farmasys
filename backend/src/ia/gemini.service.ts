/**
 * FarmaSys — Sistema de gestión para cadena de boticas
 * Copyright (c) 2026 Axel Huatuco Bravo <axelhdev@gmail.com>
 * Todos los derechos reservados. Código propietario — ver LICENSE.
 *
 * Publicado para lectura y evaluación profesional. Prohibido el uso comercial,
 * la redistribución y las obras derivadas sin autorización escrita.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  AnalisisIA,
  AnalizadorIA,
  EntradaAnalisis,
} from './analizador-ia.interface';
import { INSTRUCCION_SISTEMA, construirPrompt } from './prompt-reposicion';

/**
 * Implementación del analizador contra la API de Gemini (Google AI Studio).
 *
 * POR QUÉ GEMINI: es el único proveedor con un tier gratuito real y sin tarjeta
 * (Flash / Flash-Lite, ~1.500 peticiones al día). Para una demo y para el
 * desarrollo alcanza de sobra. ADVERTENCIA CONSCIENTE: en el tier gratuito
 * Google puede usar el contenido para mejorar sus modelos, así que para una
 * botica en producción esto iría a tier de pago o a un modelo local (Ollama).
 * Por eso el proveedor está detrás de `AnalizadorIA` y se cambia en una línea.
 *
 * SIN SDK: se llama por HTTP con el `fetch` nativo de Node 20. Cero
 * dependencias nuevas, cero superficie de supply chain, y el día que cambie el
 * contrato se ve aquí mismo.
 *
 * EL MODELO SE CONFIGURA POR ENTORNO (GEMINI_MODEL), no está clavado en el
 * código: Google retira versiones con el tiempo (gemini-2.5-flash dejó de
 * aceptar claves nuevas en septiembre de 2026), y cuando pasa hay que poder
 * cambiarlo editando el .env, sin recompilar.
 *
 * LA CLAVE VIVE SOLO AQUÍ, en el backend, leída de process.env. Nunca viaja al
 * navegador: el front llama a /api/v1/ia/..., no a Google.
 */

const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 30_000;
const MODELO_POR_DEFECTO = 'gemini-3.6-flash';

/**
 * Fallos TRANSITORIOS del proveedor: saturación (503), cuota momentánea (429)
 * y errores de servidor. No significan que el módulo esté roto — significan
 * "vuelve a intentar en un segundo", y en el tier gratuito pasan a diario.
 */
const ESTADOS_TRANSITORIOS = [429, 500, 502, 503, 504];
const REINTENTOS_TRANSITORIOS = 2;
const ESPERA_BASE_MS = 1_500;

interface RespuestaGemini {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message?: string; status?: string };
}

@Injectable()
export class GeminiService implements AnalizadorIA {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey: string = (process.env.GEMINI_API_KEY ?? '').trim();

  readonly nombre: string = (process.env.GEMINI_MODEL ?? MODELO_POR_DEFECTO).trim() || MODELO_POR_DEFECTO;

  disponible(): boolean {
    return this.apiKey.length > 0;
  }

  async analizarReposicion(entrada: EntradaAnalisis): Promise<AnalisisIA> {
    const cuerpoBase = {
      systemInstruction: { parts: [{ text: INSTRUCCION_SISTEMA }] },
      contents: [{ role: 'user', parts: [{ text: construirPrompt(entrada) }] }],
    };

    /**
     * CASCADA DE CONFIGURACIONES, de la más controlada a la más básica.
     *
     * La API rechaza con 400 los campos que un modelo concreto no soporta, y
     * esos campos cambian entre generaciones: gemini-2.5 acepta
     * `thinkingConfig`, gemini-3.6 lo rechaza. Clavar una sola configuración es
     * garantizar que el módulo se rompa en la próxima versión del modelo, así
     * que se prueban en orden y se usa la primera que el modelo acepte.
     *
     * El último intento no lleva `generationConfig`: es el mínimo común
     * denominador. Si el modelo responde con texto en vez de JSON puro,
     * `extraerJson` lo recupera igual.
     */
    const configuraciones: Array<Record<string, unknown> | null> = [
      {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
      { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: 'application/json' },
      { temperature: 0.2, maxOutputTokens: 8192 },
      null,
    ];

    let ultimoError: Error | null = null;
    for (const config of configuraciones) {
      const cuerpo = config ? { ...cuerpoBase, generationConfig: config } : cuerpoBase;
      try {
        return this.parsear(await this.pedirConReintentos(cuerpo));
      } catch (error) {
        const e = error instanceof Error ? error : new Error(String(error));
        ultimoError = e;
        // Solo se reintenta cuando el modelo RECHAZÓ la configuración (400).
        // Un fallo de red o un JSON ilegible no se arreglan cambiando campos.
        if (!e.message.includes('Gemini respondió 400')) throw e;
        this.logger.warn(`Configuración no aceptada, probando la siguiente: ${e.message}`);
      }
    }

    throw ultimoError ?? new Error('El modelo no aceptó ninguna configuración');
  }

  /**
   * Llama al modelo reintentando solo los fallos transitorios, con espera
   * creciente (1,5 s y 3 s) para no empeorar la saturación del proveedor. Un
   * 400 o un JSON ilegible no se reintentan: reintentar no los arregla.
   */
  private async pedirConReintentos(cuerpo: unknown): Promise<string> {
    let ultimo: Error | null = null;

    for (let intento = 0; intento <= REINTENTOS_TRANSITORIOS; intento++) {
      try {
        return await this.pedir(cuerpo);
      } catch (error) {
        const e = error instanceof Error ? error : new Error(String(error));
        ultimo = e;
        const transitorio = ESTADOS_TRANSITORIOS.some((codigo) =>
          e.message.includes(`Gemini respondió ${codigo}`),
        );
        if (!transitorio || intento === REINTENTOS_TRANSITORIOS) throw e;

        const espera = ESPERA_BASE_MS * 2 ** intento;
        this.logger.warn(`Fallo transitorio del proveedor. Reintento en ${espera} ms.`);
        await new Promise((resolver) => setTimeout(resolver, espera));
      }
    }

    throw ultimo ?? new Error('Sin respuesta del modelo');
  }

  /** Una llamada HTTP con timeout duro. Devuelve el texto crudo del modelo. */
  private async pedir(cuerpo: unknown): Promise<string> {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);

    try {
      const respuesta = await fetch(`${URL_BASE}/models/${this.nombre}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(cuerpo),
        signal: controlador.signal,
      });

      const crudo = await respuesta.text();
      let datos: RespuestaGemini = {};
      try {
        datos = JSON.parse(crudo) as RespuestaGemini;
      } catch {
        // Respuesta no-JSON (p. ej. una página de error del proxy).
      }

      if (!respuesta.ok) {
        const detalle = datos.error?.message ?? crudo.slice(0, 200);
        throw new Error(`Gemini respondió ${respuesta.status}: ${detalle}`);
      }

      const texto = (datos.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? '')
        .join('')
        .trim();

      if (!texto) {
        const razon = datos.candidates?.[0]?.finishReason ?? 'sin candidatos';
        throw new Error(`Gemini devolvió una respuesta vacía (${razon})`);
      }
      return texto;
    } finally {
      clearTimeout(temporizador);
    }
  }

  /**
   * Convierte el texto del modelo en `AnalisisIA`. Tolerante a propósito: aunque
   * se pida JSON puro, un modelo puede envolverlo en ```json. Lo que NO se
   * tolera es contenido inventado — de eso se encarga `sanear.ts` después.
   */
  private parsear(texto: string): AnalisisIA {
    const datos = this.extraerJson(texto);

    const gruposCrudos = Array.isArray(datos.grupos) ? datos.grupos : [];
    return {
      resumen: typeof datos.resumen === 'string' ? datos.resumen : '',
      grupos: gruposCrudos.map((g) => {
        const grupo = (g ?? {}) as Record<string, unknown>;
        return {
          titulo: typeof grupo.titulo === 'string' ? grupo.titulo : 'Sin título',
          motivo: typeof grupo.motivo === 'string' ? grupo.motivo : '',
          codigos: Array.isArray(grupo.codigos)
            ? grupo.codigos.filter((c): c is string => typeof c === 'string')
            : [],
        };
      }),
      avisos: Array.isArray(datos.avisos)
        ? datos.avisos.filter((a): a is string => typeof a === 'string')
        : [],
    };
  }

  /**
   * Saca el objeto JSON del texto del modelo.
   *
   * Se pide JSON puro con `responseMimeType`, pero un modelo puede envolverlo
   * en un bloque ``` o colar una frase antes. Se intenta el texto tal cual y,
   * si falla, el tramo entre la primera llave y la última. Si aun así no es
   * JSON, el error incluye el principio de lo que llegó: sin eso, depurar un
   * proveedor que cambia de formato es adivinar.
   */
  private extraerJson(texto: string): Record<string, unknown> {
    const limpio = texto
      .replace(/^\s*```(?:json)?/i, '')
      .replace(/```\s*$/, '')
      .trim();

    const candidatos: string[] = [limpio];
    const inicio = limpio.indexOf('{');
    const fin = limpio.lastIndexOf('}');
    if (inicio !== -1 && fin > inicio) candidatos.push(limpio.slice(inicio, fin + 1));

    for (const candidato of candidatos) {
      try {
        return JSON.parse(candidato) as Record<string, unknown>;
      } catch {
        // Se prueba el siguiente candidato.
      }
    }

    const muestra = limpio.replace(/\s+/g, ' ').slice(0, 300);
    throw new Error(`La respuesta del modelo no era JSON válido. Llegó: ${muestra}`);
  }
}
