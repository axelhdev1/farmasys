import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Prisma, Rol } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto';
import { ActualizarPerfilDto } from './dto/actualizar-perfil.dto';
import { CambiarMiPasswordDto } from './dto/cambiar-mi-password.dto';
import { UsuarioPublico, JwtPayload } from '../auth/auth.types';
import {
  rangoDeRoles,
  plantillaPorRoles,
  validarPermisosAsignables,
} from '../auth/permisos';

/** Selección sin passwordHash: nunca exponemos el hash al cliente. */
const SELECT_PUBLICO = {
  id: true,
  nombres: true,
  apellidos: true,
  email: true,
  dni: true,
  telefono: true,
  roles: true,
  permisos: true,
  sucursalId: true,
  activo: true,
  debeCambiarPassword: true,
  ultimoAccesoEn: true,
} satisfies Prisma.UsuarioSelect;

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get rounds(): number {
    return Number(this.config.get<string>('BCRYPT_ROUNDS') ?? 10);
  }

  // ─────────────────────── Reglas de jerarquía (U1) ───────────────────────

  private esSuper(roles: Rol[]): boolean {
    return roles.includes('SUPER_ADMIN');
  }

  /**
   * El actor solo puede gestionar usuarios de MENOR jerarquía que él, salvo que
   * sea SUPER_ADMIN (que puede con todos). Bloquea que un ADMIN toque a otro
   * ADMIN o a un SUPER_ADMIN, y que intente CREAR/ELEVAR a alguien a su nivel.
   */
  private assertPuedeGestionar(actor: JwtPayload, rolesObjetivo: Rol[]): void {
    if (this.esSuper(actor.roles)) return;
    if (rangoDeRoles(rolesObjetivo) >= rangoDeRoles(actor.roles)) {
      throw new ForbiddenException(
        'No puedes gestionar usuarios de igual o mayor jerarquía que la tuya',
      );
    }
  }

  /** ADMIN solo opera dentro de SU sucursal; SUPER_ADMIN sin límite (U2). */
  private assertScope(actor: JwtPayload, sucursalObjetivo: string | null | undefined): void {
    if (this.esSuper(actor.roles)) return;
    if (sucursalObjetivo && actor.sucursalId && sucursalObjetivo !== actor.sucursalId) {
      throw new ForbiddenException('No puedes gestionar usuarios de otra sucursal');
    }
  }

  /**
   * Protege al ÚLTIMO SUPER_ADMIN activo: no puede perder el rol ni ser
   * desactivado, o el sistema quedaría sin nadie con acceso total.
   */
  private async assertNoEsUltimoSuper(
    objetivoRoles: Rol[],
    accion: { pierdeSuper?: boolean; seDesactiva?: boolean },
  ): Promise<void> {
    if (!objetivoRoles.includes('SUPER_ADMIN')) return;
    if (!accion.pierdeSuper && !accion.seDesactiva) return;
    const activos = await this.prisma.usuario.count({
      where: { activo: true, roles: { has: 'SUPER_ADMIN' } },
    });
    if (activos <= 1) {
      throw new ForbiddenException(
        'Es el último Super Admin activo: no puede perder el rol ni ser desactivado',
      );
    }
  }

  /** Verifica que la sucursal exista (si se indicó una). */
  private async validarSucursal(sucursalId?: string | null): Promise<void> {
    if (!sucursalId) return;
    const existe = await this.prisma.sucursal.findUnique({ where: { id: sucursalId } });
    if (!existe) throw new BadRequestException('La sucursal indicada no existe');
  }

  // ─────────────────────────────── CRUD ───────────────────────────────────

  async crear(dto: CrearUsuarioDto, actor: JwtPayload): Promise<UsuarioPublico> {
    // Jerarquía y scope antes de tocar nada.
    this.assertPuedeGestionar(actor, dto.roles);
    this.assertScope(actor, dto.sucursalId);

    const email = dto.email.toLowerCase().trim();
    const yaExiste = await this.prisma.usuario.findUnique({ where: { email } });
    if (yaExiste) throw new ConflictException('Ya existe un usuario con ese email');

    const dni = dto.dni?.trim() || null;
    if (dni) {
      const dniExiste = await this.prisma.usuario.findUnique({ where: { dni } });
      if (dniExiste) throw new ConflictException('Ya existe un usuario con ese DNI');
    }

    await this.validarSucursal(dto.sucursalId);
    const passwordHash = await bcrypt.hash(dto.password, this.rounds);

    // Permisos: los que envíe el form o, si no, la plantilla del rol. En ambos
    // casos se validan contra el catálogo y los pisos de seguridad.
    const permisos = validarPermisosAsignables(
      dto.permisos ?? plantillaPorRoles(dto.roles),
      dto.roles,
    );

    return this.prisma.usuario.create({
      data: {
        nombres: dto.nombres.trim(),
        apellidos: dto.apellidos.trim(),
        email,
        dni,
        telefono: dto.telefono?.trim() || null,
        passwordHash,
        roles: dto.roles,
        permisos,
        sucursalId: dto.sucursalId ?? null,
        // Usuario nuevo: obligado a cambiar la clave en el primer ingreso.
        debeCambiarPassword: true,
      },
      select: SELECT_PUBLICO,
    });
  }

  /**
   * Lista usuarios. SUPER_ADMIN ve todos; ADMIN solo los de su sucursal (U2).
   */
  async listar(actor: JwtPayload, incluirInactivos = false): Promise<UsuarioPublico[]> {
    const filtroActivo = incluirInactivos ? {} : { activo: true };
    const filtroSucursal = this.esSuper(actor.roles)
      ? {}
      : { sucursalId: actor.sucursalId ?? '__ninguna__' };
    return this.prisma.usuario.findMany({
      where: { ...filtroActivo, ...filtroSucursal },
      select: SELECT_PUBLICO,
      orderBy: { creadoEn: 'desc' },
    });
  }

  async obtener(id: string): Promise<UsuarioPublico> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      select: SELECT_PUBLICO,
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return usuario;
  }

  /** Registro completo (con roles/sucursal) para las comprobaciones internas. */
  private async cargarObjetivo(id: string) {
    const u = await this.prisma.usuario.findUnique({
      where: { id },
      select: { id: true, roles: true, sucursalId: true, activo: true },
    });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    return u;
  }

  async actualizar(id: string, dto: ActualizarUsuarioDto, actor: JwtPayload): Promise<UsuarioPublico> {
    const objetivo = await this.cargarObjetivo(id);

    // Nadie se edita a sí mismo los roles o el estado: para eso está Mi Perfil.
    if (id === actor.sub && (dto.roles !== undefined || dto.activo !== undefined)) {
      throw new BadRequestException('No puedes cambiar tus propios roles o estado. Usa Mi Perfil.');
    }

    // Jerarquía: sobre el objetivo ACTUAL y sobre los roles a los que se le quiere llevar.
    this.assertPuedeGestionar(actor, objetivo.roles);
    if (dto.roles !== undefined) this.assertPuedeGestionar(actor, dto.roles);

    // Scope: no tocar usuarios de otra sucursal ni moverlos a otra.
    this.assertScope(actor, objetivo.sucursalId);
    if (dto.sucursalId !== undefined) this.assertScope(actor, dto.sucursalId);

    // Último super admin: no puede perder el rol ni ser desactivado.
    await this.assertNoEsUltimoSuper(objetivo.roles, {
      pierdeSuper: dto.roles !== undefined && !dto.roles.includes('SUPER_ADMIN'),
      seDesactiva: dto.activo === false,
    });

    if (dto.email) {
      const email = dto.email.toLowerCase().trim();
      const otro = await this.prisma.usuario.findUnique({ where: { email } });
      if (otro && otro.id !== id) {
        throw new ConflictException('Ya existe otro usuario con ese email');
      }
    }
    if (dto.dni !== undefined && dto.dni) {
      const dni = dto.dni.trim();
      const otro = await this.prisma.usuario.findFirst({ where: { dni, NOT: { id } } });
      if (otro) throw new ConflictException('Ya existe otro usuario con ese DNI');
    }
    if (dto.sucursalId !== undefined) {
      await this.validarSucursal(dto.sucursalId);
    }

    const data: Prisma.UsuarioUpdateInput = {};
    if (dto.nombres !== undefined) data.nombres = dto.nombres.trim();
    if (dto.apellidos !== undefined) data.apellidos = dto.apellidos.trim();
    if (dto.telefono !== undefined) data.telefono = dto.telefono?.trim() || null;
    if (dto.email !== undefined) data.email = dto.email.toLowerCase().trim();
    if (dto.dni !== undefined) data.dni = dto.dni?.trim() || null;
    if (dto.roles !== undefined) data.roles = dto.roles;
    if (dto.activo !== undefined) data.activo = dto.activo;
    if (dto.sucursalId !== undefined) {
      data.sucursal = dto.sucursalId
        ? { connect: { id: dto.sucursalId } }
        : { disconnect: true };
    }

    // Permisos: se validan contra los roles RESULTANTES (los nuevos si se
    // cambian, si no los actuales) para respetar los pisos.
    if (dto.permisos !== undefined) {
      const rolesResultantes = dto.roles ?? objetivo.roles;
      data.permisos = validarPermisosAsignables(dto.permisos, rolesResultantes);
    } else if (dto.roles !== undefined) {
      // Si cambian los roles pero no los permisos, re-encuadra los permisos
      // guardados a los pisos del nuevo rol (evita permisos huérfanos).
      const actuales = await this.prisma.usuario.findUnique({
        where: { id }, select: { permisos: true },
      });
      const base = actuales?.permisos.length ? actuales.permisos : plantillaPorRoles(dto.roles);
      // Filtra en silencio los que ya no alcanzan piso (no es asignación nueva).
      data.permisos = base.filter((p) => {
        try { validarPermisosAsignables([p], dto.roles!); return true; } catch { return false; }
      });
    }

    return this.prisma.usuario.update({ where: { id }, data, select: SELECT_PUBLICO });
  }

  /**
   * Cambia la contraseña de OTRO usuario (reset por admin). Deja
   * debeCambiarPassword=true para forzar el cambio en el próximo login.
   */
  async cambiarPassword(id: string, password: string, actor: JwtPayload): Promise<{ ok: true }> {
    if (id === actor.sub) {
      throw new BadRequestException('Para cambiar tu propia clave usa Mi Perfil (pide la actual).');
    }
    const objetivo = await this.cargarObjetivo(id);
    this.assertPuedeGestionar(actor, objetivo.roles);
    this.assertScope(actor, objetivo.sucursalId);

    const passwordHash = await bcrypt.hash(password, this.rounds);
    await this.prisma.usuario.update({
      where: { id },
      data: { passwordHash, debeCambiarPassword: true },
    });
    return { ok: true };
  }

  /** Soft-delete: marca activo=false. No borra el registro (auditoría/integridad). */
  async desactivar(id: string, actor: JwtPayload): Promise<UsuarioPublico> {
    if (id === actor.sub) {
      throw new BadRequestException('No puedes desactivarte a ti mismo.');
    }
    const objetivo = await this.cargarObjetivo(id);
    this.assertPuedeGestionar(actor, objetivo.roles);
    this.assertScope(actor, objetivo.sucursalId);
    await this.assertNoEsUltimoSuper(objetivo.roles, { seDesactiva: true });

    return this.prisma.usuario.update({
      where: { id },
      data: { activo: false },
      select: SELECT_PUBLICO,
    });
  }

  /** Reactiva un usuario previamente desactivado. */
  async reactivar(id: string, actor: JwtPayload): Promise<UsuarioPublico> {
    const objetivo = await this.cargarObjetivo(id);
    this.assertPuedeGestionar(actor, objetivo.roles);
    this.assertScope(actor, objetivo.sucursalId);
    return this.prisma.usuario.update({
      where: { id },
      data: { activo: true },
      select: SELECT_PUBLICO,
    });
  }

  // ──────────────────────────── Mi Perfil (U3) ────────────────────────────

  /** El usuario edita SUS propios datos básicos (nunca roles/estado/permisos). */
  async actualizarMiPerfil(userId: string, dto: ActualizarPerfilDto): Promise<UsuarioPublico> {
    const data: Prisma.UsuarioUpdateInput = {};
    if (dto.nombres !== undefined) data.nombres = dto.nombres.trim();
    if (dto.apellidos !== undefined) data.apellidos = dto.apellidos.trim();
    if (dto.telefono !== undefined) data.telefono = dto.telefono?.trim() || null;
    return this.prisma.usuario.update({ where: { id: userId }, data, select: SELECT_PUBLICO });
  }

  /**
   * El usuario cambia SU propia clave. Exige la actual (bcrypt.compare) y apaga
   * debeCambiarPassword: este es el único camino que satisface el primer login.
   */
  async cambiarMiPassword(userId: string, dto: CambiarMiPasswordDto): Promise<{ ok: true }> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    const ok = await bcrypt.compare(dto.actual, usuario.passwordHash);
    if (!ok) throw new UnauthorizedException('La contraseña actual no es correcta');

    const passwordHash = await bcrypt.hash(dto.nueva, this.rounds);
    await this.prisma.usuario.update({
      where: { id: userId },
      data: { passwordHash, debeCambiarPassword: false },
    });
    return { ok: true };
  }
}
