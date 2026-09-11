/**
 * Cliente registrado en el padrón.
 * Para boleta, es opcional. Para factura con IGV, el RUC es obligatorio.
 */
export type TipoDocumento = 'DNI' | 'RUC' | 'CE' | 'PASAPORTE';

export interface Cliente {
  id: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nombres: string;
  apellidos?: string;
  razonSocial?: string;            // cuando es RUC (persona jurídica)
  direccion?: string;
  telefono?: string;
  email?: string;
  puntos?: number;                 // programa de fidelización (opcional)
  fechaRegistro?: string;
}
