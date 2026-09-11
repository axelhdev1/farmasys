import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ComprasService } from './compras.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ComprasService', () => {
  let service: ComprasService;

  const prismaMock = {
    proveedor: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    compra: { findMany: jest.fn(), findUnique: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComprasService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get<ComprasService>(ComprasService);
    jest.clearAllMocks();
  });

  describe('crearProveedor', () => {
    it('lanza ConflictException si el RUC ya existe', async () => {
      prismaMock.proveedor.findUnique.mockResolvedValue({ id: 'x' });
      await expect(
        service.crearProveedor({ ruc: '20123456789', razonSocial: 'Demo' }),
      ).rejects.toThrow(ConflictException);
    });

    it('crea el proveedor si el RUC es nuevo', async () => {
      prismaMock.proveedor.findUnique.mockResolvedValue(null);
      prismaMock.proveedor.create.mockResolvedValue({ id: 'pr1' });
      const res = await service.crearProveedor({ ruc: '20123456789', razonSocial: 'Demo' });
      expect(res).toEqual({ id: 'pr1' });
    });
  });

  describe('obtenerProveedor', () => {
    it('lanza NotFoundException si no existe', async () => {
      prismaMock.proveedor.findUnique.mockResolvedValue(null);
      await expect(service.obtenerProveedor('nope')).rejects.toThrow(NotFoundException);
    });
  });
});
