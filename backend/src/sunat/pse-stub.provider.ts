import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  ComprobanteParaEnvio,
  PseProvider,
  RespuestaPse,
} from './pse.interface';

/**
 * Implementación STUB del PSE para desarrollo local: genera un XML mínimo y un
 * hash determinístico, y simula la aceptación de SUNAT. En producción se
 * reemplaza por NubefactProvider/BizlinksProvider (mismo contrato PseProvider)
 * sin tocar el resto del sistema.
 */
@Injectable()
export class PseStubProvider implements PseProvider {
  async enviar(c: ComprobanteParaEnvio): Promise<RespuestaPse> {
    const xml = this.construirXmlMinimo(c);
    const hash = createHash('sha256').update(xml).digest('hex');
    return {
      estado: 'ACEPTADO',
      hash,
      xml,
      cdr: `CDR-STUB-${c.serie}-${c.numero}`,
      observaciones: 'Aceptado (entorno de pruebas / stub).',
    };
  }

  async consultarEstado(ticket: string): Promise<RespuestaPse> {
    return { estado: 'ACEPTADO', ticket, observaciones: 'Aceptado (stub).' };
  }

  private construirXmlMinimo(c: ComprobanteParaEnvio): string {
    const items = c.items
      .map(
        (it, i) =>
          `    <Item n="${i + 1}" desc="${it.descripcion}" cant="${it.cantidad}" precio="${it.precio}"/>`,
      )
      .join('\n');
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<Comprobante tipo="${c.tipo}" serie="${c.serie}" numero="${c.numero}">`,
      `  <Total igv="${c.igv}">${c.total}</Total>`,
      `  <Items>`,
      items,
      `  </Items>`,
      `</Comprobante>`,
    ].join('\n');
  }
}
