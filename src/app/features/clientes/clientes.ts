import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Cliente, TipoDocumento } from '../../core/models/cliente.model';
import { ToastService } from '../../core/services/toast.service';
import { ClienteService } from '../../core/services/cliente.service';
import { VentaService } from '../../core/services/venta.service';

interface ClienteUI extends Cliente {
  totalCompras: number;
  ultimaCompra: string;
  estado: 'activo' | 'inactivo';
}

interface CompraHistorial {
  id: string;
  fecha: string;
  comprobante: string;
  items: number;
  total: number;
  metodoPago: string;
}

type ModoModal = 'crear' | 'editar';

interface OpcionTipoDoc {
  valor: TipoDocumento;
  label: string;
  longitud: number | null;       // longitud exacta requerida (null = libre)
  patron: RegExp | null;         // patrón adicional (solo dígitos, etc.)
}

const TIPOS_DOC: OpcionTipoDoc[] = [
  { valor: 'DNI',        label: 'DNI',        longitud: 8,  patron: /^\d+$/ },
  { valor: 'RUC',        label: 'RUC',        longitud: 11, patron: /^\d+$/ },
  { valor: 'CE',         label: 'Carnet Ext.', longitud: null, patron: null },
  { valor: 'PASAPORTE',  label: 'Pasaporte',  longitud: null, patron: null },
];

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './clientes.html',
  styleUrl: './clientes.scss',
})
export class ClientesComponent implements OnInit {
  private readonly toast = inject(ToastService);
  private readonly clienteSvc = inject(ClienteService);
  private readonly ventaSvc = inject(VentaService);

  ngOnInit(): void {
    this.clienteSvc.cargar();
  }

  /** Padrón REAL del backend (compartido con el POS). */
  protected readonly clientes = computed<ClienteUI[]>(() =>
    this.clienteSvc.clientes().map((c) => ({
      ...c,
      totalCompras: 0,
      ultimaCompra: '—',
      estado: 'activo' as const,
    })),
  );

  // ── Estado de búsqueda y filtros ──────────────────────────────────────
  protected busqueda = signal('');
  protected filtroEstado = signal<'todos' | 'activo' | 'inactivo'>('todos');
  protected clienteSeleccionado = signal<ClienteUI | null>(null);

  // ── Estado del modal ───────────────────────────────────────────────────
  protected mostrarModal     = signal(false);
  protected modoModal        = signal<ModoModal>('crear');
  private  idEditando        = signal<string | null>(null);

  // Campos del formulario (signals individuales para binding cómodo)
  protected formTipoDoc      = signal<TipoDocumento>('DNI');
  protected formNumDoc       = signal('');
  protected formNombres      = signal('');
  protected formApellidos    = signal('');
  protected formRazonSocial  = signal('');
  protected formTelefono     = signal('');
  protected formEmail        = signal('');
  protected formDireccion    = signal('');

  protected readonly tiposDoc = TIPOS_DOC;

  // Aquí vivía `_clientesMock`: clientes inventados con DNIs, correos,
  // teléfonos y direcciones de aspecto real —y el nombre de una clínica que
  // existe de verdad—. No se usaba: el padrón sale del backend. Se borra
  // porque un mock así, en un repo, parece una fuga de datos de clientes.

  /**
   * Historial de compras del cliente abierto. REAL, del backend.
   *
   * Antes era `historialMock`: cinco compras inventadas que se pintaban
   * IGUALES para todos los clientes. No era código muerto — se mostraba en
   * pantalla. Cualquiera abría una ficha y veía un historial que no existía.
   */
  protected readonly historial = signal<CompraHistorial[]>([]);
  protected readonly cargandoHistorial = signal(false);

  private cargarHistorial(clienteId: string): void {
    this.cargandoHistorial.set(true);
    this.ventaSvc
      .listarBackend(undefined, { clienteId, estado: 'COMPLETADA', size: 20 })
      .subscribe({
        next: (rows) => {
          this.historial.set(
            rows
              .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
              .map((v) => ({
                id: v.id,
                fecha: new Date(v.fecha).toLocaleDateString('es-PE', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                }),
                comprobante: v.numeroComprobante,
                items: v.items.length,
                total: Number(v.total),
                metodoPago: this.labelMetodo(v),
              })),
          );
          this.cargandoHistorial.set(false);
        },
        error: () => { this.historial.set([]); this.cargandoHistorial.set(false); },
      });
  }

  /** Etiqueta del pago mirando TODOS los pagos, no solo el primero. */
  private labelMetodo(v: { pagos?: { metodo: string }[] }): string {
    const metodos = new Set((v.pagos ?? []).map((p) => p.metodo));
    if (metodos.size === 0) return '—';
    if (metodos.size > 1) return 'Mixto';
    const mapa: Record<string, string> = {
      EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', YAPE_PLIN: 'Yape/Plin',
      TRANSFERENCIA: 'Transferencia', MIXTO: 'Mixto',
    };
    return mapa[[...metodos][0]] ?? [...metodos][0];
  }

  /** Total gastado por el cliente, calculado del historial real. */
  protected readonly totalHistorial = computed(() =>
    this.historial().reduce((s, c) => s + c.total, 0),
  );

  // ── Computed ──────────────────────────────────────────────────────────
  protected clientesFiltrados = computed(() => {
    const q   = this.busqueda().toLowerCase().trim();
    const est = this.filtroEstado();
    return this.clientes().filter(c => {
      const matchEstado = est === 'todos' || c.estado === est;
      if (!q) return matchEstado;
      const nombre = `${c.nombres} ${c.apellidos ?? ''}`.toLowerCase();
      return matchEstado && (
        nombre.includes(q) ||
        c.numeroDocumento.includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.razonSocial?.toLowerCase().includes(q) ?? false)
      );
    });
  });

  protected kpis = computed(() => {
    const lista = this.clientes();
    return {
      total:     lista.length,
      activos:   lista.filter(c => c.estado === 'activo').length,
      conEmail:  lista.filter(c => !!c.email).length,
      totalCompras: lista.reduce((s, c) => s + c.totalCompras, 0),
    };
  });

  /** Tipo de documento actualmente seleccionado en el form */
  protected tipoSeleccionado = computed<OpcionTipoDoc>(
    () => TIPOS_DOC.find(t => t.valor === this.formTipoDoc()) ?? TIPOS_DOC[0]
  );

  /** Mensaje de error del número de documento (o null si está bien) */
  protected errorNumDoc = computed<string | null>(() => {
    const t   = this.tipoSeleccionado();
    const val = this.formNumDoc().trim();
    if (!val) return null; // se valida la presencia en formularioValido
    if (t.patron && !t.patron.test(val)) {
      return `${t.label} debe contener solo dígitos`;
    }
    if (t.longitud && val.length !== t.longitud) {
      return `${t.label} debe tener exactamente ${t.longitud} dígitos`;
    }
    return null;
  });

  /** Mensaje de error del email (o null si está bien) */
  protected errorEmail = computed<string | null>(() => {
    const e = this.formEmail().trim();
    if (!e) return null;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? null : 'Formato de email inválido';
  });

  protected formularioValido = computed<boolean>(() => {
    if (!this.formNumDoc().trim()) return false;
    if (this.errorNumDoc()) return false;
    if (this.errorEmail()) return false;
    if (this.formTipoDoc() === 'RUC') {
      if (!this.formRazonSocial().trim()) return false;
    } else {
      if (!this.formNombres().trim()) return false;
    }
    return true;
  });

  // ── Acciones de tabla / detalle ───────────────────────────────────────
  verDetalle(c: ClienteUI): void {
    this.clienteSeleccionado.set(c);
    this.historial.set([]);
    this.cargarHistorial(c.id);
  }

  cerrarDetalle(): void {
    this.clienteSeleccionado.set(null);
  }

  toggleEstado(c: ClienteUI, event?: Event): void {
    event?.stopPropagation();
    // El estado activo/inactivo de cliente no se gestiona en el backend por ahora.
    this.toast.aviso('La activación/desactivación de clientes estará disponible pronto');
  }

  // ── Modal: abrir / cerrar ─────────────────────────────────────────────
  abrirModalNuevo(): void {
    this.modoModal.set('crear');
    this.idEditando.set(null);
    this.limpiarFormulario();
    this.mostrarModal.set(true);
  }

  abrirModalEditar(c: ClienteUI, event?: Event): void {
    event?.stopPropagation();
    this.modoModal.set('editar');
    this.idEditando.set(c.id);
    this.formTipoDoc.set(c.tipoDocumento);
    this.formNumDoc.set(c.numeroDocumento);
    this.formNombres.set(c.nombres);
    this.formApellidos.set(c.apellidos ?? '');
    this.formRazonSocial.set(c.razonSocial ?? '');
    this.formTelefono.set(c.telefono ?? '');
    this.formEmail.set(c.email ?? '');
    this.formDireccion.set(c.direccion ?? '');
    this.mostrarModal.set(true);
  }

  cerrarModal(): void {
    this.mostrarModal.set(false);
  }

  /** Limpia el form cuando se abre en modo "crear" */
  private limpiarFormulario(): void {
    this.formTipoDoc.set('DNI');
    this.formNumDoc.set('');
    this.formNombres.set('');
    this.formApellidos.set('');
    this.formRazonSocial.set('');
    this.formTelefono.set('');
    this.formEmail.set('');
    this.formDireccion.set('');
  }

  /** Guarda el cliente: crea o actualiza según el modo */
  guardar(): void {
    if (!this.formularioValido()) {
      this.toast.aviso('Completa los campos requeridos correctamente');
      return;
    }

    const datos: Partial<ClienteUI> = {
      tipoDocumento:    this.formTipoDoc(),
      numeroDocumento:  this.formNumDoc().trim(),
      nombres:          this.formNombres().trim(),
      apellidos:        this.formApellidos().trim() || undefined,
      razonSocial:      this.formRazonSocial().trim() || undefined,
      telefono:         this.formTelefono().trim() || undefined,
      email:            this.formEmail().trim() || undefined,
      direccion:        this.formDireccion().trim() || undefined,
    };

    const payload = {
      tipoDocumento: datos.tipoDocumento as 'DNI' | 'RUC' | 'CE',
      numeroDocumento: datos.numeroDocumento!,
      nombres: datos.nombres!,
      apellidos: datos.apellidos,
      razonSocial: datos.razonSocial,
      telefono: datos.telefono,
      email: datos.email,
      direccion: datos.direccion,
    };

    if (this.modoModal() === 'crear') {
      this.clienteSvc.registrar(payload).subscribe({
        next: () => {
          this.toast.exito('Cliente registrado');
          this.cerrarModal();
        },
        error: (e) => this.toast.error(e.message ?? 'No se pudo registrar el cliente'),
      });
    } else {
      const id = this.idEditando();
      if (!id) return;
      this.clienteSvc.actualizar(id, payload).subscribe({
        next: (act) => {
          if (this.clienteSeleccionado()?.id === id) {
            this.clienteSeleccionado.update((s) => (s ? { ...s, ...act } as ClienteUI : s));
          }
          this.toast.exito('Cambios guardados');
          this.cerrarModal();
        },
        error: (e) => this.toast.error(e.message ?? 'No se pudo guardar'),
      });
    }
  }

  // ── Exportar CSV ──────────────────────────────────────────────────────
  exportarCSV(): void {
    const filas = this.clientesFiltrados();
    if (filas.length === 0) {
      this.toast.aviso('No hay clientes para exportar');
      return;
    }
    const cab = [
      'Tipo Doc', 'Documento', 'Nombres', 'Apellidos / Razón Social',
      'Teléfono', 'Email', 'Dirección', 'Puntos', 'Total Compras', 'Estado', 'Registro',
    ];
    const escapar = (v: string | number | undefined | null): string => {
      const s = String(v ?? '');
      // Si contiene coma, comilla o salto de línea, encerrar entre comillas
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lineas = filas.map(c => [
      c.tipoDocumento,
      c.numeroDocumento,
      c.nombres,
      c.tipoDocumento === 'RUC' ? (c.razonSocial ?? '') : (c.apellidos ?? ''),
      c.telefono ?? '',
      c.email ?? '',
      c.direccion ?? '',
      c.puntos ?? 0,
      c.totalCompras.toFixed(2),
      c.estado,
      c.fechaRegistro ?? '',
    ].map(escapar).join(','));
    const contenido = '﻿' + [cab.join(','), ...lineas].join('\n');
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const hoy  = new Date().toISOString().slice(0, 10);
    a.href     = url;
    a.download = `clientes_${hoy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.exito(`Exportados ${filas.length} clientes a CSV`);
  }

  // ── Helpers de plantilla ──────────────────────────────────────────────
  iniciales(c: ClienteUI): string {
    if (c.tipoDocumento === 'RUC') return 'E';
    return (c.nombres.charAt(0) + (c.apellidos?.charAt(0) ?? '')).toUpperCase();
  }

  colorAvatar(id: string): string {
    const colores = [
      'bg-primary-100 text-primary-600',
      'bg-emerald-100 text-emerald-600',
      'bg-violet-100 text-violet-600',
      'bg-orange-100 text-orange-600',
      'bg-rose-100 text-rose-600',
      'bg-teal-100 text-teal-600',
    ];
    // Hash simple del id para distribuir colores aunque el id no sea numérico
    let suma = 0;
    for (const ch of id) suma += ch.charCodeAt(0);
    return colores[suma % colores.length];
  }

  formatSol(n: number): string {
    return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  nombreCompleto(c: ClienteUI): string {
    if (c.tipoDocumento === 'RUC') return c.razonSocial ?? c.nombres;
    return `${c.nombres} ${c.apellidos ?? ''}`.trim();
  }
}
