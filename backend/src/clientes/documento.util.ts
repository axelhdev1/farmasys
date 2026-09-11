/**
 * Validación de documentos peruanos.
 *  - DNI: 8 dígitos (sin dígito verificador estándar público; se valida longitud).
 *  - RUC: 11 dígitos con dígito verificador módulo 11 (algoritmo SUNAT).
 *  - CE (Carné de Extranjería): alfanumérico/numérico, longitud variable.
 */

/** Valida el dígito verificador de un RUC peruano (11 dígitos). */
export function rucValido(ruc: string): boolean {
  if (!/^\d{11}$/.test(ruc)) return false;
  const prefijo = ruc.substring(0, 2);
  if (!['10', '15', '17', '20'].includes(prefijo)) return false;

  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digitos = ruc.split('').map(Number);
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += digitos[i] * pesos[i];
  const resto = suma % 11;
  const dv = 11 - resto;
  const esperado = dv === 11 ? 0 : dv === 10 ? 1 : dv;
  return esperado === digitos[10];
}

/** Valida el formato de un DNI peruano (8 dígitos). */
export function dniValido(dni: string): boolean {
  return /^\d{8}$/.test(dni);
}

/** Valida según el tipo de documento. */
export function documentoValido(tipo: string, numero: string): boolean {
  switch (tipo) {
    case 'DNI':
      return dniValido(numero);
    case 'RUC':
      return rucValido(numero);
    case 'CE':
      return /^[A-Za-z0-9]{6,12}$/.test(numero);
    default:
      return false;
  }
}
