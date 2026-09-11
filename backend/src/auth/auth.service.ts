import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload, TokensDto, UsuarioPublico } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { permisosEfectivos } from './permisos';

/**
 * Lógica de autenticación: login con email+password (bcrypt) y emisión/rotación
 * de tokens JWT (access corto + refresh largo). Stateless: el refresh se valida
 * por firma, no se guarda en BD (permite N instancias tras un load balancer).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Deja constancia del intento de acceso (exitoso o no).
   *
   * Nunca hace fallar el login: si la auditoría no se puede escribir, el
   * cajero igual entra. Un problema de registro no puede parar la venta.
   */
  private async registrarAcceso(datos: {
    usuarioId?: string | null;
    email: string;
    exito: boolean;
    motivo?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await this.prisma.registroAcceso.create({
        data: {
          usuarioId: datos.usuarioId ?? null,
          email: datos.email,
          exito: datos.exito,
          motivo: datos.motivo ?? null,
          ip: datos.ip ?? null,
          userAgent: datos.userAgent?.slice(0, 250) ?? null,
        },
      });
    } catch {
      // Silencioso a propósito (ver comentario del método).
    }
  }

  /** Valida credenciales y devuelve tokens + datos públicos del usuario. */
  async login(
    dto: LoginDto,
    contexto?: { ip?: string; userAgent?: string },
  ): Promise<{ usuario: UsuarioPublico; tokens: TokensDto }> {
    const email = dto.email.toLowerCase().trim();
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });

    // Mensaje genérico para no revelar si el email existe. El MOTIVO real sí
    // se guarda en la auditoría: es lo que permite distinguir después "se
    // equivocó de clave" de "alguien probó con una cuenta que no existe".
    if (!usuario) {
      await this.registrarAcceso({ email, exito: false, motivo: 'NO_EXISTE', ...contexto });
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (!usuario.activo) {
      await this.registrarAcceso({
        usuarioId: usuario.id, email, exito: false, motivo: 'USUARIO_INACTIVO', ...contexto,
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const ok = await bcrypt.compare(dto.password, usuario.passwordHash);
    if (!ok) {
      await this.registrarAcceso({
        usuarioId: usuario.id, email, exito: false, motivo: 'CREDENCIALES', ...contexto,
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.registrarAcceso({ usuarioId: usuario.id, email, exito: true, ...contexto });

    // Registra el último acceso (para auditoría en la gestión de usuarios).
    const conAcceso = await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoAccesoEn: new Date() },
    });

    const tokens = await this.emitirTokens(
      usuario.id, usuario.email, usuario.roles, usuario.sucursalId,
      permisosEfectivos(usuario.permisos, usuario.roles),
    );
    return { usuario: this.aPublico(conAcceso), tokens };
  }

  /** Verifica el refresh token y emite un nuevo par de tokens (rotación). */
  async refresh(refreshToken: string): Promise<TokensDto> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret',
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('El token no es de tipo refresh');
    }

    // Re-cargar usuario: refleja cambios de roles/sucursal y bloquea inactivos.
    const usuario = await this.prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Usuario no disponible');
    }

    return this.emitirTokens(
      usuario.id, usuario.email, usuario.roles, usuario.sucursalId,
      permisosEfectivos(usuario.permisos, usuario.roles),
    );
  }

  /**
   * Historial de accesos de los últimos `dias`.
   *
   * Devuelve además un resumen con los fallos por cuenta: varios intentos
   * fallidos seguidos contra el mismo usuario es la señal que hay que mirar.
   */
  async historialAccesos(dias = 7, soloFallidos = false) {
    const desde = new Date();
    desde.setDate(desde.getDate() - Math.max(1, dias));
    desde.setHours(0, 0, 0, 0);

    const registros = await this.prisma.registroAcceso.findMany({
      where: { fecha: { gte: desde }, ...(soloFallidos ? { exito: false } : {}) },
      include: {
        usuario: { select: { nombres: true, apellidos: true, roles: true } },
      },
      orderBy: { fecha: 'desc' },
      take: 500,
    });

    const fallidos = registros.filter((r) => !r.exito);
    const porCuenta = new Map<string, number>();
    for (const f of fallidos) porCuenta.set(f.email, (porCuenta.get(f.email) ?? 0) + 1);

    return {
      desde,
      total: registros.length,
      exitosos: registros.length - fallidos.length,
      fallidos: fallidos.length,
      // Cuentas con 3 o más fallos en el período: lo que vale la pena revisar.
      sospechosas: Array.from(porCuenta.entries())
        .filter(([, n]) => n >= 3)
        .map(([email, intentos]) => ({ email, intentos }))
        .sort((a, b) => b.intentos - a.intentos),
      registros: registros.map((r) => ({
        id: r.id,
        fecha: r.fecha,
        email: r.email,
        nombre: r.usuario
          ? `${r.usuario.nombres} ${r.usuario.apellidos ?? ''}`.trim()
          : null,
        rol: r.usuario?.roles?.[0] ?? null,
        exito: r.exito,
        motivo: r.motivo,
        ip: r.ip,
      })),
    };
  }

  /** Devuelve los datos públicos del usuario autenticado (para /auth/me). */
  async perfil(userId: string): Promise<UsuarioPublico> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Usuario no disponible');
    }
    return this.aPublico(usuario);
  }

  /** Firma el par access+refresh con secretos y expiraciones independientes. */
  private async emitirTokens(
    sub: string,
    email: string,
    roles: JwtPayload['roles'],
    sucursalId: string | null,
    permisos: string[],
  ): Promise<TokensDto> {
    const accessExpires = this.config.get<string>('JWT_ACCESS_EXPIRES') ?? '15m';
    const refreshExpires = this.config.get<string>('JWT_REFRESH_EXPIRES') ?? '7d';

    const base = { sub, email, roles, permisos, sucursalId };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { ...base, type: 'access' } satisfies JwtPayload,
        {
          secret: this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
          expiresIn: accessExpires,
        },
      ),
      this.jwt.signAsync(
        { ...base, type: 'refresh' } satisfies JwtPayload,
        {
          secret: this.config.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret',
          expiresIn: refreshExpires,
        },
      ),
    ]);

    return { accessToken, refreshToken, expiresIn: accessExpires };
  }

  /** Mapea el registro de BD a su versión pública (sin passwordHash). */
  private aPublico(u: {
    id: string;
    nombres: string;
    apellidos: string;
    email: string;
    dni?: string | null;
    telefono?: string | null;
    roles: JwtPayload['roles'];
    permisos?: string[];
    sucursalId: string | null;
    activo: boolean;
    debeCambiarPassword?: boolean;
    ultimoAccesoEn?: Date | null;
  }): UsuarioPublico {
    return {
      id: u.id,
      nombres: u.nombres,
      apellidos: u.apellidos,
      email: u.email,
      dni: u.dni ?? null,
      telefono: u.telefono ?? null,
      roles: u.roles,
      // El front recibe los permisos EFECTIVOS (con fallback y pisos aplicados),
      // no el crudo de BD: así un usuario viejo sin lista ve su plantilla.
      permisos: permisosEfectivos(u.permisos ?? [], u.roles),
      sucursalId: u.sucursalId,
      activo: u.activo,
      debeCambiarPassword: u.debeCambiarPassword ?? false,
      ultimoAccesoEn: u.ultimoAccesoEn ?? null,
    };
  }
}
