import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SucursalService } from '../../core/services/sucursal.service';

/**
 * Sidebar de navegación principal.
 *
 * ── Matriz de acceso por sección ────────────────────────────────────────
 *
 *  Sección           SUPER_ADMIN  ADMIN  VENDEDOR  FARMACÉUTICO  ALMACENERO
 *  ─────────────────────────────────────────────────────────────────────────
 *  Dashboard              ✅       ✅       ✅          ✅           ✅
 *  POS                    ✅       ✅       ✅          ❌           ❌
 *  Inventario             ✅       ✅       ❌          ✅           ✅
 *  Historial Ventas       ✅       ✅       ❌          ✅           ❌
 *  Clientes               ✅       ✅       ✅          ✅           ❌
 *  Almacén                ✅       ✅       ❌          ✅           ✅
 *  ─────────────────────────────────────────────────────────────────────────
 *  Finanzas               ✅       ✅       ❌          ❌           ❌
 *  Usuarios               ✅       ✅       ❌          ❌           ❌
 *  Configuración          ✅       ✅       ❌          ❌           ❌
 *  ─────────────────────────────────────────────────────────────────────────
 *  Sucursales (global)    ✅       ❌       ❌          ❌           ❌
 *  ─────────────────────────────────────────────────────────────────────────
 *
 *  SUPER_ADMIN accede a todo. Es la única sección que ve /sucursales.
 */
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class SidebarComponent {
  private readonly auth        = inject(AuthService);
  private readonly router      = inject(Router);
  protected readonly sucursalSvc = inject(SucursalService);

  // ── Datos del usuario ──────────────────────────────────────────────────
  protected readonly usuario = this.auth.usuario;

  protected readonly iniciales = computed<string>(() => {
    const u = this.auth.usuario();
    if (!u) return '';
    return `${u.nombres.charAt(0)}${u.apellidos?.charAt(0) ?? ''}`.toUpperCase();
  });

  protected readonly rolPrincipal = computed<string>(() => {
    const u = this.auth.usuario();
    if (!u || u.roles.length === 0) return '';
    const map: Record<string, string> = {
      SUPER_ADMIN:  'Super Admin',
      ADMIN:        'Administrador',
      VENDEDOR:     'Vendedor',
      FARMACEUTICO: 'Farmacéutico',
      ALMACENERO:   'Almacenero',
    };
    return map[u.roles[0]] ?? u.roles[0];
  });

  // ── Identificadores de rol ────────────────────────────────────────────
  protected readonly esSuperAdmin = computed(() =>
    this.auth.tieneAlgunRol('SUPER_ADMIN')
  );

  // ── Visibilidad por PERMISO (un flag por módulo, espejo de las rutas) ───
  // auth.tienePermiso() ya aplica el fallback por rol y los pisos, así que un
  // usuario existente ve exactamente lo mismo que antes.
  protected readonly puedeUsarPOS          = computed(() => this.auth.tienePermiso('pos'));
  protected readonly puedeUsarCaja         = computed(() => this.auth.tienePermiso('caja'));
  protected readonly puedeVerInventario    = computed(() => this.auth.tienePermiso('inventario'));
  protected readonly puedeVerCompras       = computed(() => this.auth.tienePermiso('compras'));
  protected readonly puedeVerReposicion    = computed(() => this.auth.tienePermiso('reposicion'));
  protected readonly puedeVerMermas        = computed(() => this.auth.tienePermiso('mermas'));
  protected readonly puedeVerTransferencias = computed(() => this.auth.tienePermiso('transferencias'));
  protected readonly puedeVerInvFisico     = computed(() => this.auth.tienePermiso('inventario_fisico'));
  protected readonly puedeVerVentas        = computed(() => this.auth.tienePermiso('ventas'));
  protected readonly puedeVerClientes      = computed(() => this.auth.tienePermiso('clientes'));

  protected readonly puedeVerFinanzas      = computed(() => this.auth.tienePermiso('finanzas'));
  protected readonly puedeVerUsuarios      = computed(() => this.auth.tienePermiso('usuarios'));
  protected readonly puedeImportar         = computed(() => this.auth.tienePermiso('importar'));
  protected readonly puedeVerConfig        = computed(() => this.auth.tienePermiso('configuracion'));
  /** Facturación sigue por rol (no es módulo del catálogo). */
  protected readonly puedeVerFacturacion   = computed(() => this.auth.tieneAlgunRol('SUPER_ADMIN', 'ADMIN'));

  /** Sección ADMINISTRACIÓN visible si tiene acceso a cualquiera de sus ítems. */
  protected readonly puedeAdmin = computed(() =>
    this.puedeVerFinanzas() || this.puedeVerUsuarios() ||
    this.puedeImportar() || this.puedeVerConfig() || this.puedeVerFacturacion()
  );

  // ── Acciones ───────────────────────────────────────────────────────────
  irAPerfil(): void {
    this.router.navigateByUrl('/perfil');
  }

  cerrarSesion(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
