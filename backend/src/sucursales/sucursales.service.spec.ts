import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EstadoSucursal } from '@prisma/client';
import { SucursalesService } from './sucursales.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SucursalesService', () => {
  let service: SucursalesService;

  const prismaMock = {
    sucursal: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SucursalesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get<SucursalesService>(SucursalesService);
    jest.clearAllMocks();
  });

  it('lanza ConflictException si el nombre ya existe', async () => {
    prismaMock.sucursal.findFirst.mockResolvedValue({ id: 'x' });
    await expect(service.crear({ nombre: 'Central' })).rejects.toThrow(ConflictException);
  });

  it('aplica series por defecto al crear', async () => {
    prismaMock.sucursal.findFirst.mockResolvedValue(null);
    prismaMock.sucursal.create.mockResolvedValue({ id: 's1' });

    await service.crear({ nombre: 'Nueva' });

    const arg = prismaMock.sucursal.create.mock.calls[0][0];
    expect(arg.data.serieBoleta).toBe('B001');
    expect(arg.data.serieFactura).toBe('F001');
    expect(arg.data.estado).toBe(EstadoSucursal.ACTIVA);
  });

  it('obtener lanza NotFoundException si no existe', async () => {
    prismaMock.sucursal.findUnique.mockResolvedValue(null);
    await expect(service.obtener('nope')).rejects.toThrow(NotFoundException);
  });

  it('desactivar marca estado INACTIVA (no borra)', async () => {
    prismaMock.sucursal.findUnique.mockResolvedValue({ id: 's1' });
    prismaMock.sucursal.update.mockResolvedValue({ id: 's1', estado: 'INACTIVA' });

    await service.desactivar('s1');

    const arg = prismaMock.sucursal.update.mock.calls[0][0];
    expect(arg.data.estado).toBe(EstadoSucursal.INACTIVA);
  });
});
