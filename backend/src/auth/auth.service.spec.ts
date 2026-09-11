import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

// Mock del módulo bcrypt: sus exports no son redefinibles con spyOn, así que
// reemplazamos el módulo completo y controlamos `compare` desde cada test.
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hash'),
}));

describe('AuthService', () => {
  let service: AuthService;

  const prismaMock = {
    usuario: { findUnique: jest.fn() },
  };
  const jwtMock = {
    signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
    verifyAsync: jest.fn(),
  };
  const configMock = {
    get: jest.fn((key: string) => {
      const map: Record<string, string> = {
        JWT_ACCESS_SECRET: 'access',
        JWT_REFRESH_SECRET: 'refresh',
        JWT_ACCESS_EXPIRES: '15m',
        JWT_REFRESH_EXPIRES: '7d',
      };
      return map[key];
    }),
  };

  const usuarioActivo = {
    id: 'u1',
    nombres: 'Admin',
    apellidos: 'Test',
    email: 'admin@farmasys.pe',
    passwordHash: 'hash',
    roles: ['ADMIN'],
    permisos: [],
    sucursalId: 's1',
    activo: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('devuelve usuario público (sin passwordHash) y tokens con credenciales válidas', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioActivo);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const res = await service.login({ email: 'admin@farmasys.pe', password: 'ok' });

      expect(res.usuario).not.toHaveProperty('passwordHash');
      expect(res.usuario.email).toBe('admin@farmasys.pe');
      expect(res.tokens.accessToken).toBeDefined();
      expect(res.tokens.refreshToken).toBeDefined();
    });

    it('lanza UnauthorizedException si la contraseña no coincide', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioActivo);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'admin@farmasys.pe', password: 'mala' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el usuario está inactivo', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({ ...usuarioActivo, activo: false });

      await expect(
        service.login({ email: 'admin@farmasys.pe', password: 'ok' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el email no existe', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'noexiste@farmasys.pe', password: 'ok' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('emite nuevos tokens con un refresh token válido', async () => {
      jwtMock.verifyAsync.mockResolvedValue({
        sub: 'u1',
        email: 'admin@farmasys.pe',
        roles: ['ADMIN'],
        sucursalId: 's1',
        type: 'refresh',
      });
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioActivo);

      const tokens = await service.refresh('valid.refresh.token');
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
    });

    it('rechaza un access token usado como refresh', async () => {
      jwtMock.verifyAsync.mockResolvedValue({
        sub: 'u1',
        email: 'admin@farmasys.pe',
        roles: ['ADMIN'],
        sucursalId: 's1',
        type: 'access',
      });

      await expect(service.refresh('access.token')).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza un refresh token inválido/expirado', async () => {
      jwtMock.verifyAsync.mockRejectedValue(new Error('expired'));

      await expect(service.refresh('bad.token')).rejects.toThrow(UnauthorizedException);
    });
  });
});
