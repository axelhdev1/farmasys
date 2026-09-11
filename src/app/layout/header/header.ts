import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SucursalService } from '../../core/services/sucursal.service';
import { CajaService } from '../../core/services/caja.service';

@Component({
  selector: 'app-header',
  standalone: true,
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class HeaderComponent {
  private readonly auth       = inject(AuthService);
  protected readonly sucursalSvc = inject(SucursalService);
  private readonly cajaSvc    = inject(CajaService);
  private readonly router     = inject(Router);

  constructor() {
    // Alertas de la sucursal activa para la campana. El super admin ya las
    // recibe por cargarKpis() (todas las boticas); el resto necesita las
    // suyas, que vienen de un endpoint sin restricción de rol.
    effect(() => {
      const sid = this.sucursalSvc.sucursalActivaId();
      if (sid && !this.auth.tieneAlgunRol('SUPER_ADMIN')) {
        this.sucursalSvc.cargarKpiDeSucursal(sid);
      }
    });
  }

  // ── Chip de caja: estado siempre visible para el cajero ───────────────
  /** Caja abierta del usuario en la sucursal activa (o null). */
  protected readonly cajaAbierta = computed(() => this.cajaSvc.cajaActivaSig());

  /** Efectivo esperado formateado (se formatea aquí para no importar pipes). */
  protected readonly efectivoEsperadoTexto = computed<string>(() => {
    const v = this.cajaSvc.totalesSig()?.efectivoEsperado;
    if (v === undefined || v === null) return '';
    return `S/ ${Number(v).toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  });

  irACaja(): void { this.router.navigateByUrl('/caja'); }

  // ── Datos del usuario ─────────────────────────────────────────────────
  protected readonly usuario = this.auth.usuario;

  protected readonly iniciales = computed<string>(() => {
    const u = this.auth.usuario();
    if (!u) return '';
    return `${u.nombres.charAt(0)}${u.apellidos?.charAt(0) ?? ''}`.toUpperCase();
  });

  protected readonly nombreCompleto = computed<string>(() => {
    const u = this.auth.usuario();
    if (!u) return '';
    return `${u.nombres} ${u.apellidos ?? ''}`.trim();
  });

  protected readonly rolPrincipal = computed<string>(() => {
    const u = this.auth.usuario();
    if (!u || u.roles.length === 0) return '';
    const map: Record<string, string> = {
      SUPER_ADMIN:  'Super Administrador',
      ADMIN:        'Administrador',
      VENDEDOR:     'Vendedor',
      FARMACEUTICO: 'Farmacéutico',
      ALMACENERO:   'Almacenero',
    };
    return map[u.roles[0]] ?? u.roles[0];
  });

  /** ¿El usuario actual es SUPER_ADMIN? */
  protected readonly esSuperAdmin = computed(() =>
    this.auth.tieneAlgunRol('SUPER_ADMIN')
  );

  // ── Selector de sucursal ──────────────────────────────────────────────
  protected readonly dropdownAbierto = signal(false);

  protected toggleDropdown(): void {
    this.dropdownAbierto.update(v => !v);
  }

  protected seleccionarSucursal(id: string): void {
    this.sucursalSvc.cambiarSucursal(id);
    this.dropdownAbierto.set(false);
  }

  protected seleccionarGlobal(): void {
    this.sucursalSvc.activarModoGlobal();
    this.dropdownAbierto.set(false);
  }

  // ── Notificaciones ────────────────────────────────────────────────────
  /**
   * Alertas REALES: sin stock + stock crítico + lotes por vencer.
   * El super admin ve el total de todas las boticas; el resto, el de la suya.
   *
   * Antes esto devolvía un 3 fijo para todo usuario no-super-admin: la campana
   * mostraba siempre "3" aunque no hubiera ni una alerta real.
   */
  protected readonly cantidadAlertas = computed(() =>
    this.esSuperAdmin()
      ? this.sucursalSvc.totalAlertasGlobal()
      : this.sucursalSvc.alertasSucursalActiva()
  );
  protected readonly hayAlertas = computed(() => this.cantidadAlertas() > 0);

  // ── Búsqueda global ───────────────────────────────────────────────────
  protected readonly busquedaGlobal = signal<string>('');
}
