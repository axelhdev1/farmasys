import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsuariosService', () => {
  let service: UsuariosService;

  const prismaMock = {
    usuario: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    sucursal: { findUnique: jest.fn() },
  };
  const configMock = { get: jest.fn(() => '10') };

  const dtoBase = {
    nombres: 'María',
    apellidos: 'Quispe',
    email: 'maria@farmasys.pe',
    password: 'Clave1234',
    roles: ['VENDEDOR'] as never,
    sucursalId: 's1',
  };

  // Actor SUPER_ADMIN: pasa jerarquía y scope sin restricción.
  const actor = {
    sub: 'admin', email: 'admin@farmasys.pe',
    roles: ['SUPER_ADMIN'], permisos: [], sucursalId: null, type: 'access',
  } as never;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();
    service = module.get<UsuariosService>(UsuariosService);
    jest.clearAllMocks();
  });

  describe('crear', () => {
    it('lanza ConflictException si el email ya existe', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({ id: 'x', email: dtoBase.email });

      await expect(service.crear(dtoBase, actor)).rejects.toThrow(ConflictException);
      expect(prismaMock.usuario.create).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si la sucursal no existe', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.sucursal.findUnique.mockResolvedValue(null);

      await expect(service.crear(dtoBase, actor)).rejects.toThrow(BadRequestException);
    });

    it('crea el usuario con email normalizado y password hasheada', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.sucursal.findUnique.mockResolvedValue({ id: 's1' });
      prismaMock.usuario.create.mockResolvedValue({ id: 'u1', email: dtoBase.email });

      await service.crear({ ...dtoBase, email: 'MARIA@farmasys.pe' }, actor);

      const arg = prismaMock.usuario.create.mock.calls[0][0];
      expect(arg.data.email).toBe('maria@farmasys.pe');
      expect(arg.data.passwordHash).toBeDefined();
      expect(arg.data.passwordHash).not.toBe(dtoBase.password); // hasheada
      expect(arg.select.passwordHash).toBeUndefined(); // nunca se selecciona
    });
  });

  describe('obtener', () => {
    it('lanza NotFoundException si no existe', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      await expect(service.obtener('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('desactivar', () => {
    it('hace soft-delete (activo=false) sin borrar el registro', async () => {
      // Objetivo VENDEDOR (rango menor que el actor SUPER): pasa jerarquía.
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'u1', roles: ['VENDEDOR'], sucursalId: 's1', activo: true,
      });
      prismaMock.usuario.update.mockResolvedValue({ id: 'u1', activo: false });

      await service.desactivar('u1', actor);

      const arg = prismaMock.usuario.update.mock.calls[0][0];
      expect(arg.data.activo).toBe(false);
    });
  });
});
