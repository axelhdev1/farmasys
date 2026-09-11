import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { InventarioService } from './inventario.service';
import { PrismaService } from '../prisma/prisma.service';

describe('InventarioService', () => {
  let service: InventarioService;

  const prismaMock = {
    stockSucursal: { findUnique: jest.fn(), aggregate: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    lote: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    movimientoStock: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventarioService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get<InventarioService>(InventarioService);
    jest.clearAllMocks();
  });

  describe('stockVendibleEn', () => {
    it('suma solo lotes vigentes (excluye vencidos)', async () => {
      prismaMock.lote.findMany.mockResolvedValue([
        { id: 'l1', cantidadBase: 10 },
        { id: 'l2', cantidadBase: 5 },
      ]);
      expect(await service.stockVendibleEn('p1', 's1')).toBe(15);
    });
  });

  describe('consumirFefo', () => {
    const txMock = () => ({
      lote: { findMany: jest.fn(), update: jest.fn() },
      stockSucursal: { update: jest.fn() },
      movimientoStock: { create: jest.fn() },
    });

    it('consume el lote que vence primero (FEFO) y reparte entre lotes', async () => {
      const tx = txMock();
      tx.lote.findMany.mockResolvedValue([
        { id: 'lA', cantidadBase: 8, vencimiento: new Date('2026-07-01') },
        { id: 'lB', cantidadBase: 10, vencimiento: new Date('2026-12-01') },
      ]);

      const consumo = await service.consumirFefo(tx as never, 'p1', 's1', 12, 'venta-1');

      expect(consumo).toEqual([
        { loteId: 'lA', cantidad: 8 },
        { loteId: 'lB', cantidad: 4 },
      ]);
      expect(tx.stockSucursal.update).toHaveBeenCalled();
      expect(tx.movimientoStock.create).toHaveBeenCalled();
    });

    it('lanza si el stock vendible es insuficiente', async () => {
      const tx = txMock();
      tx.lote.findMany.mockResolvedValue([{ id: 'lA', cantidadBase: 3, vencimiento: new Date('2026-07-01') }]);

      await expect(service.consumirFefo(tx as never, 'p1', 's1', 10)).rejects.toThrow(BadRequestException);
    });
  });
});
