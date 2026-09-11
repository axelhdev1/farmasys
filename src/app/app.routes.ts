import { Routes } from '@angular/router';
import { authGuard, noAuthGuard, cambioPasswordGuard } from './core/auth/auth.guard';
import { rolGuard } from './core/auth/rol.guard';
import { permisoGuard } from './core/auth/permiso.guard';

/**
 * Rutas de la aplicación con LAZY LOADING y protección por rol.
 *
 * Niveles de protección:
 *  1. authGuard          → requiere sesión activa (cualquier rol)
 *  2. rolGuard(...)      → requiere uno de los roles listados
 *
 * Roles disponibles: SUPER_ADMIN | ADMIN | VENDEDOR | FARMACEUTICO | ALMACENERO
 * Nota: SUPER_ADMIN omite TODOS los rolGuard — tiene acceso total.
 *
 * Tabla de acceso (además de SUPER_ADMIN, que entra a todo):
 *  /dashboard      → todos los roles autenticados
 *  /pos            → ADMIN, VENDEDOR
 *  /inventario     → ADMIN, FARMACEUTICO, ALMACENERO
 *  /ventas         → ADMIN, FARMACEUTICO
 *  /clientes       → ADMIN, VENDEDOR, FARMACEUTICO
 *  /finanzas       → ADMIN
 *  /usuarios       → ADMIN
 *  /configuracion  → ADMIN
 *  /facturacion    → SUPER_ADMIN, ADMIN
 *  /sucursales     → SUPER_ADMIN
 */
export const routes: Routes = [
  // ── Pública ────────────────────────────────────────────────────────────
  {
    path: 'login',
    canActivate: [noAuthGuard],
    loadComponent: () =>
      import('./features/auth/login/login').then((m) => m.LoginComponent),
  },

  // ── Privadas: dentro del layout principal ──────────────────────────────
  {
    path: '',
    canActivate: [authGuard],
    // authGuard: exige sesión. cambioPasswordGuard: si el usuario debe cambiar
    // su clave, lo encierra en /perfil hasta que lo haga.
    canActivateChild: [authGuard, cambioPasswordGuard],
    loadComponent: () =>
      import('./layout/main-layout/main-layout').then(
        (m) => m.MainLayoutComponent
      ),
    children: [
      // Accesible por cualquier usuario autenticado
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard').then(
            (m) => m.DashboardComponent
          ),
      },

      // Mi Perfil: cualquier usuario edita sus datos y cambia su clave.
      {
        path: 'perfil',
        loadComponent: () =>
          import('./features/perfil/perfil').then((m) => m.PerfilComponent),
      },

      // Acceso por MÓDULO (permisoGuard). El permiso reemplaza al rol pero
      // conserva el mismo acceso por defecto vía la plantilla del rol.
      {
        path: 'pos',
        canActivate: [permisoGuard('pos')],
        loadComponent: () =>
          import('./features/pos/pos').then((m) => m.PosComponent),
      },

      {
        path: 'caja',
        canActivate: [permisoGuard('caja')],
        loadComponent: () =>
          import('./features/caja/caja').then((m) => m.CajaComponent),
      },

      {
        path: 'inventario',
        canActivate: [permisoGuard('inventario')],
        loadComponent: () =>
          import('./features/inventario/inventario').then(
            (m) => m.InventarioComponent
          ),
      },

      {
        path: 'compras',
        canActivate: [permisoGuard('compras')],
        loadComponent: () =>
          import('./features/compras/compras').then((m) => m.ComprasComponent),
      },

      {
        path: 'reposicion',
        canActivate: [permisoGuard('reposicion')],
        loadComponent: () =>
          import('./features/reposicion/reposicion').then((m) => m.ReposicionComponent),
      },

      {
        path: 'mermas',
        canActivate: [permisoGuard('mermas')],
        loadComponent: () =>
          import('./features/mermas/mermas').then((m) => m.MermasComponent),
      },

      {
        path: 'transferencias',
        canActivate: [permisoGuard('transferencias')],
        loadComponent: () =>
          import('./features/transferencias/transferencias').then((m) => m.TransferenciasComponent),
      },

      {
        path: 'inventario-fisico',
        canActivate: [permisoGuard('inventario_fisico')],
        loadComponent: () =>
          import('./features/inventario-fisico/inventario-fisico').then((m) => m.InventarioFisicoComponent),
      },

      {
        path: 'ventas',
        canActivate: [permisoGuard('ventas')],
        loadComponent: () =>
          import('./features/ventas/ventas').then((m) => m.VentasComponent),
      },

      {
        path: 'clientes',
        canActivate: [permisoGuard('clientes')],
        loadComponent: () =>
          import('./features/clientes/clientes').then(
            (m) => m.ClientesComponent
          ),
      },

      {
        path: 'finanzas',
        canActivate: [permisoGuard('finanzas')],
        loadComponent: () =>
          import('./features/finanzas/finanzas').then(
            (m) => m.FinanzasComponent
          ),
      },

      {
        path: 'usuarios',
        canActivate: [permisoGuard('usuarios')],
        loadComponent: () =>
          import('./features/usuarios/usuarios').then(
            (m) => m.UsuariosComponent
          ),
      },

      {
        path: 'importar',
        canActivate: [permisoGuard('importar')],
        loadComponent: () =>
          import('./features/importador/importador').then(
            (m) => m.ImportadorComponent
          ),
      },

      {
        path: 'configuracion',
        canActivate: [permisoGuard('configuracion')],
        loadComponent: () =>
          import('./features/configuracion/configuracion').then(
            (m) => m.ConfiguracionComponent
          ),
      },

      // Facturación electrónica — placeholder informativo. Sigue por ROL: no es
      // un módulo del catálogo de permisos (es una pantalla informativa).
      {
        path: 'facturacion',
        canActivate: [rolGuard('SUPER_ADMIN', 'ADMIN')],
        loadComponent: () =>
          import('./features/facturacion/facturacion').then(
            (m) => m.FacturacionComponent
          ),
      },

      // Vista global multi-sucursal: solo SUPER_ADMIN (piso del módulo).
      {
        path: 'sucursales',
        canActivate: [permisoGuard('sucursales')],
        loadComponent: () =>
          import('./features/sucursales/sucursales').then(
            (m) => m.SucursalesComponent
          ),
      },

      // Ruta por defecto dentro del layout
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },

  // ── Fallback ───────────────────────────────────────────────────────────
  { path: '**', redirectTo: '' },
];
