import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CajaService } from './caja.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CajaService', () => {
  let service: CajaService;

  const prismaMock = {
    cajaSesion: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    pago: { findMany: jest.fn() },
    venta: { count: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CajaService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get<CajaService>(CajaService);
    jest.clearAllMocks();
  });

  describe('abrir', () => {
    it('impide abrir si ya hay una caja ABIERTA del cajero en la sucursal', async () => {
      prismaMock.cajaSesion.findFirst.mockResolvedValue({ id: 'c1' });
      await expect(
        service.abrir({ sucursalId: 's1', terminal: 'Caja 1', montoInicial: 100 }, 'caj1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('resumen', () => {
    it('calcula efectivo esperado = inicial + ventasEfectivo + ingresos − egresos', async () => {
      prismaMock.cajaSesion.findUnique.mockResolvedValue({
        id: 'c1',
        estado: 'ABIERTA',
        montoInicial: 100,
        movimientos: [
          { tipo: 'INGRESO', monto: 50 },
          { tipo: 'EGRESO', monto: 30 },
        ],
      });
      prismaMock.pago.findMany.mockResolvedValue([
        { metodo: 'EFECTIVO', monto: 200 },
        { metodo: 'YAPE_PLIN', monto: 80 },
      ]);
      prismaMock.venta.count.mockResolvedValue(5);

      const r = await service.resumen('c1');
      // 100 + 200 + 50 - 30 = 320
      expect(Number(r.efectivoEsperado)).toBe(320);
      expect(Number(r.totalVendido)).toBe(280);
      expect(r.tickets).toBe(5);
    });
  });
});
