import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected email = signal<string>('');
  protected password = signal<string>('');
  protected recordarme = signal<boolean>(false);
  protected mostrarPassword = signal<boolean>(false);

  protected cargando = signal<boolean>(false);
  protected error = signal<string | null>(null);

  protected readonly sesionExpirada = signal<boolean>(
    this.route.snapshot.queryParamMap.get('expirada') === '1'
  );

  /**
   * Destino seguro tras el login.
   *
   * El `redirect` viene de la URL, así que NO es de fiar: si apunta al propio
   * login (caso real cuando un 401 lo anidaba), el usuario "iniciaba sesión"
   * y volvía a la pantalla de login. También se descartan URLs absolutas
   * (http://…, //otro-sitio) para no permitir redirecciones fuera de la app.
   */
  private destinoSeguro(): string {
    const crudo = this.route.snapshot.queryParamMap.get('redirect');
    if (!crudo) return '/dashboard';
    // Debe ser una ruta interna: empieza con "/" y no con "//".
    if (!crudo.startsWith('/') || crudo.startsWith('//')) return '/dashboard';
    // Nunca volver al login (ni con query params colgando).
    if (crudo.split('?')[0] === '/login') return '/dashboard';
    return crudo;
  }

  async iniciarSesion(event: Event): Promise<void> {
    event.preventDefault();
    if (this.cargando()) return;
    this.error.set(null);
    this.sesionExpirada.set(false);

    if (!this.email() || !this.password()) {
      this.error.set('Ingresa email y contraseña');
      return;
    }

    this.cargando.set(true);
    try {
      // Limpia cualquier resto de la sesión anterior ANTES de autenticar:
      // al cambiar de usuario, un token viejo podía colarse en las primeras
      // peticiones y provocar un 401 que tumbaba la sesión nueva.
      this.auth.logout();

      await this.auth.login({
        email: this.email(),
        password: this.password(),
        recordarme: this.recordarme(),
      });
      // replaceUrl: la URL del login (con sus query params) no queda en el
      // historial, así el botón "atrás" no devuelve a una pantalla muerta.
      await this.router.navigateByUrl(this.destinoSeguro(), { replaceUrl: true });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'Error al iniciar sesión';
      this.error.set(this.mensajeAmigable(mensaje));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Traduce errores técnicos a algo que un cajero entienda. */
  private mensajeAmigable(mensaje: string): string {
    const m = mensaje.toLowerCase();
    if (m.includes('too many requests') || m.includes('throttler')) {
      return 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentar.';
    }
    if (m.includes('sin conexión') || m.includes('conexión')) {
      return 'Sin conexión con el servidor. Verifica tu red.';
    }
    if (m.includes('unauthorized') || m.includes('credenciales')) {
      return 'Correo o contraseña incorrectos.';
    }
    if (m.includes('tardó demasiado') || m.includes('timeout')) {
      return 'El servidor tardó demasiado. Intenta nuevamente.';
    }
    return mensaje;
  }

  // NOTA: se eliminó usarCredencialesDemo(): apuntaba a usuarios mock
  // (@farmasys.com) que ya no existen. Los usuarios reales salen del seed.

  /** No hay recuperación automática: el administrador resetea la clave. */
  olvideContrasena(): void {
    this.sesionExpirada.set(false);
    this.error.set(
      'Por seguridad, solo el administrador puede restablecer contraseñas. Solicítalo al encargado de la botica.'
    );
  }

  togglePassword(): void {
    this.mostrarPassword.update((v) => !v);
  }
}
