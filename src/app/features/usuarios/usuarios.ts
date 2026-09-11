import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RolUsuario, Usuario } from '../../core/models/auth.model';
import { ToastService } from '../../core/services/toast.service';
import { SucursalService } from '../../core/services/sucursal.service';
import { AuthService } from '../../core/auth/auth.service';
import {
  UsuarioApiService,
  UsuarioBackend,
  HistorialAccesos,
} from '../../core/services/usuario-api';
import {
  GRUPOS_MODULOS, Modulo, plantillaPorRoles, moduloAlcanzaPiso, permisosEfectivos,
} from '../../core/auth/permisos';

type EstadoUsuario = 'ACTIVO' | 'INACTIVO';
type ModoModal = 'crear' | 'editar';

/**
 * Extensión UI del modelo Usuario con campos operativos (estado, DNI,
 * último acceso) que vienen del backend de gestión de cuentas.
 */
interface UsuarioUI extends Usuario {
  estado: EstadoUsuario;
  dni: string;
  ultimoAcceso: string;
  telefono: string;
}

interface OpcionRol {
  valor: RolUsuario;
  label: string;
  descripcion: string;
}

const ROLES_DISPONIBLES: OpcionRol[] = [
  { valor: 'SUPER_ADMIN',  label: 'Super Admin',   descripcion: 'Acceso global multi-sucursal'   },
  { valor: 'ADMIN',        label: 'Administrador', descripcion: 'Acceso total a la sucursal'     },
  { valor: 'VENDEDOR',     label: 'Vendedor',      descripcion: 'Operar POS y atender clientes'  },
  { valor: 'FARMACEUTICO', label: 'Farmacéutico',  descripcion: 'Dispensar y validar recetas'    },
  { valor: 'ALMACENERO',   label: 'Almacenero',    descripcion: 'Recibir mercadería y ajustes'   },
];

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss',
})
export class UsuariosComponent implements OnInit {
  private readonly toast       = inject(ToastService);
  private readonly sucursalSvc = inject(SucursalService);
  private readonly auth        = inject(AuthService);
  private readonly usuarioApi  = inject(UsuarioApiService);

  protected readonly rolesDisponibles = ROLES_DISPONIBLES;
  protected readonly sucursales       = this.sucursalSvc.sucursales;

  /** True mientras se trae el padrón de usuarios del backend. */
  protected readonly cargando = signal(false);

  // ── Auditoría de accesos ──────────────────────────────────────────────
  protected readonly vista = signal<'cuentas' | 'accesos'>('cuentas');
  protected readonly accesos = signal<HistorialAccesos | null>(null);
  protected readonly diasAccesos = signal(7);
  protected readonly soloFallidos = signal(false);

  protected verAccesos(): void {
    this.vista.set('accesos');
    if (!this.accesos()) this.cargarAccesos();
  }

  protected cambiarDiasAccesos(dias: number): void {
    this.diasAccesos.set(dias);
    this.cargarAccesos();
  }

  protected toggleSoloFallidos(): void {
    this.soloFallidos.update((v) => !v);
    this.cargarAccesos();
  }

  private cargarAccesos(): void {
    this.usuarioApi.accesos(this.diasAccesos(), this.soloFallidos()).subscribe({
      next: (a) => this.accesos.set(a),
      error: (e) => this.toast.error('No se pudo cargar la auditoría: ' + (e.error?.message ?? e.message)),
    });
  }

  /** Motivo del fallo en lenguaje del mostrador, no en clave técnica. */
  protected etiquetaMotivo(motivo: string | null): string {
    return {
      CREDENCIALES: 'contraseña incorrecta',
      USUARIO_INACTIVO: 'cuenta desactivada',
      NO_EXISTE: 'ese correo no existe',
    }[motivo ?? ''] ?? 'intento fallido';
  }

  protected fechaHora(iso: string): string {
    return new Date(iso).toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }
  /** True mientras se guarda/edita un usuario (deshabilita el botón). */
  protected readonly guardando = signal(false);

  ngOnInit(): void {
    this.cargar();
  }

  /** Carga el padrón REAL de usuarios (incluye inactivos para poder reactivar). */
  cargar(): void {
    this.cargando.set(true);
    this.usuarioApi.listar(true).subscribe({
      next: (rows) => {
        this._usuarios.set(rows.map((r) => this.mapUsuario(r)));
        this.cargando.set(false);
      },
      error: (e) => {
        this.cargando.set(false);
        this._usuarios.set([]);
        this.toast.error('No se pudo cargar usuarios: ' + e.message);
      },
    });
  }

  private mapUsuario(u: UsuarioBackend): UsuarioUI {
    return {
      id: u.id,
      nombres: u.nombres,
      apellidos: u.apellidos,
      email: u.email,
      dni: u.dni ?? '',
      telefono: u.telefono ?? '',
      roles: u.roles,
      permisos: u.permisos ?? [],
      sucursalActualId: u.sucursalId ?? undefined,
      debeCambiarPassword: u.debeCambiarPassword,
      estado: u.activo ? 'ACTIVO' : 'INACTIVO',
      ultimoAcceso: this.tiempoRelativo(u.ultimoAccesoEn),
    };
  }

  /** "hace 5 min", "hace 2 h", "ayer", "hace 3 d", o fecha si es viejo. */
  private tiempoRelativo(iso: string | null): string {
    if (!iso) return 'Nunca';
    const t = new Date(iso).getTime();
    const min = Math.floor((Date.now() - t) / 60000);
    if (min < 1) return 'Recién';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'ayer';
    if (d < 7) return `hace ${d} días`;
    return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  /** Sucursal por defecto para el form (primera real disponible). */
  private sucursalPorDefecto(): string {
    return this.sucursales()[0]?.id ?? '';
  }

  // ── Filtros y búsqueda ────────────────────────────────────────────────
  protected readonly filtroRol  = signal<RolUsuario | 'TODOS'>('TODOS');
  protected readonly busqueda   = signal('');
  protected readonly opcionesFiltro: Array<{ valor: RolUsuario | 'TODOS'; label: string }> = [
    { valor: 'TODOS',        label: 'Todos'        },
    { valor: 'SUPER_ADMIN',  label: 'Super Admin'  },
    { valor: 'ADMIN',        label: 'Admin'        },
    { valor: 'FARMACEUTICO', label: 'Farmacéutico' },
    { valor: 'VENDEDOR',     label: 'Vendedor'     },
    { valor: 'ALMACENERO',   label: 'Almacenero'   },
  ];

  // ── Modales ───────────────────────────────────────────────────────────
  protected readonly modalAbierto         = signal(false);
  protected readonly modoModal            = signal<ModoModal>('crear');
  private  readonly idEditando            = signal<string | null>(null);

  protected readonly modalReset           = signal(false);
  protected readonly usuarioReset         = signal<UsuarioUI | null>(null);
  protected readonly passwordGeneradaReset = signal<string>('');

  protected readonly modalConfirmar       = signal(false);
  protected readonly usuarioConfirmar     = signal<UsuarioUI | null>(null);
  protected readonly accionConfirmar      = signal<'desactivar' | 'activar'>('desactivar');

  // ── Form ──────────────────────────────────────────────────────────────
  protected formNombres     = signal('');
  protected formApellidos   = signal('');
  protected formEmail       = signal('');
  protected formDni         = signal('');
  protected formTelefono    = signal('');
  protected formRoles       = signal<RolUsuario[]>(['VENDEDOR']);
  protected formPermisos    = signal<Modulo[]>([]);
  protected formSucursalId  = signal<string>('');
  protected formPassword    = signal('');
  protected formMostrarPwd  = signal(false);

  /** Catálogo de módulos agrupados para los checkboxes de accesos. */
  protected readonly gruposModulos = GRUPOS_MODULOS;

  // ── Padrón real de usuarios (se llena desde el backend) ───────────────
  private readonly _usuarios = signal<UsuarioUI[]>([]);

  // ── Lista filtrada ────────────────────────────────────────────────────
  protected readonly usuariosFiltrados = computed(() => {
    const rol = this.filtroRol();
    const q   = this.busqueda().toLowerCase().trim();
    return this._usuarios().filter(u => {
      const matchRol = rol === 'TODOS' || u.roles.includes(rol);
      const matchQ   = !q ||
        u.nombres.toLowerCase().includes(q) ||
        u.apellidos.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.dni.includes(q);
      return matchRol && matchQ;
    });
  });

  // ── KPIs ──────────────────────────────────────────────────────────────
  protected readonly kpis = computed(() => {
    const lista = this._usuarios();
    return {
      total:         lista.length,
      activos:       lista.filter(u => u.estado === 'ACTIVO').length,
      admins:        lista.filter(u => u.roles.includes('ADMIN') || u.roles.includes('SUPER_ADMIN')).length,
      farmaceuticos: lista.filter(u => u.roles.includes('FARMACEUTICO')).length,
      vendedores:    lista.filter(u => u.roles.includes('VENDEDOR')).length,
      almaceneros:   lista.filter(u => u.roles.includes('ALMACENERO')).length,
    };
  });

  // ── Validaciones del form ─────────────────────────────────────────────
  protected readonly errorEmail = computed<string | null>(() => {
    const e = this.formEmail().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'Formato de email invalido';
    const editandoId = this.idEditando();
    const duplicado = this._usuarios().find(u => u.email.toLowerCase() === e.toLowerCase() && u.id !== editandoId);
    if (duplicado) return `Ya existe un usuario con ese email (${duplicado.nombres})`;
    return null;
  });

  protected readonly errorDni = computed<string | null>(() => {
    const d = this.formDni().trim();
    if (!d) return null;
    if (!/^\d+$/.test(d))  return 'DNI debe contener solo digitos';
    if (d.length !== 8)    return 'DNI debe tener 8 digitos';
    const editandoId = this.idEditando();
    const duplicado = this._usuarios().find(u => u.dni === d && u.id !== editandoId);
    if (duplicado) return `DNI ya registrado (${duplicado.nombres})`;
    return null;
  });

  protected readonly errorPassword = computed<string | null>(() => {
    if (this.modoModal() === 'editar') return null;
    const p = this.formPassword();
    if (!p) return null;
    if (p.length < 8) return 'Minimo 8 caracteres';
    if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Debe incluir letras y numeros';
    return null;
  });

  protected readonly formularioValido = computed<boolean>(() => {
    if (!this.formNombres().trim()) return false;
    if (!this.formApellidos().trim()) return false;
    if (!this.formEmail().trim() || this.errorEmail()) return false;
    if (!this.formDni().trim() || this.errorDni()) return false;
    if (this.formRoles().length === 0) return false;
    if (!this.formRoles().includes('SUPER_ADMIN') && !this.formSucursalId()) return false;
    if (this.modoModal() === 'crear') {
      if (!this.formPassword() || this.errorPassword()) return false;
    }
    return true;
  });

  // ── Helpers de presentacion ───────────────────────────────────────────
  protected etiquetaRol(rol: RolUsuario): string {
    return ROLES_DISPONIBLES.find(r => r.valor === rol)?.label ?? rol;
  }

  protected clasesRol(rol: RolUsuario): string {
    const map: Record<RolUsuario, string> = {
      SUPER_ADMIN:  'bg-amber-50 text-amber-700',
      ADMIN:        'bg-primary/10 text-primary',
      VENDEDOR:     'bg-emerald-50 text-emerald-700',
      FARMACEUTICO: 'bg-violet-50 text-violet-700',
      ALMACENERO:   'bg-orange-50 text-orange-700',
    };
    return map[rol];
  }

  protected iniciales(u: UsuarioUI): string {
    return `${u.nombres.charAt(0)}${u.apellidos.charAt(0)}`.toUpperCase();
  }

  protected colorAvatar(u: UsuarioUI): string {
    return this.clasesRol(u.roles[0] ?? 'VENDEDOR');
  }

  protected nombreSucursal(id: string | undefined): string {
    if (!id) return '—';
    return this.sucursales().find(s => s.id === id)?.nombre ?? '—';
  }

  protected esYoMismo(u: UsuarioUI): boolean {
    return this.auth.usuario()?.id === u.id;
  }

  // ── Modal: abrir / cerrar ─────────────────────────────────────────────
  protected abrirNuevo(): void {
    this.modoModal.set('crear');
    this.idEditando.set(null);
    this.limpiarForm();
    this.formPassword.set(this.generarPassword());
    this.modalAbierto.set(true);
  }

  protected abrirEdicion(u: UsuarioUI): void {
    this.modoModal.set('editar');
    this.idEditando.set(u.id);
    this.formNombres.set(u.nombres);
    this.formApellidos.set(u.apellidos);
    this.formEmail.set(u.email);
    this.formDni.set(u.dni);
    this.formTelefono.set(u.telefono);
    this.formRoles.set([...u.roles]);
    // Permisos efectivos: si el usuario es viejo y no tiene lista, se muestran
    // los de la plantilla de su rol (lo mismo que ve el guard).
    this.formPermisos.set(permisosEfectivos(u.permisos, u.roles));
    this.formSucursalId.set(u.sucursalActualId ?? '');
    this.formPassword.set('');
    this.modalAbierto.set(true);
  }

  protected cerrarModal(): void {
    this.modalAbierto.set(false);
    this.idEditando.set(null);
  }

  private limpiarForm(): void {
    this.formNombres.set('');
    this.formApellidos.set('');
    this.formEmail.set('');
    this.formDni.set('');
    this.formTelefono.set('');
    this.formRoles.set(['VENDEDOR']);
    this.formPermisos.set(plantillaPorRoles(['VENDEDOR']));
    this.formSucursalId.set(this.sucursalPorDefecto());
    this.formPassword.set('');
    this.formMostrarPwd.set(false);
  }

  protected toggleRol(rol: RolUsuario): void {
    this.formRoles.update(rs => rs.includes(rol) ? rs.filter(r => r !== rol) : [...rs, rol]);
    // Al cambiar el rol se re-marcan los accesos con la plantilla nueva. El
    // admin puede seguir ajustando los checkboxes después.
    this.formPermisos.set(plantillaPorRoles(this.formRoles()));
  }

  protected rolSeleccionado(rol: RolUsuario): boolean {
    return this.formRoles().includes(rol);
  }

  // ── Accesos por módulo (permisos) ─────────────────────────────────────
  /** ¿El checkbox del módulo está marcado? */
  protected permisoMarcado(m: Modulo): boolean {
    return this.formPermisos().includes(m);
  }

  /** ¿Se puede marcar? No, si el módulo exige un rango que los roles no alcanzan. */
  protected puedeMarcarPermiso(m: Modulo): boolean {
    return moduloAlcanzaPiso(m, this.formRoles());
  }

  protected togglePermiso(m: Modulo): void {
    if (!this.puedeMarcarPermiso(m)) return; // piso de seguridad
    this.formPermisos.update(ps => ps.includes(m) ? ps.filter(x => x !== m) : [...ps, m]);
  }

  /** Tooltip para los módulos bloqueados por piso. */
  protected tooltipPiso(requiere?: 'ADMIN' | 'SUPER_ADMIN'): string {
    if (!requiere) return '';
    return requiere === 'SUPER_ADMIN'
      ? 'Requiere rol Super Admin'
      : 'Requiere rol Administrador';
  }

  /** ¿El usuario es el regente (responsable) de alguna sucursal? */
  protected esRegente(u: UsuarioUI): boolean {
    return this.sucursales().some(s => s.responsableId === u.id);
  }

  protected guardar(): void {
    if (!this.formularioValido()) {
      this.toast.aviso('Revisa los campos del formulario');
      return;
    }
    const esSuperAdmin = this.formRoles().includes('SUPER_ADMIN');
    const sucursalId   = esSuperAdmin ? null : (this.formSucursalId() || null);
    const dni          = this.formDni().trim() || undefined;
    const telefono     = this.formTelefono().trim() || undefined;
    // Solo se envían permisos que respeten el piso (el backend igual valida).
    const permisos     = this.formPermisos().filter(m => moduloAlcanzaPiso(m, this.formRoles()));
    const base = {
      nombres:   this.formNombres().trim(),
      apellidos: this.formApellidos().trim(),
      email:     this.formEmail().trim().toLowerCase(),
      dni,
      telefono,
      roles:     [...this.formRoles()],
      permisos,
      sucursalId,
    };

    if (this.modoModal() === 'crear') {
      this.guardando.set(true);
      this.usuarioApi.crear({ ...base, password: this.formPassword() }).subscribe({
        next: (u) => {
          this.guardando.set(false);
          this.toast.exito(`Usuario ${u.nombres} creado`);
          this.cerrarModal();
          this.cargar();
        },
        error: (e) => {
          this.guardando.set(false);
          this.toast.error(e.error?.message ?? e.message ?? 'No se pudo crear el usuario');
        },
      });
      return;
    }

    const id = this.idEditando();
    if (!id) return;
    // Salvaguarda: no quitarte tu propio rol de administrador.
    const yo = this.auth.usuario();
    if (yo?.id === id) {
      const yoTeniaAdmin = yo.roles.includes('SUPER_ADMIN') || yo.roles.includes('ADMIN');
      const seguirAdmin  = base.roles.includes('SUPER_ADMIN') || base.roles.includes('ADMIN');
      if (yoTeniaAdmin && !seguirAdmin) {
        this.toast.error('No puedes quitarte tu propio rol de administrador');
        return;
      }
    }
    this.guardando.set(true);
    this.usuarioApi.actualizar(id, base).subscribe({
      next: () => {
        this.guardando.set(false);
        this.toast.exito('Cambios guardados');
        this.cerrarModal();
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.toast.error(e.error?.message ?? e.message ?? 'No se pudo guardar');
      },
    });
  }

  protected pedirToggleEstado(u: UsuarioUI): void {
    if (this.esYoMismo(u)) {
      this.toast.error('No puedes desactivarte a ti mismo');
      return;
    }
    if (u.estado === 'ACTIVO') {
      this.usuarioConfirmar.set(u);
      this.accionConfirmar.set('desactivar');
      this.modalConfirmar.set(true);
    } else {
      this.aplicarToggle(u);
    }
  }

  protected confirmarToggle(): void {
    const u = this.usuarioConfirmar();
    if (u) this.aplicarToggle(u);
    this.modalConfirmar.set(false);
    this.usuarioConfirmar.set(null);
  }

  protected cancelarToggle(): void {
    this.modalConfirmar.set(false);
    this.usuarioConfirmar.set(null);
  }

  private aplicarToggle(u: UsuarioUI): void {
    const activar = u.estado !== 'ACTIVO';
    const op = activar ? this.usuarioApi.reactivar(u.id) : this.usuarioApi.desactivar(u.id);
    op.subscribe({
      next: () => {
        this.toast.aviso(`${u.nombres} ${u.apellidos} ${activar ? 'activado' : 'desactivado'}`);
        this.cargar();
      },
      error: (e) => this.toast.error(e.error?.message ?? e.message ?? 'No se pudo cambiar el estado'),
    });
  }

  protected abrirReset(u: UsuarioUI): void {
    this.usuarioReset.set(u);
    this.passwordGeneradaReset.set(this.generarPassword());
    this.modalReset.set(true);
  }

  protected cancelarReset(): void {
    this.modalReset.set(false);
    this.usuarioReset.set(null);
    this.passwordGeneradaReset.set('');
  }

  protected confirmarReset(): void {
    const u = this.usuarioReset();
    if (!u) return;
    this.usuarioApi.cambiarPassword(u.id, this.passwordGeneradaReset()).subscribe({
      next: () => {
        this.toast.exito(`Contraseña de ${u.nombres} actualizada`);
        this.cancelarReset();
      },
      error: (e) => this.toast.error(e.error?.message ?? e.message ?? 'No se pudo cambiar la contraseña'),
    });
  }

  protected regenerarPasswordReset(): void {
    this.passwordGeneradaReset.set(this.generarPassword());
  }

  protected copiarPassword(pwd: string): void {
    navigator.clipboard.writeText(pwd).then(
      () => this.toast.exito('Contrasena copiada al portapapeles'),
      () => this.toast.error('No se pudo copiar la contrasena')
    );
  }

  private generarPassword(): string {
    const mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const minus = 'abcdefghijkmnpqrstuvwxyz';
    const nums  = '23456789';
    const todo  = mayus + minus + nums;
    const partes = [
      mayus[Math.floor(Math.random() * mayus.length)],
      minus[Math.floor(Math.random() * minus.length)],
      nums[Math.floor(Math.random() * nums.length)],
    ];
    while (partes.length < 12) {
      partes.push(todo[Math.floor(Math.random() * todo.length)]);
    }
    return partes.sort(() => Math.random() - 0.5).join('');
  }

  protected exportarCSV(): void {
    const filas = this.usuariosFiltrados();
    if (filas.length === 0) {
      this.toast.aviso('No hay usuarios para exportar');
      return;
    }
    const cab = ['Nombres', 'Apellidos', 'DNI', 'Email', 'Roles', 'Sucursal', 'Estado', 'Ultimo acceso'];
    const escapar = (v: string | number | undefined | null): string => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lineas = filas.map(u => [
      u.nombres, u.apellidos, u.dni, u.email,
      u.roles.map(r => this.etiquetaRol(r)).join(' / '),
      this.nombreSucursal(u.sucursalActualId),
      u.estado, u.ultimoAcceso,
    ].map(escapar).join(','));
    const contenido = '﻿' + [cab.join(','), ...lineas].join('\n');
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const hoy  = new Date().toISOString().slice(0, 10);
    a.href     = url;
    a.download = `usuarios_${hoy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.exito(`Exportados ${filas.length} usuarios a CSV`);
  }

  protected toggleMostrarPwd(): void {
    this.formMostrarPwd.update(v => !v);
  }

  protected regenerarPasswordForm(): void {
    this.formPassword.set(this.generarPassword());
  }
}
