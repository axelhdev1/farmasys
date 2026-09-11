import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { SucursalService } from '../../core/services/sucursal.service';
import {
  ConfiguracionService,
  ConfiguracionInput,
  CambioConfiguracion,
} from '../../core/services/configuracion.service';

type Seccion = 'farmacia' | 'comprobantes' | 'sistema' | 'seguridad' | 'historial';

/** Nombres legibles de los campos, para la bitácora (la API guarda el nombre técnico). */
const ETIQUETA_CAMPO: Record<string, string> = {
  razonSocial: 'Razón social',
  ruc: 'RUC',
  direccionFiscal: 'Dirección fiscal',
  telefono: 'Teléfono',
  email: 'Email',
  directorTecnico: 'Director técnico',
  colegiatura: 'Colegiatura',
  registroSanitario: 'Registro sanitario',
  licenciaFuncionamiento: 'Licencia de funcionamiento',
  igvPorcentaje: 'IGV (%)',
  moneda: 'Moneda',
  simbolo: 'Símbolo',
  pieTicket: 'Pie de ticket',
  logoUrl: 'Logo',
  logoEnTicket: 'Logo en ticket',
  tipoImpresion: 'Tipo de impresión',
  alertaVencimientoDias: 'Alerta de vencimiento (días)',
  stockMinimoDefault: 'Stock mínimo por defecto',
  umbralDescuadreCaja: 'Umbral de descuadre de caja',
};

/** Ajustes que afectan dinero o controles: se resaltan en la bitácora. */
const CAMPOS_SENSIBLES = new Set(['igvPorcentaje', 'umbralDescuadreCaja']);

interface FormConfig {
  razonSocial: string;
  ruc: string;
  direccionFiscal: string;
  telefono: string;
  email: string;
  directorTecnico: string;
  colegiatura: string;
  registroSanitario: string;
  licenciaFuncionamiento: string;
  igvPorcentaje: number;
  moneda: string;
  simbolo: string;
  pieTicket: string;
  logoEnTicket: boolean;
  tipoImpresion: string;
  alertaVencimientoDias: number;
  stockMinimoDefault: number;
  umbralDescuadreCaja: number;
}

const VACIO: FormConfig = {
  razonSocial: '', ruc: '', direccionFiscal: '', telefono: '', email: '',
  directorTecnico: '', colegiatura: '', registroSanitario: '', licenciaFuncionamiento: '',
  igvPorcentaje: 18, moneda: 'PEN', simbolo: 'S/', pieTicket: '', logoEnTicket: true,
  tipoImpresion: 'termica80', alertaVencimientoDias: 30, stockMinimoDefault: 5,
  umbralDescuadreCaja: 20,
};

/**
 * Rangos aceptados. Son los MISMOS que valida el backend en el DTO: si aquí se
 * afloja uno, el guardado falla con un error del servidor en vez de avisar
 * antes. Cualquier cambio va en los dos lados.
 */
const LIMITES = {
  igvPorcentaje:         { min: 0, max: 50,   label: 'El IGV' },
  alertaVencimientoDias: { min: 1, max: 365,  label: 'La alerta de vencimiento' },
  stockMinimoDefault:    { min: 0, max: 1000, label: 'El stock mínimo por defecto' },
  umbralDescuadreCaja:   { min: 0, max: 1000, label: 'El umbral de descuadre' },
} as const;

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.scss',
})
export class ConfiguracionComponent implements OnInit {
  private readonly configSvc  = inject(ConfiguracionService);
  private readonly sucursalSvc = inject(SucursalService);
  private readonly toast      = inject(ToastService);
  private readonly auth       = inject(AuthService);

  protected readonly seccionActiva = signal<Seccion>('farmacia');
  protected readonly cargando  = signal(false);
  protected readonly guardando = signal(false);

  /** Modelo mutable del formulario (para [(ngModel)]). */
  protected form: FormConfig = { ...VACIO };

  protected readonly puedeEditar = computed(() =>
    this.auth.tieneAlgunRol('SUPER_ADMIN', 'ADMIN'),
  );

  /** Sucursal activa (para mostrar sus series como solo-lectura). */
  protected readonly sucursalActiva = computed(() => {
    const id = this.sucursalSvc.sucursalActivaId();
    return this.sucursalSvc.sucursales().find((s) => s.id === id);
  });

  protected readonly secciones: Array<{ id: Seccion; label: string; icon: string; desc: string }> = [
    { id: 'farmacia',     label: 'Datos de la Empresa',  icon: 'local_pharmacy', desc: 'Razón social, RUC y director técnico' },
    { id: 'comprobantes', label: 'Comprobantes',         icon: 'receipt',        desc: 'Pie de ticket, logo e impresión' },
    { id: 'sistema',      label: 'Sistema',              icon: 'tune',           desc: 'IGV, moneda y alertas' },
    { id: 'seguridad',    label: 'Seguridad',            icon: 'security',       desc: 'Gestionada por el sistema' },
    { id: 'historial',    label: 'Historial de cambios', icon: 'history',        desc: 'Quién cambió qué y cuándo' },
  ];

  // ── Bitácora de cambios ───────────────────────────────────────────────
  protected readonly historial = signal<CambioConfiguracion[]>([]);
  protected readonly cargandoHistorial = signal(false);
  private historialCargado = false;

  protected etiqueta(campo: string): string { return ETIQUETA_CAMPO[campo] ?? campo; }
  protected esSensible(campo: string): boolean { return CAMPOS_SENSIBLES.has(campo); }

  protected fechaLegible(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  protected cargarHistorial(forzar = false): void {
    if (this.historialCargado && !forzar) return;
    this.cargandoHistorial.set(true);
    this.configSvc.historial().subscribe({
      next: (h) => { this.historial.set(h); this.historialCargado = true; this.cargandoHistorial.set(false); },
      error: () => { this.historial.set([]); this.cargandoHistorial.set(false); },
    });
  }

  protected readonly opcionesImpresion = [
    { valor: 'termica80', label: 'Térmica 80mm' },
    { valor: 'termica58', label: 'Térmica 58mm' },
    { valor: 'a4',        label: 'Hoja A4' },
  ];

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando.set(true);
    this.configSvc.cargar();
    // Poblar el formulario cuando llegue la config (o si ya está en memoria).
    const aplicar = () => {
      const c = this.configSvc.config();
      if (c) {
        this.form = {
          razonSocial: c.razonSocial, ruc: c.ruc, direccionFiscal: c.direccionFiscal,
          telefono: c.telefono, email: c.email, directorTecnico: c.directorTecnico,
          colegiatura: c.colegiatura, registroSanitario: c.registroSanitario,
          licenciaFuncionamiento: c.licenciaFuncionamiento,
          igvPorcentaje: Number(c.igvPorcentaje), moneda: c.moneda, simbolo: c.simbolo,
          pieTicket: c.pieTicket, logoEnTicket: c.logoEnTicket, tipoImpresion: c.tipoImpresion,
          alertaVencimientoDias: c.alertaVencimientoDias, stockMinimoDefault: c.stockMinimoDefault,
          umbralDescuadreCaja: Number(c.umbralDescuadreCaja ?? 20),
        };
      }
      this.cargando.set(false);
    };
    // Reintenta brevemente hasta que la config esté cargada.
    let intentos = 0;
    const timer = setInterval(() => {
      if (this.configSvc.config() || intentos++ > 20) {
        clearInterval(timer);
        aplicar();
      }
    }, 100);
  }

  // ── Validaciones ──────────────────────────────────────────────────────
  /**
   * RUC con dígito verificador (módulo 11, algoritmo SUNAT).
   *
   * Es el RUC del emisor: sale en todos los comprobantes. Validar solo la
   * longitud dejaba pasar un número tecleado al azar, y el error recién
   * aparecería cuando SUNAT rechazara la facturación entera.
   */
  protected validarRuc(): string | null {
    const r = this.form.ruc.trim();
    if (!r) return 'RUC requerido';
    if (!/^\d{11}$/.test(r)) return 'El RUC debe tener 11 dígitos';
    if (!['10', '15', '17', '20'].includes(r.substring(0, 2))) {
      return 'El RUC debe empezar en 10, 15, 17 o 20';
    }
    const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const d = r.split('').map(Number);
    const suma = pesos.reduce((s, p, i) => s + d[i] * p, 0);
    const dv = 11 - (suma % 11);
    const esperado = dv === 11 ? 0 : dv === 10 ? 1 : dv;
    if (esperado !== d[10]) return 'El RUC no es válido (dígito verificador)';
    return null;
  }
  protected validarEmail(): string | null {
    const e = this.form.email.trim();
    if (!e) return null;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? null : 'Email inválido';
  }

  /**
   * Primer número fuera de rango, si hay alguno. Evita el caso feo: guardar un
   * IGV de 180 %, ver "Guardado" y que el sistema siga cobrando 18 % porque
   * descartó el valor absurdo por su cuenta.
   */
  protected validarRangos(): string | null {
    for (const [campo, lim] of Object.entries(LIMITES)) {
      const v = Number(this.form[campo as keyof typeof LIMITES]);
      if (!Number.isFinite(v) || v < lim.min || v > lim.max) {
        return `${lim.label} debe estar entre ${lim.min} y ${lim.max}.`;
      }
    }
    return null;
  }

  protected irSeccion(s: Seccion): void {
    this.seccionActiva.set(s);
    if (s === 'historial') this.cargarHistorial();
  }

  guardar(): void {
    if (!this.puedeEditar()) { this.toast.aviso('Solo un administrador puede editar la configuración'); return; }
    const errRuc = this.validarRuc();
    if (errRuc) { this.toast.error(errRuc); this.seccionActiva.set('farmacia'); return; }
    const errEmail = this.validarEmail();
    if (errEmail) { this.toast.error(errEmail); this.seccionActiva.set('farmacia'); return; }
    if (!this.form.razonSocial.trim()) { this.toast.error('Razón social requerida'); this.seccionActiva.set('farmacia'); return; }
    const errRango = this.validarRangos();
    if (errRango) { this.toast.error(errRango); this.seccionActiva.set('sistema'); return; }

    const input: ConfiguracionInput = { ...this.form };
    this.guardando.set(true);
    this.configSvc.guardar(input).subscribe({
      next: () => {
        this.guardando.set(false);
        this.toast.exito('Configuración guardada — se aplica al ticket y al sistema');
        // La bitácora acaba de cambiar: recargarla para que no muestre datos viejos.
        if (this.historialCargado) this.cargarHistorial(true);
      },
      error: (e) => {
        this.guardando.set(false);
        this.toast.error(e.error?.message ?? e.message ?? 'No se pudo guardar la configuración');
      },
    });
  }
}
