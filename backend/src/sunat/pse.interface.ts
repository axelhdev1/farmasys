/**
 * Contrato del Proveedor de Servicios Electrónicos (PSE/OSE) — Nubefact,
 * Bizlinks, etc. La implementación concreta se inyecta por DI, de modo que el
 * resto del sistema no depende de un proveedor específico (intercambiable).
 */

export interface ComprobanteParaEnvio {
  tipo: 'BOLETA' | 'FACTURA' | 'NOTA_CREDITO';
  serie: string;
  numero: number;
  // Datos mínimos; la implementación real arma el UBL 2.1 completo.
  total: string;
  igv: string;
  cliente?: { tipoDocumento: string; numeroDocumento: string; nombre: string };
  items: { descripcion: string; cantidad: number; precio: string }[];
}

export interface RespuestaPse {
  estado: 'ACEPTADO' | 'RECHAZADO' | 'ENVIADO';
  hash?: string;
  xml?: string;
  cdr?: string;
  ticket?: string;
  observaciones?: string;
}

/** Token de inyección del proveedor PSE. */
export const PSE_PROVIDER = Symbol('PSE_PROVIDER');

export interface PseProvider {
  /** Envía el comprobante al PSE/OSE y devuelve el resultado (o ticket async). */
  enviar(comprobante: ComprobanteParaEnvio): Promise<RespuestaPse>;
  /** Consulta el estado de un comprobante por su ticket asíncrono. */
  consultarEstado(ticket: string): Promise<RespuestaPse>;
}
