import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SunatService } from './sunat.service';
import { PrismaService } from '../prisma/prisma.service';
import { PSE_PROVIDER } from './pse.interface';

describe('SunatService', () => {
  let service: SunatService;

  const prismaMock = {
    venta: { findUnique: jest.fn() },
    comprobanteElectronico: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  };
  const pseMock = { enviar: jest.fn(), consultarEstado: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SunatService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PSE_PROVIDER, useValue: pseMock },
      ],
    }).compile();
    service = module.get<SunatService>(SunatService);
    jest.clearAllMocks();
  });

  it('no emite comprobante de una venta anulada', async () => {
    prismaMock.venta.findUnique.mockResolvedValue({ id: 'v1', estado: 'ANULADA' });
    await expect(service.emitir('v1')).rejects.toThrow(BadRequestException);
  });

  it('devuelve el comprobante existente si ya está ACEPTADO (idempotente)', async () => {
    prismaMock.venta.findUnique.mockResolvedValue({
      id: 'v1',
      estado: 'COMPLETADA',
      numeroComprobante: 'B001-000001',
      tipoComprobante: 'BOLETA',
      items: [],
      cliente: null,
      total: { toFixed: () => '40.00' },
      igv: { toFixed: () => '6.10' },
    });
    prismaMock.comprobanteElectronico.findUnique.mockResolvedValue({ id: 'c1', estado: 'ACEPTADO' });

    const res = await service.emitir('v1');
    expect(res).toEqual({ id: 'c1', estado: 'ACEPTADO' });
    expect(pseMock.enviar).not.toHaveBeenCalled();
  });

  it('estado lanza NotFound si no hay comprobante', async () => {
    prismaMock.comprobanteElectronico.findUnique.mockResolvedValue(null);
    await expect(service.estado('v9')).rejects.toThrow(NotFoundException);
  });
});
