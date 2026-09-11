import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ComprasService } from '../../core/services/compras.service';
import { SucursalService } from '../../core/services/sucursal.service';
import {
  CompraBackend,
  CompraDetalle,
  CompraItemInput,
  CrearPresentacion,
  ProductoBackend,
  ProveedorBackend,
  SucursalBackend,
} from '../../core/models/compra.model';
import { FORMAS_FARMACEUTICAS } from '../../core/models/formas';

/**
 * Categorías de arranque de una botica peruana. Solo son el punto de partida
 * del selector: las que el usuario cree se suman solas.
 */
const CATEGORIAS_BASE = [
  'Analgésicos', 'Antibióticos', 'Antiinflamatorios', 'Antialérgicos',
  'Antigripales', 'Antiácidos', 'Gastrointestinales', 'Respiratorios',
  'Cardiovasculares', 'Antidiabéticos', 'Dermatológicos', 'Oftálmicos',
  'Ginecológicos', 'Pediátricos', 'Vitaminas y suplementos',
  'Material de curación', 'Higiene y cuidado personal',
];

type Vista = 'medicamentos' | 'proveedores' | 'ingreso' | 'historial';

/**
 * Módulo Compras / Medicamentos. Conecta DIRECTO al backend. Permite:
 *  1. Dar de alta medicamentos (catálogo) con sus presentaciones.
 *  2. Registrar proveedores.
 *  3. Ingresar mercadería (compra) que crea lotes y suma stock.
 */
@Component({
  selector: 'app-compras',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="p-6 max-w-6xl mx-auto">
      <!-- Encabezado -->
      <header class="flex items-center gap-3 mb-6">
        <div class="size-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <span class="material-symbols-outlined icon-fill">medication</span>
        </div>
        <div>
          <h1 class="text-xl font-bold text-text-main leading-tight text-balance">Compras y Medicamentos</h1>
          <p class="text-sm text-text-secondary text-pretty">
            Da de alta medicamentos, registra proveedores e ingresa stock por compra.
          </p>
        </div>
      </header>

      <!-- Pestañas (segmented) -->
      <div class="inline-flex p-1 bg-background-light rounded-xl mb-6 gap-1">
        @for (t of tabs; track t.id) {
          <button type="button" (click)="vista.set(t.id)"
            class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            [class]="vista() === t.id
              ? 'bg-surface text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-main'">
            <span class="material-symbols-outlined text-[18px]">{{ t.icon }}</span>
            {{ t.label }}
          </button>
        }
      </div>

      <!-- ════════════════ MEDICAMENTOS ════════════════ -->
      @if (vista() === 'medicamentos') {
        <div class="grid lg:grid-cols-2 gap-6">
          <!-- Form crear -->
          <section class="bg-surface border border-border-color rounded-2xl shadow-sm p-6">
            <h2 class="font-bold text-text-main mb-4 flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-[20px]">add_circle</span>
              Nuevo medicamento
            </h2>

            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-xs font-medium text-text-secondary">Código *</span>
                  <input [(ngModel)]="prod.codigo" [ngModelOptions]="{standalone:true}"
                    class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                    placeholder="PARA500">
                </label>
                <label class="block">
                  <span class="text-xs font-medium text-text-secondary">Categoría *</span>
                  <!-- Lista CERRADA: escribiendo a mano acababan conviviendo
                       "Analgésicos", "analgesicos" y "Analgesico" como tres
                       categorías distintas. Para no encerrar al usuario, la
                       última opción abre un campo para crear una nueva. -->
                  <select [ngModel]="catSeleccion()" (ngModelChange)="elegirCategoria($event)"
                    [ngModelOptions]="{standalone:true}"
                    class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition">
                    <option value="">— Selecciona una categoría —</option>
                    @for (c of categoriasExistentes(); track c) {
                      <option [value]="c">{{ c }}</option>
                    }
                    <option value="__nueva__">➕ Crear categoría nueva…</option>
                  </select>
                  @if (catSeleccion() === '__nueva__') {
                    <input [(ngModel)]="prod.categoria" [ngModelOptions]="{standalone:true}"
                      autocomplete="off"
                      class="mt-2 w-full rounded-lg border border-primary/40 bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                      placeholder="Nombre de la categoría nueva">
                  }
                </label>
              </div>

              <label class="block">
                <span class="text-xs font-medium text-text-secondary">Nombre *</span>
                <input [(ngModel)]="prod.nombre" [ngModelOptions]="{standalone:true}"
                  class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                  placeholder="Paracetamol 500mg">
              </label>

              <div class="grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-xs font-medium text-text-secondary">Principio activo</span>
                  <input [(ngModel)]="prod.principioActivo" [ngModelOptions]="{standalone:true}"
                    class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                    placeholder="Paracetamol">
                </label>
                <label class="block">
                  <span class="text-xs font-medium text-text-secondary">Laboratorio</span>
                  <input [(ngModel)]="prod.laboratorio" [ngModelOptions]="{standalone:true}"
                    class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                    placeholder="Genfar">
                </label>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-xs font-medium text-text-secondary">Concentración</span>
                  <input [(ngModel)]="prod.concentracion" [ngModelOptions]="{standalone:true}"
                    class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                    placeholder="500mg">
                </label>
                <label class="block">
                  <span class="text-xs font-medium text-text-secondary">Forma farmacéutica</span>
                  <!-- Distingue "Cetirizina 10mg tableta" de "Cetirizina jarabe":
                       sin esto se confundían en el buscador del mostrador. -->
                  <select [(ngModel)]="prod.formaFarmaceutica" [ngModelOptions]="{standalone:true}"
                    class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition">
                    <option value="">— Sin especificar —</option>
                    @for (f of formasFarmaceuticas; track f.valor) {
                      <option [value]="f.valor">{{ f.label }}</option>
                    }
                  </select>
                </label>
                <label class="block">
                  <span class="text-xs font-medium text-text-secondary">Unidad base</span>
                  <input [(ngModel)]="prod.unidadBase" [ngModelOptions]="{standalone:true}"
                    class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                    placeholder="tableta">
                </label>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-xs font-medium text-text-secondary">Registro sanitario</span>
                  <input [(ngModel)]="prod.registroSanitario" [ngModelOptions]="{standalone:true}"
                    class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                    placeholder="EN-12345">
                </label>
                <label class="block">
                  <span class="text-xs font-medium text-text-secondary">IGV</span>
                  <select [(ngModel)]="prod.afectacionIgv" [ngModelOptions]="{standalone:true}"
                    class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition">
                    <option value="GRAVADO">Gravado (18%)</option>
                    <option value="EXONERADO">Exonerado</option>
                    <option value="INAFECTO">Inafecto</option>
                  </select>
                </label>
              </div>

              <div class="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                <label class="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                  <input type="checkbox" [(ngModel)]="prod.requiereReceta" [ngModelOptions]="{standalone:true}"
                    class="rounded border-border-color text-primary focus:ring-primary/30">
                  Requiere receta
                </label>
                <label class="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                  <input type="checkbox" [(ngModel)]="prod.controlado" [ngModelOptions]="{standalone:true}"
                    class="rounded border-border-color text-primary focus:ring-primary/30">
                  Controlado
                </label>
                <label class="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                  <input type="checkbox" [(ngModel)]="prod.esGenerico" [ngModelOptions]="{standalone:true}"
                    class="rounded border-border-color text-primary focus:ring-primary/30">
                  Genérico
                </label>
              </div>

              <!-- Stock mínimo: sin un valor > 0 las alertas de stock bajo
                   NUNCA se disparan. Antes no existía este campo. -->
              <label class="block">
                <span class="text-xs font-medium text-text-secondary">Stock mínimo (alerta)</span>
                <input type="number" min="0" [(ngModel)]="prod.stockMinimo" [ngModelOptions]="{standalone:true}"
                  class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm tabular-nums text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                  placeholder="10">
                <span class="text-[11px] text-text-secondary">
                  Avisa cuando queden estas unidades o menos. Vacío o 0 = usa el mínimo general de Configuración.
                </span>
              </label>

              <!-- Presentaciones -->
              <div class="border-t border-border-color pt-3">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-semibold text-text-secondary uppercase tracking-wide">Presentaciones *</span>
                  <button type="button" (click)="agregarPresentacion()"
                    class="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                    <span class="material-symbols-outlined text-[16px]">add</span> agregar
                  </button>
                </div>
                <p class="text-[11px] text-text-secondary mb-2">
                  Formas en que vendes el producto. <b>Contiene</b> = cuántas unidades mínimas trae
                  (una caja de 100 tabletas contiene 100; la tableta suelta, 1).
                </p>

                <div class="grid grid-cols-12 gap-2 px-1 mb-1 text-[11px] font-semibold text-text-secondary">
                  <span class="col-span-4">Nombre</span>
                  <span class="col-span-2">Contiene</span>
                  <span class="col-span-2">Precio S/</span>
                  <span class="col-span-3">Cód. barras</span>
                  <span class="col-span-1 text-center" title="Unidad mínima">Base</span>
                </div>

                @for (pr of presentaciones(); track $index) {
                  <div class="grid grid-cols-12 gap-2 mb-2 items-center">
                    <input [(ngModel)]="pr.nombre" [ngModelOptions]="{standalone:true}"
                      class="col-span-4 rounded-lg border border-border-color bg-surface px-2 py-1.5 text-sm placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition" placeholder="Caja x 100">
                    <input type="number" min="1" [(ngModel)]="pr.factor" [ngModelOptions]="{standalone:true}"
                      class="col-span-2 rounded-lg border border-border-color bg-surface px-2 py-1.5 text-sm tabular-nums placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition" placeholder="100">
                    <input type="number" min="0.01" step="0.01" [(ngModel)]="pr.precioVenta" [ngModelOptions]="{standalone:true}"
                      class="col-span-2 rounded-lg border border-border-color bg-surface px-2 py-1.5 text-sm tabular-nums placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition" placeholder="0.00">
                    <!-- Sin código de barras el escáner del mostrador no
                         encuentra el producto. El backend siempre lo soportó. -->
                    <input [(ngModel)]="pr.codigoBarras" [ngModelOptions]="{standalone:true}"
                      class="col-span-3 rounded-lg border border-border-color bg-surface px-2 py-1.5 text-sm tabular-nums placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition" placeholder="7501234567890">
                    <div class="col-span-1 flex items-center justify-center gap-1">
                      <label class="cursor-pointer" title="Marca la unidad mínima (la que se vende suelta)">
                        <input type="radio" name="esBase" [checked]="pr.esBase" (change)="marcarBase($index)"
                          class="text-primary focus:ring-primary/30">
                      </label>
                      @if (presentaciones().length > 1) {
                        <button type="button" (click)="quitarPresentacion($index)"
                          class="text-text-secondary hover:text-accent-red-ink flex" title="Quitar">
                          <span class="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>

              <button type="button" (click)="guardarMedicamento()" [disabled]="guardando()"
                class="w-full bg-primary text-white rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2">
                <span class="material-symbols-outlined text-[18px]">save</span>
                {{ guardando() ? 'Guardando…' : 'Guardar medicamento' }}
              </button>
            </div>
          </section>

          <!-- Lista -->
          <section class="bg-surface border border-border-color rounded-2xl shadow-sm p-6">
            <div class="flex items-center justify-between mb-3">
              <h2 class="font-bold text-text-main">Catálogo
                <span class="ml-1 text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{{ productos().length }}</span>
              </h2>
              <button type="button" (click)="cargarProductos()"
                class="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                <span class="material-symbols-outlined text-[16px]">refresh</span> recargar
              </button>
            </div>
            <div class="relative mb-3">
              <span class="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary text-[18px]">search</span>
              <input [(ngModel)]="filtroTexto" [ngModelOptions]="{standalone:true}"
                (ngModelChange)="filtro.set(filtroTexto)"
                class="w-full rounded-lg border border-border-color bg-surface pl-9 pr-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                placeholder="Buscar por nombre, código o principio activo…">
            </div>
            <div class="space-y-2 max-h-[26rem] overflow-auto pr-1">
              @for (p of productosFiltrados(); track p.id) {
                <div class="border border-border-color rounded-xl px-3 py-2.5 hover:bg-background-light transition">
                  <div class="flex justify-between items-start gap-2">
                    <span class="text-sm font-semibold text-text-main truncate">{{ p.nombre }}</span>
                    <span class="text-[10px] font-mono text-text-secondary bg-background-light px-1.5 py-0.5 rounded shrink-0">{{ p.codigo }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-2 mt-0.5">
                    <span class="text-xs text-text-secondary truncate">
                      {{ p.categoria }}@if (p.principioActivo) { · {{ p.principioActivo }} } · {{ p.presentaciones.length }} present.
                    </span>
                    <span class="text-xs font-semibold text-text-main tabular-nums shrink-0">
                      desde S/ {{ precioDesde(p).toFixed(2) }}
                    </span>
                  </div>
                  @if (p.requiereReceta || p.controlado) {
                    <div class="mt-1 flex gap-1">
                      @if (p.requiereReceta) {
                        <span class="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Receta</span>
                      }
                      @if (p.controlado) {
                        <span class="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full">Controlado</span>
                      }
                    </div>
                  }
                </div>
              } @empty {
                <div class="text-center py-10 text-text-secondary">
                  <span class="material-symbols-outlined text-4xl opacity-40">pill</span>
                  <p class="text-sm mt-2 text-pretty">
                    @if (filtro()) { Sin resultados para "{{ filtro() }}". } @else { Aún no hay medicamentos. Crea el primero en el panel de la izquierda. }
                  </p>
                </div>
              }
            </div>
          </section>
        </div>
      }

      <!-- ════════════════ PROVEEDORES ════════════════ -->
      @if (vista() === 'proveedores') {
        <div class="grid lg:grid-cols-2 gap-6">
          <section class="bg-surface border border-border-color rounded-2xl shadow-sm p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="font-bold text-text-main flex items-center gap-2">
                <span class="material-symbols-outlined text-primary text-[20px]">local_shipping</span>
                {{ provEditando() ? 'Editar proveedor' : 'Nuevo proveedor' }}
              </h2>
              @if (provEditando()) {
                <button type="button" (click)="cancelarEdicionProveedor()"
                  class="text-xs font-semibold text-text-secondary hover:text-text-main">
                  Cancelar edición
                </button>
              }
            </div>
            <div class="space-y-3">
              <label class="block">
                <span class="text-xs font-medium text-text-secondary">RUC * (11 dígitos)</span>
                <input [(ngModel)]="prov.ruc" [ngModelOptions]="{standalone:true}" inputmode="numeric" maxlength="11"
                  class="mt-1 w-full rounded-lg border bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:ring-2 outline-none transition"
                  [class]="rucInvalido() ? 'border-accent-red focus:border-accent-red focus:ring-accent-red/20' : 'border-border-color focus:border-primary focus:ring-primary/20'"
                  placeholder="20123456789">
                @if (rucInvalido()) {
                  <span class="text-[11px] text-accent-red-ink mt-1 block">Debe tener 11 dígitos y empezar con 10, 15, 17 o 20 (ej. 20123456789).</span>
                } @else {
                  <span class="text-[11px] text-text-secondary/70 mt-1 block">Empresa suele empezar con 20; persona con 10.</span>
                }
              </label>
              <label class="block">
                <span class="text-xs font-medium text-text-secondary">Razón social *</span>
                <input [(ngModel)]="prov.razonSocial" [ngModelOptions]="{standalone:true}"
                  class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition" placeholder="Distribuidora Farma S.A.C.">
              </label>
              <div class="grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-xs font-medium text-text-secondary">Teléfono</span>
                  <input [(ngModel)]="prov.telefono" [ngModelOptions]="{standalone:true}"
                    class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition">
                </label>
                <label class="block">
                  <span class="text-xs font-medium text-text-secondary">Email</span>
                  <input [(ngModel)]="prov.email" [ngModelOptions]="{standalone:true}"
                    class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition">
                </label>
              </div>
              <button type="button" (click)="guardarProveedor()" [disabled]="guardando()"
                class="w-full bg-primary text-white rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2">
                <span class="material-symbols-outlined text-[18px]">save</span>
                {{ guardando() ? 'Guardando…' : (provEditando() ? 'Guardar cambios' : 'Guardar proveedor') }}
              </button>
            </div>
          </section>

          <section class="bg-surface border border-border-color rounded-2xl shadow-sm p-6">
            <h2 class="font-bold text-text-main mb-3">Proveedores
              <span class="ml-1 text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{{ proveedores().length }}</span>
            </h2>
            @if (proveedores().length > 4) {
              <input [ngModel]="busquedaProv()" [ngModelOptions]="{standalone:true}"
                (ngModelChange)="busquedaProv.set($event)"
                placeholder="Buscar por razón social o RUC…"
                class="mb-3 w-full rounded-lg border border-border-color bg-background-light px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition">
            }
            <div class="space-y-2 max-h-[28rem] overflow-auto pr-1">
              @for (p of proveedoresFiltrados(); track p.id) {
                <div class="border rounded-xl px-3 py-2.5 transition flex items-center gap-2"
                     [class]="provEditando()?.id === p.id
                       ? 'border-primary bg-primary/5'
                       : 'border-border-color hover:bg-background-light'">
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold text-text-main truncate">{{ p.razonSocial }}</div>
                    <div class="text-xs text-text-secondary flex items-center gap-3">
                      <span class="tabular-nums">RUC {{ p.ruc }}</span>
                      @if (p.telefono) { <span class="flex items-center gap-0.5"><span class="material-symbols-outlined text-[13px]">call</span>{{ p.telefono }}</span> }
                    </div>
                  </div>
                  <!-- Antes solo se podía CREAR: un RUC mal tecleado quedaba así. -->
                  <button type="button" (click)="editarProveedor(p)"
                    class="shrink-0 text-text-secondary hover:text-primary transition" title="Editar proveedor">
                    <span class="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                </div>
              } @empty {
                <div class="text-center py-10 text-text-secondary">
                  <span class="material-symbols-outlined text-4xl opacity-40">local_shipping</span>
                  <p class="text-sm mt-2">{{ busquedaProv() ? 'Sin coincidencias.' : 'Sin proveedores registrados.' }}</p>
                </div>
              }
            </div>
          </section>
        </div>
      }

      <!-- ════════════════ INGRESO (COMPRA) ════════════════ -->
      @if (vista() === 'ingreso') {
        <section class="bg-surface border border-border-color rounded-2xl shadow-sm p-6 max-w-3xl">
          <h2 class="font-bold text-text-main mb-4 flex items-center gap-2">
            <span class="material-symbols-outlined text-emerald-600 text-[20px]">inventory</span>
            Ingreso de mercadería (compra)
          </h2>

          <div class="grid grid-cols-2 gap-3 mb-3">
            <label class="block">
              <span class="text-xs font-medium text-text-secondary">Sucursal *</span>
              <select [(ngModel)]="compraSucursalId" [ngModelOptions]="{standalone:true}"
                class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition">
                @for (s of sucursales(); track s.id) {
                  <option [value]="s.id">{{ s.nombre }}</option>
                }
              </select>
            </label>
            <label class="block">
              <span class="text-xs font-medium text-text-secondary">Proveedor *</span>
              <select [(ngModel)]="compraProveedorId" [ngModelOptions]="{standalone:true}"
                class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition">
                <option value="">— elige —</option>
                @for (p of proveedores(); track p.id) {
                  <option [value]="p.id">{{ p.razonSocial }}</option>
                }
              </select>
            </label>
          </div>

          <label class="block mb-4">
            <span class="text-xs font-medium text-text-secondary">N.º de comprobante (factura del proveedor) *</span>
            <input [(ngModel)]="compraNumeroDoc" [ngModelOptions]="{standalone:true}"
              class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition" placeholder="F001-0004521">
          </label>

          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-text-secondary uppercase tracking-wide">Productos ingresados</span>
            <button type="button" (click)="agregarItem()"
              class="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px]">add</span> agregar ítem
            </button>
          </div>

          <div class="grid grid-cols-12 gap-2 px-1 mb-1 text-[11px] font-semibold text-text-secondary">
            <span class="col-span-3">Medicamento</span>
            <span class="col-span-2">Lote</span>
            <span class="col-span-2">Vence</span>
            <span class="col-span-1">Cant</span>
            <!-- Explícito: el proveedor factura sin IGV, pero la factura física
                 muestra el total CON IGV. Sin esta claridad se cargan precios mezclados. -->
            <span class="col-span-2">Precio unit. SIN IGV</span>
            <span class="col-span-1 text-right">Total c/IGV</span>
            <span class="col-span-1"></span>
          </div>

          @for (it of items(); track $index) {
            <div class="grid grid-cols-12 gap-2 mb-2 items-center">
              <select [(ngModel)]="it.productoId" [ngModelOptions]="{standalone:true}"
                class="col-span-3 rounded-lg border border-border-color bg-surface px-2 py-1.5 text-sm tabular-nums placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition">
                <option value="">—</option>
                @for (p of productos(); track p.id) {
                  <option [value]="p.id">{{ p.nombre }}</option>
                }
              </select>
              <input [(ngModel)]="it.lote" [ngModelOptions]="{standalone:true}"
                class="col-span-2 rounded-lg border border-border-color bg-surface px-2 py-1.5 text-sm tabular-nums placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition" placeholder="L-001">
              <input type="date" [(ngModel)]="it.vencimiento" [ngModelOptions]="{standalone:true}"
                class="col-span-2 rounded-lg border border-border-color bg-surface px-2 py-1.5 text-sm tabular-nums placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition">
              <input type="number" min="1" [(ngModel)]="it.cantidadBase" [ngModelOptions]="{standalone:true}"
                class="col-span-1 rounded-lg border border-border-color bg-surface px-2 py-1.5 text-sm tabular-nums placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition" placeholder="0">
              <input type="number" min="0.01" step="0.01" [(ngModel)]="it.precioCompra" [ngModelOptions]="{standalone:true}"
                class="col-span-2 rounded-lg border border-border-color bg-surface px-2 py-1.5 text-sm tabular-nums placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition" placeholder="0.00">
              <span class="col-span-1 text-right text-sm font-semibold text-text-main tabular-nums">
                {{ totalLineaConIgv(it).toFixed(2) }}
              </span>
              <button type="button" (click)="quitarItem($index)"
                class="col-span-1 text-text-secondary hover:text-accent-red-ink flex justify-center">
                <span class="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          } @empty {
            <p class="text-sm text-text-secondary mb-2">Agrega al menos un producto.</p>
          }

          <!-- Resumen del ingreso -->
          <div class="mt-4 rounded-xl bg-background-light border border-border-color p-4 space-y-1.5">
            <div class="flex justify-between text-sm text-text-secondary">
              <span>Subtotal</span>
              <span class="tabular-nums">S/ {{ resumenIngreso().subtotal.toFixed(2) }}</span>
            </div>
            <div class="flex justify-between text-sm text-text-secondary">
              <span>IGV (18%)</span>
              <span class="tabular-nums">S/ {{ resumenIngreso().igv.toFixed(2) }}</span>
            </div>
            <div class="flex justify-between text-base font-bold text-text-main pt-1.5 border-t border-border-color">
              <span>Total</span>
              <span class="tabular-nums text-primary">S/ {{ resumenIngreso().total.toFixed(2) }}</span>
            </div>
          </div>

          <button type="button" (click)="registrarCompra()" [disabled]="guardando()"
            class="mt-4 w-full bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-[18px]">check_circle</span>
            {{ guardando() ? 'Registrando…' : 'Registrar ingreso' }}
          </button>
          <p class="text-[11px] text-text-secondary mt-2">
            Cantidad en unidad base (p.ej. tabletas). El ingreso crea el lote, suma el stock y registra el costo.
          </p>
        </section>
      }

      <!-- ══ HISTORIAL DE COMPRAS ═══════════════════════════════════════════
           Antes no existía: se registraba una compra y desaparecía. No había
           forma de cotejar contra la factura física ni de corregir un error de
           tipeo — que además contamina el costo promedio para siempre. -->
      @if (vista() === 'historial') {
        <section class="bg-surface rounded-xl border border-border-color shadow-soft overflow-hidden">
          <div class="px-5 py-4 border-b border-border-color flex items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-bold text-text-main">Compras registradas</h3>
              <p class="text-[11px] text-text-secondary mt-0.5">Últimas 100 · para cotejar con la factura del proveedor</p>
            </div>
            <button type="button" (click)="cargarCompras()"
              class="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px]">refresh</span> actualizar
            </button>
          </div>

          <div class="divide-y divide-border-color">
            @for (c of compras(); track c.id) {
              <div class="px-5 py-3">
                <div class="flex items-start gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <p class="text-sm font-bold text-text-main">{{ c.numeroDocumento }}</p>
                      @if (c.estado === 'ANULADA') {
                        <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-accent-red-ink">Anulada</span>
                      }
                    </div>
                    <p class="text-xs text-text-secondary mt-0.5 truncate">
                      {{ c.proveedor?.razonSocial ?? 'Proveedor' }} · {{ fechaCorta(c.fecha) }}
                    </p>
                    @if (c.estado === 'ANULADA' && c.motivoAnulacion) {
                      <p class="text-[11px] text-accent-red-ink mt-1">Motivo: {{ c.motivoAnulacion }}</p>
                    }
                  </div>
                  <div class="text-right shrink-0">
                    <p class="text-sm font-black text-text-main tabular-nums"
                       [class.line-through]="c.estado === 'ANULADA'"
                       [class.text-text-secondary]="c.estado === 'ANULADA'">
                      S/ {{ c.total }}
                    </p>
                    <div class="flex items-center gap-2 justify-end mt-1">
                      <button type="button" (click)="verDetalle(c)"
                        class="text-[11px] font-semibold text-primary hover:underline">Ver detalle</button>
                      @if (c.estado !== 'ANULADA' && esAdmin()) {
                        <button type="button" (click)="pedirAnular(c)"
                          class="text-[11px] font-semibold text-accent-red-ink hover:underline">Anular</button>
                      }
                    </div>
                  </div>
                </div>

                <!-- Detalle desplegado -->
                @if (detalle()?.id === c.id) {
                  <div class="mt-3 rounded-lg bg-background-light p-3">
                    @if (cargandoDetalle()) {
                      <p class="text-xs text-text-secondary">Cargando detalle…</p>
                    } @else {
                      <div class="grid grid-cols-12 gap-2 text-[11px] font-semibold text-text-secondary mb-1">
                        <span class="col-span-5">Producto</span>
                        <span class="col-span-2">Lote</span>
                        <span class="col-span-2">Vence</span>
                        <span class="col-span-1 text-right">Cant.</span>
                        <span class="col-span-2 text-right">Costo</span>
                      </div>
                      @for (it of detalle()!.items; track it.id) {
                        <div class="grid grid-cols-12 gap-2 text-xs py-1 border-t border-border-color">
                          <span class="col-span-5 truncate text-text-main">{{ nombreProducto(it.productoId) }}</span>
                          <span class="col-span-2 truncate text-text-secondary">{{ it.lote }}</span>
                          <span class="col-span-2 text-text-secondary tabular-nums">{{ fechaCorta(it.vencimiento) }}</span>
                          <span class="col-span-1 text-right tabular-nums text-text-main">{{ it.cantidadBase }}</span>
                          <span class="col-span-2 text-right tabular-nums text-text-main">S/ {{ it.precioCompra }}</span>
                        </div>
                      }
                      <div class="flex justify-end gap-4 text-xs mt-2 pt-2 border-t border-border-color">
                        <span class="text-text-secondary">IGV <b class="text-text-main tabular-nums">S/ {{ detalle()!.igv }}</b></span>
                        <span class="text-text-secondary">Total <b class="text-text-main tabular-nums">S/ {{ detalle()!.total }}</b></span>
                      </div>
                    }
                  </div>
                }
              </div>
            } @empty {
              <div class="flex flex-col items-center justify-center py-12 text-center">
                <div class="size-11 rounded-xl bg-background-light text-text-secondary flex items-center justify-center mb-3">
                  <span class="material-symbols-outlined text-[22px]">receipt_long</span>
                </div>
                <p class="text-sm font-semibold text-text-main">Sin compras registradas</p>
                <p class="text-xs text-text-secondary mt-1">Los ingresos de mercadería aparecerán aquí.</p>
              </div>
            }
          </div>
        </section>

        <!-- Confirmación de anulación -->
        @if (compraAnular(); as ca) {
          <div class="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
               (click)="cancelarAnular()">
            <div class="bg-surface rounded-xl shadow-xl border border-border-color w-full max-w-md p-5"
                 (click)="$event.stopPropagation()">
              <h3 class="text-base font-bold text-text-main">Anular compra {{ ca.numeroDocumento }}</h3>
              <p class="text-xs text-text-secondary mt-1">
                Se revierte el stock, el lote y el costo promedio. Solo es posible si nada de
                esa mercadería se vendió todavía.
              </p>
              <label class="block mt-4">
                <span class="text-xs font-medium text-text-secondary">Motivo (mínimo 10 caracteres) *</span>
                <textarea [(ngModel)]="motivoAnulacion" [ngModelOptions]="{standalone:true}" rows="3"
                  class="mt-1 w-full rounded-lg border border-border-color bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-secondary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                  placeholder="Ej.: cantidades equivocadas en la factura"></textarea>
              </label>
              <div class="flex justify-end gap-2 mt-4">
                <button type="button" (click)="cancelarAnular()"
                  class="px-4 py-2 rounded-lg text-sm font-semibold text-text-secondary hover:bg-background-light transition">
                  Cancelar
                </button>
                <button type="button" (click)="confirmarAnular()"
                  [disabled]="motivoAnulacion.trim().length < 10 || anulando()"
                  class="px-4 py-2 rounded-lg text-sm font-bold text-white bg-accent-red hover:opacity-90 disabled:opacity-50 transition">
                  {{ anulando() ? 'Anulando…' : 'Anular compra' }}
                </button>
              </div>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class ComprasComponent implements OnInit {
  private readonly comprasSvc = inject(ComprasService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly sucursalSvc = inject(SucursalService);

  protected readonly tabs: { id: Vista; label: string; icon: string }[] = [
    { id: 'medicamentos', label: 'Medicamentos', icon: 'medication' },
    { id: 'proveedores', label: 'Proveedores', icon: 'local_shipping' },
    { id: 'ingreso', label: 'Ingreso', icon: 'inventory' },
    { id: 'historial', label: 'Historial', icon: 'receipt_long' },
  ];

  protected readonly vista = signal<Vista>('medicamentos');

  // ── Historial de compras ─────────────────────────────────────────────────
  protected readonly compras = signal<CompraBackend[]>([]);
  protected readonly detalle = signal<CompraDetalle | null>(null);
  protected readonly cargandoDetalle = signal(false);
  protected readonly compraAnular = signal<CompraBackend | null>(null);
  protected motivoAnulacion = '';
  protected readonly anulando = signal(false);

  /** Solo administración puede anular (revierte stock y costo). */
  protected readonly esAdmin = computed(() =>
    this.auth.tieneAlgunRol('SUPER_ADMIN', 'ADMIN'),
  );

  protected cargarCompras(): void {
    // Sucursal ACTIVA (la del selector del header), no la del token: si no, el
    // dueño cambiaba de botica y seguía viendo las compras de la anterior.
    const sid = this.sucursalSvc.sucursalActivaId() ?? this.auth.usuario()?.sucursalActualId;
    this.comprasSvc.listarCompras(sid).subscribe({
      next: (rows) => this.compras.set(rows),
      error: (e) => this.toast.error('No se pudo cargar el historial: ' + (e.error?.message ?? e.message)),
    });
  }

  /** Abre/cierra el detalle de una compra (toggle). */
  protected verDetalle(c: CompraBackend): void {
    if (this.detalle()?.id === c.id) {
      this.detalle.set(null);
      return;
    }
    this.cargandoDetalle.set(true);
    // Se muestra el encabezado al instante y las líneas cuando lleguen.
    this.detalle.set({ ...c, items: [] } as CompraDetalle);
    this.comprasSvc.obtenerCompra(c.id).subscribe({
      next: (d) => { this.detalle.set(d); this.cargandoDetalle.set(false); },
      error: (e) => {
        this.cargandoDetalle.set(false);
        this.detalle.set(null);
        this.toast.error('No se pudo abrir el detalle: ' + (e.error?.message ?? e.message));
      },
    });
  }

  protected pedirAnular(c: CompraBackend): void {
    this.compraAnular.set(c);
    this.motivoAnulacion = '';
  }

  protected cancelarAnular(): void {
    this.compraAnular.set(null);
    this.motivoAnulacion = '';
  }

  protected confirmarAnular(): void {
    const c = this.compraAnular();
    if (!c || this.motivoAnulacion.trim().length < 10) return;
    this.anulando.set(true);
    this.comprasSvc.anularCompra(c.id, this.motivoAnulacion.trim()).subscribe({
      next: () => {
        this.anulando.set(false);
        this.toast.exito('Compra anulada: stock y costo revertidos');
        this.cancelarAnular();
        this.cargarCompras();
        this.cargarProductos();
      },
      error: (e) => {
        this.anulando.set(false);
        // El backend rechaza si ya se vendió parte de esa mercadería.
        this.toast.error(e.error?.message ?? e.message ?? 'No se pudo anular');
      },
    });
  }

  /** Nombre del producto para el detalle (las líneas traen solo el id). */
  protected nombreProducto(id: string): string {
    return this.productos().find((p) => p.id === id)?.nombre ?? id;
  }

  protected fechaCorta(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    });
  }
  protected readonly guardando = signal(false);

  protected readonly productos = signal<ProductoBackend[]>([]);
  protected readonly proveedores = signal<ProveedorBackend[]>([]);
  protected busquedaProv = signal('');
  protected readonly proveedoresFiltrados = computed(() => {
    const q = this.busquedaProv().toLowerCase().trim();
    if (!q) return this.proveedores();
    return this.proveedores().filter(
      (p) => p.razonSocial.toLowerCase().includes(q) || p.ruc.includes(q),
    );
  });
  protected readonly sucursales = signal<SucursalBackend[]>([]);

  /** Opciones del selector de forma farmacéutica. */
  protected readonly formasFarmaceuticas = FORMAS_FARMACEUTICAS;

  /**
   * Categorías del selector: las de arranque de una botica peruana MÁS las que
   * ya existan en el catálogo. La lista base evita que la primera alta se
   * encuentre un desplegable vacío.
   */
  protected readonly categoriasExistentes = computed(() => {
    const set = new Set<string>(CATEGORIAS_BASE);
    for (const p of this.productos()) {
      const c = p.categoria?.trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  });

  /** Valor del <select> de categoría ('__nueva__' abre el campo de texto). */
  protected readonly catSeleccion = signal<string>('');

  /** Traduce la elección del selector al campo real del producto. */
  protected elegirCategoria(valor: string): void {
    this.catSeleccion.set(valor);
    // "Crear nueva" limpia el campo para que el usuario escriba; cualquier
    // otra opción se copia tal cual (así no hay variantes con typos).
    this.prod.categoria = valor === '__nueva__' ? '' : valor;
  }

  // ── Formularios (objetos planos para ngModel) ──────────────────────────
  protected prod = this.nuevoProd();
  // El precio arranca VACÍO (null), no en 0. Antes el valor por defecto era 0
  // y nada obligaba a cambiarlo: el producto nacía sin precio y se podía
  // despachar gratis. Ahora el campo se ve vacío y el guardado lo exige.
  protected readonly presentaciones = signal<CrearPresentacion[]>([
    { nombre: 'Unidad', factor: 1, precioVenta: null as unknown as number, esBase: true },
  ]);

  protected prov = { ruc: '', razonSocial: '', telefono: '', email: '' };
  /** Proveedor en edición (null = el formulario crea uno nuevo). */
  protected readonly provEditando = signal<ProveedorBackend | null>(null);

  protected compraSucursalId = '';
  protected compraProveedorId = '';
  protected compraNumeroDoc = '';
  protected readonly items = signal<CompraItemInput[]>([this.nuevoItem()]);

  // Buscador del catálogo (filtra la lista en vivo).
  protected filtroTexto = '';
  protected readonly filtro = signal('');
  protected readonly productosFiltrados = computed(() => {
    const q = this.filtro().toLowerCase().trim();
    const lista = this.productos();
    if (!q) return lista;
    return lista.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.codigo.toLowerCase().includes(q) ||
        (p.principioActivo?.toLowerCase().includes(q) ?? false),
    );
  });

  /**
   * Total de la línea CON IGV, para cuadrar contra la factura física del
   * proveedor (que viene con IGV incluido).
   * NOTA: asume 18% para todo, igual que el resumen del documento. El backend
   * aplica IGV solo a productos GRAVADOS, así que si compras exonerados el
   * total guardado será menor que el mostrado aquí.
   */
  protected totalLineaConIgv(it: { cantidadBase: number | string; precioCompra: number | string }): number {
    const cant = Number(it.cantidadBase) || 0;
    const costo = Number(it.precioCompra) || 0;
    return cant * costo * 1.18;
  }

  // Resumen del ingreso (subtotal, IGV 18% e total) calculado en vivo.
  protected readonly resumenIngreso = computed(() => {
    let subtotal = 0;
    for (const it of this.items()) {
      const cant = Number(it.cantidadBase) || 0;
      const costo = Number(it.precioCompra) || 0;
      subtotal += cant * costo;
    }
    const igv = subtotal * 0.18;
    return { subtotal, igv, total: subtotal + igv };
  });

  /** Precio de la presentación base (o el menor) de un producto, como número. */
  protected precioDesde(p: ProductoBackend): number {
    if (!p.presentaciones.length) return 0;
    const base = p.presentaciones.find((x) => x.esBase) ?? p.presentaciones[0];
    return Number(base.precioVenta);
  }

  ngOnInit(): void {
    this.cargarProductos();
    this.cargarProveedores();
    this.cargarSucursales();
    this.cargarCompras();
  }

  // ── Cargas ────────────────────────────────────────────────────────────
  cargarProductos(): void {
    this.comprasSvc.listarProductos().subscribe({
      next: (pag) => this.productos.set(pag.items),
      error: (e) => this.toast.error('No se pudo cargar el catálogo: ' + e.message),
    });
  }

  cargarProveedores(): void {
    this.comprasSvc.listarProveedores().subscribe({
      next: (lista) => this.proveedores.set(lista),
      error: (e) => this.toast.error('No se pudieron cargar los proveedores: ' + e.message),
    });
  }

  cargarSucursales(): void {
    this.comprasSvc.listarSucursales().subscribe({
      next: (lista) => {
        this.sucursales.set(lista);
        // Preselecciona la sucursal activa del header (el usuario puede
        // cambiarla en el formulario si necesita ingresar a otra botica).
        const activa = this.sucursalSvc.sucursalActivaId() ?? this.auth.usuario()?.sucursalActualId;
        this.compraSucursalId = activa ?? lista[0]?.id ?? '';
      },
      error: (e) => this.toast.error('No se pudieron cargar las sucursales: ' + e.message),
    });
  }

  // ── Presentaciones (form medicamento) ──────────────────────────────────
  agregarPresentacion(): void {
    this.presentaciones.update((l) => [
      ...l,
      { nombre: '', factor: 1, precioVenta: null as unknown as number, esBase: false },
    ]);
  }
  quitarPresentacion(i: number): void {
    this.presentaciones.update((l) => (l.length > 1 ? l.filter((_, idx) => idx !== i) : l));
  }
  marcarBase(i: number): void {
    this.presentaciones.update((l) => l.map((p, idx) => ({ ...p, esBase: idx === i })));
  }

  // ── Guardar medicamento ─────────────────────────────────────────────────
  guardarMedicamento(): void {
    if (!this.prod.codigo.trim() || !this.prod.nombre.trim() || !this.prod.categoria.trim()) {
      this.toast.error('Código, nombre y categoría son obligatorios');
      return;
    }
    const presentaciones = this.presentaciones().map((p) => ({
      nombre: p.nombre.trim(),
      factor: Number(p.factor),
      precioVenta: Number(p.precioVenta),
      esBase: !!p.esBase,
      // Sin código de barras el escáner no encuentra el producto en el POS.
      codigoBarras: p.codigoBarras?.trim() || undefined,
    }));
    // El precio debe ser > 0: a S/ 0 el producto se despacha gratis (el cobro
    // da total 0 y el pago "alcanza"). El importador masivo ya lo exigía.
    const sinPrecio = presentaciones.find((p) => !(p.precioVenta > 0));
    if (sinPrecio) {
      this.toast.error(
        `La presentación "${sinPrecio.nombre || 'sin nombre'}" necesita un precio de venta mayor a 0`,
      );
      return;
    }
    if (presentaciones.some((p) => !p.nombre || p.factor < 1)) {
      this.toast.error('Revisa las presentaciones (nombre y factor ≥ 1)');
      return;
    }
    this.guardando.set(true);
    this.comprasSvc
      .crearProducto({
        codigo: this.prod.codigo.trim(),
        nombre: this.prod.nombre.trim(),
        categoria: this.prod.categoria.trim(),
        principioActivo: this.prod.principioActivo?.trim() || undefined,
        concentracion: this.prod.concentracion?.trim() || undefined,
        formaFarmaceutica: this.prod.formaFarmaceutica || undefined,
        stockMinimo: Number(this.prod.stockMinimo) > 0 ? Number(this.prod.stockMinimo) : undefined,
        laboratorio: this.prod.laboratorio?.trim() || undefined,
        registroSanitario: this.prod.registroSanitario?.trim() || undefined,
        unidadBase: this.prod.unidadBase?.trim() || 'unidad',
        afectacionIgv: this.prod.afectacionIgv,
        requiereReceta: this.prod.requiereReceta,
        controlado: this.prod.controlado,
        esGenerico: this.prod.esGenerico,
        presentaciones,
      })
      .subscribe({
        next: () => {
          this.toast.exito('Medicamento creado');
          this.prod = this.nuevoProd();
          this.catSeleccion.set('');
          this.presentaciones.set([
            { nombre: 'Unidad', factor: 1, precioVenta: null as unknown as number, esBase: true },
          ]);
          this.cargarProductos();
        },
        error: (e) => this.toast.error('No se pudo crear: ' + e.message),
        complete: () => this.guardando.set(false),
      });
  }

  // ── Guardar proveedor ────────────────────────────────────────────────────
  /** RUC peruano válido: 11 dígitos con prefijo 10/15/17/20 (igual que el backend). */
  rucInvalido(): boolean {
    const r = (this.prov.ruc ?? '').trim();
    return r.length > 0 && !/^(10|15|17|20)\d{9}$/.test(r);
  }

  /** Carga un proveedor en el formulario para corregirlo. */
  editarProveedor(p: ProveedorBackend): void {
    this.provEditando.set(p);
    this.prov = {
      ruc: p.ruc,
      razonSocial: p.razonSocial,
      telefono: p.telefono ?? '',
      email: p.email ?? '',
    };
  }

  cancelarEdicionProveedor(): void {
    this.provEditando.set(null);
    this.prov = { ruc: '', razonSocial: '', telefono: '', email: '' };
  }

  guardarProveedor(): void {
    if (!/^(10|15|17|20)\d{9}$/.test(this.prov.ruc.trim())) {
      this.toast.error('RUC inválido: 11 dígitos que empiecen con 10, 15, 17 o 20 (ej. 20123456789)');
      return;
    }
    if (!this.prov.razonSocial.trim()) {
      this.toast.error('La razón social es obligatoria');
      return;
    }

    const datos = {
      ruc: this.prov.ruc.trim(),
      razonSocial: this.prov.razonSocial.trim(),
      telefono: this.prov.telefono?.trim() || undefined,
      email: this.prov.email?.trim() || undefined,
    };

    // Editando: se corrige el existente. Antes solo se podía crear, así que un
    // RUC mal tecleado quedaba para siempre y obligaba a crear un duplicado.
    const enEdicion = this.provEditando();
    if (enEdicion) {
      this.guardando.set(true);
      this.comprasSvc.actualizarProveedor(enEdicion.id, datos).subscribe({
        next: () => {
          this.toast.exito('Proveedor actualizado');
          this.cancelarEdicionProveedor();
          this.cargarProveedores();
        },
        error: (e) => this.toast.error('No se pudo actualizar: ' + (e.error?.message ?? e.message)),
        complete: () => this.guardando.set(false),
      });
      return;
    }

    this.guardando.set(true);
    this.comprasSvc
      .crearProveedor(datos)
      .subscribe({
        next: () => {
          this.toast.exito('Proveedor creado');
          this.prov = { ruc: '', razonSocial: '', telefono: '', email: '' };
          this.cargarProveedores();
        },
        error: (e) => this.toast.error('No se pudo crear: ' + e.message),
        complete: () => this.guardando.set(false),
      });
  }

  // ── Ítems de compra ──────────────────────────────────────────────────────
  agregarItem(): void {
    this.items.update((l) => [...l, this.nuevoItem()]);
  }
  quitarItem(i: number): void {
    this.items.update((l) => l.filter((_, idx) => idx !== i));
  }

  registrarCompra(): void {
    if (!this.compraSucursalId || !this.compraProveedorId || !this.compraNumeroDoc.trim()) {
      this.toast.error('Sucursal, proveedor y N.º de comprobante son obligatorios');
      return;
    }
    const items = this.items()
      .filter((it) => it.productoId)
      .map((it) => ({
        productoId: it.productoId,
        lote: it.lote.trim(),
        vencimiento: it.vencimiento,
        cantidadBase: Number(it.cantidadBase),
        precioCompra: Number(it.precioCompra),
      }));
    if (items.length === 0) {
      this.toast.error('Agrega al menos un producto al ingreso');
      return;
    }
    if (items.some((it) => !it.lote || !it.vencimiento || it.cantidadBase < 1 || it.precioCompra <= 0)) {
      this.toast.error('Revisa los ítems: lote, vencimiento, cantidad ≥ 1 y costo mayor a 0');
      return;
    }
    // El backend rechaza mercadería que llega vencida; avisamos antes de enviar.
    const hoy = new Date().toISOString().slice(0, 10);
    const vencido = items.find((it) => it.vencimiento <= hoy);
    if (vencido) {
      this.toast.error(`El lote ${vencido.lote} llegaría vencido (${vencido.vencimiento})`);
      return;
    }
    this.guardando.set(true);
    this.comprasSvc
      .registrarCompra({
        proveedorId: this.compraProveedorId,
        sucursalId: this.compraSucursalId,
        numeroDocumento: this.compraNumeroDoc.trim(),
        items,
      })
      .subscribe({
        next: () => {
          this.toast.exito('Ingreso registrado: stock actualizado');
          this.compraNumeroDoc = '';
          this.items.set([this.nuevoItem()]);
          // Para que aparezca de inmediato en el historial.
          this.cargarCompras();
        },
        error: (e) => this.toast.error('No se pudo registrar el ingreso: ' + e.message),
        complete: () => this.guardando.set(false),
      });
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  private nuevoProd() {
    return {
      codigo: '',
      nombre: '',
      categoria: '',
      principioActivo: '',
      concentracion: '',
      formaFarmaceutica: '',
      laboratorio: '',
      registroSanitario: '',
      unidadBase: 'unidad',
      // Vacío = hereda el mínimo general de Configuración al crear el stock.
      stockMinimo: null as number | null,
      afectacionIgv: 'GRAVADO' as 'GRAVADO' | 'EXONERADO' | 'INAFECTO',
      requiereReceta: false,
      controlado: false,
      esGenerico: false,
    };
  }
  private nuevoItem(): CompraItemInput {
    return { productoId: '', lote: '', vencimiento: '', cantidadBase: 0, precioCompra: 0 };
  }
}
