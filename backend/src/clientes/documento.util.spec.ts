import { documentoValido, dniValido, rucValido } from './documento.util';

describe('documento.util', () => {
  it('valida DNI de 8 dígitos', () => {
    expect(dniValido('45678912')).toBe(true);
    expect(dniValido('1234')).toBe(false);
    expect(dniValido('456789123')).toBe(false);
  });

  it('valida RUC con dígito verificador correcto (módulo 11)', () => {
    // RUC válido conocido (SUNAT): 20131312955
    expect(rucValido('20131312955')).toBe(true);
    // Mismo número con último dígito alterado → inválido
    expect(rucValido('20131312956')).toBe(false);
    // Prefijo no permitido
    expect(rucValido('99131312955')).toBe(false);
  });

  it('documentoValido respeta el tipo', () => {
    expect(documentoValido('DNI', '45678912')).toBe(true);
    expect(documentoValido('RUC', '20131312955')).toBe(true);
    expect(documentoValido('RUC', '45678912')).toBe(false);
    expect(documentoValido('XX', '45678912')).toBe(false);
  });
});
