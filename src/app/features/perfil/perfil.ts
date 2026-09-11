import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { UsuarioApiService } from '../../core/services/usuario-api';
import { ToastService } from '../../core/services/toast.service';

/**
 * Mi Perfil — autogestión del usuario (cualquier rol).
 * Edita nombres/apellidos/teléfono y cambia la propia contraseña (pidiendo la
 * actual). En modo "forzar" (primer login) el cambio de clave es obligatorio
 * antes de poder navegar a otra sección.
 */
@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './perfil.html',
  styleUrl: './perfil.scss',
})
export class PerfilComponent {
  private readonly auth      = inject(AuthService);
  private readonly usuarioApi = inject(UsuarioApiService);
  private readonly toast     = inject(ToastService);
  private readonly route     = inject(ActivatedRoute);
  private readonly router    = inject(Router);

  protected readonly usuario = this.auth.usuario;

  /** Modo obligatorio: primer login o ?forzar=1. */
  protected readonly forzar = computed(() =>
    this.auth.debeCambiarPassword() ||
    this.route.snapshot.queryParamMap.get('forzar') === '1',
  );

  // ── Datos ──────────────────────────────────────────────────────────────
  protected nombres   = signal(this.auth.usuario()?.nombres ?? '');
  protected apellidos = signal(this.auth.usuario()?.apellidos ?? '');
  protected telefono  = signal(this.auth.usuario()?.telefono ?? '');
  protected readonly guardandoPerfil = signal(false);

  // ── Cambio de contraseña ─────────────────────────────────────────────────
  protected actual    = signal('');
  protected nueva     = signal('');
  protected confirmar = signal('');
  protected verActual = signal(false);
  protected verNueva  = signal(false);
  protected readonly cambiandoPwd = signal(false);

  protected readonly errorNueva = computed<string | null>(() => {
    const p = this.nueva();
    if (!p) return null;
    if (p.length < 8) return 'Mínimo 8 caracteres';
    if (!/\d/.test(p)) return 'Debe incluir al menos un número';
    return null;
  });

  protected readonly errorConfirmar = computed<string | null>(() => {
    if (!this.confirmar()) return null;
    return this.nueva() === this.confirmar() ? null : 'Las contraseñas no coinciden';
  });

  protected readonly passwordValido = computed<boolean>(() =>
    !!this.actual() && !!this.nueva() && !this.errorNueva() &&
    this.nueva() === this.confirmar(),
  );

  protected readonly rolPrincipal = computed<string>(() => {
    const u = this.auth.usuario();
    if (!u || u.roles.length === 0) return '';
    const map: Record<string, string> = {
      SUPER_ADMIN: 'Super Administrador', ADMIN: 'Administrador',
      VENDEDOR: 'Vendedor', FARMACEUTICO: 'Farmacéutico', ALMACENERO: 'Almacenero',
    };
    return map[u.roles[0]] ?? u.roles[0];
  });

  protected readonly iniciales = computed<string>(() => {
    const u = this.auth.usuario();
    if (!u) return '';
    return `${u.nombres.charAt(0)}${u.apellidos?.charAt(0) ?? ''}`.toUpperCase();
  });

  // ── Acciones ─────────────────────────────────────────────────────────────
  guardarPerfil(): void {
    if (!this.nombres().trim() || !this.apellidos().trim()) {
      this.toast.aviso('Nombres y apellidos no pueden estar vacíos');
      return;
    }
    this.guardandoPerfil.set(true);
    this.usuarioApi.actualizarMiPerfil({
      nombres: this.nombres().trim(),
      apellidos: this.apellidos().trim(),
      telefono: this.telefono().trim(),
    }).subscribe({
      next: () => {
        this.guardandoPerfil.set(false);
        this.auth.actualizarUsuarioSesion({
          nombres: this.nombres().trim(),
          apellidos: this.apellidos().trim(),
          telefono: this.telefono().trim(),
        });
        this.toast.exito('Perfil actualizado');
      },
      error: (e) => {
        this.guardandoPerfil.set(false);
        this.toast.error(e.error?.message ?? e.message ?? 'No se pudo guardar el perfil');
      },
    });
  }

  cambiarPassword(): void {
    if (!this.passwordValido()) {
      this.toast.aviso('Revisa los campos de la contraseña');
      return;
    }
    this.cambiandoPwd.set(true);
    this.usuarioApi.cambiarMiPassword(this.actual(), this.nueva()).subscribe({
      next: () => {
        this.cambiandoPwd.set(false);
        this.auth.marcarPasswordCambiada();
        this.toast.exito('Contraseña actualizada');
        this.actual.set(''); this.nueva.set(''); this.confirmar.set('');
        // Si venía forzado (primer login), ya puede entrar al sistema.
        if (this.forzar()) this.router.navigateByUrl('/dashboard');
      },
      error: (e) => {
        this.cambiandoPwd.set(false);
        this.toast.error(e.error?.message ?? e.message ?? 'No se pudo cambiar la contraseña');
      },
    });
  }
}
