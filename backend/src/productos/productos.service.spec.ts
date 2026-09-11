import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ProductosService } from './productos.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ProductosService', () => {
  let service: ProductosService;

  const prismaMock = {
    producto: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    presentacion: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const dto = {
    codigo: 'para500',
    nombre: 'Paracetamol 500mg',
    categoria: 'Analgésicos',
    presentaciones: [{ nombre: 'Caja', factor: 100, precioVenta: 20, esBase: false }],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductosService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get<ProductosService>(ProductosService);
    jest.clearAllMocks();
  });

  describe('crear', () => {
    it('lanza ConflictException si el código ya existe', async () => {
      prismaMock.producto.findUnique.mockResolvedValue({ id: 'x' });
      await expect(service.crear(dto)).rejects.toThrow(ConflictException);
    });

    it('normaliza el código a mayúsculas al crear', async () => {
      prismaMock.producto.findUnique.mockResolvedValue(null);
      prismaMock.producto.create.mockResolvedValue({ id: 'p1' });

      await service.crear(dto);

      const arg = prismaMock.producto.create.mock.calls[0][0];
      expect(arg.data.codigo).toBe('PARA500');
    });

    it('rechaza más de una presentación base', async () => {
      prismaMock.producto.findUnique.mockResolvedValue(null);
      const malo = {
        ...dto,
        presentaciones: [
          { nombre: 'A', factor: 1, precioVenta: 1, esBase: true },
          { nombre: 'B', factor: 10, precioVenta: 5, esBase: true },
        ],
      };
      await expect(service.crear(malo)).rejects.toThrow(BadRequestException);
    });
  });

  describe('buscar', () => {
    it('devuelve [] con término vacío sin tocar la BD', async () => {
      const res = await service.buscar('   ');
      expect(res).toEqual([]);
      expect(prismaMock.producto.findMany).not.toHaveBeenCalled();
    });
  });

  describe('buscarAgrupado', () => {
    it('agrupa productos por principio activo', async () => {
      prismaMock.producto.findMany.mockResolvedValue([
        { id: '1', nombre: 'Panadol', principioActivo: 'Paracetamol' },
        { id: '2', nombre: 'Paracetamol Genfar', principioActivo: 'Paracetamol' },
        { id: '3', nombre: 'Ibuprofeno', principioActivo: 'Ibuprofeno' },
      ]);

      const grupos = await service.buscarAgrupado('a');
      const para = grupos.find((g) => g.principioActivo === 'Paracetamol');
      expect(para?.productos).toHaveLength(2);
      expect(grupos).toHaveLength(2);
    });
  });

  describe('obtener', () => {
    it('lanza NotFoundException si no existe', async () => {
      prismaMock.producto.findUnique.mockResolvedValue(null);
      await expect(service.obtener('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('eliminarPresentacion', () => {
    it('impide borrar la última presentación', async () => {
      prismaMock.presentacion.findFirst.mockResolvedValue({ id: 'pr1', productoId: 'p1' });
      prismaMock.presentacion.count.mockResolvedValue(1);
      await expect(service.eliminarPresentacion('p1', 'pr1')).rejects.toThrow(BadRequestException);
    });
  });
});
