# FarmaSys — Análisis de mejoras (plan de trabajo)

> Generado 2026-07-13. Consolidación de auditoría full-stack + UI/UX.
> Regla de oro: TODO aditivo, cero riesgo al flujo de venta. Marca azul intacta.

## A. POS / Ventas — correctness y confianza (hacer primero)

1. **Idempotencia en el cobro** — Backend ya soporta `idempotencyKey` (ventas.service.ts)
   pero el POS no la envía (`venta.service.ts registrarPOS`). Generar UUID al iniciar
   `procesarVenta()`, conservarlo hasta éxito, reenviar en reintentos.
   Evita: venta duplicada por red inestable (falla #1 de POS real).
2. **Boleta construida desde la respuesta del backend** — Hoy `VentaCompletada` usa
   totales/fecha del navegador y solo injerta `numeroComprobante` (pos.ts:535-595).
   Divergencias: IGV con productos EXONERADOS, precio cambiado en BD, hora del PC.
   Además `operador='A. SILVA'` y `terminal='CAJA-01'` hardcodeados (pos.ts:106) →
   usar `auth.usuario()` y `cajaAbierta().terminal`.
3. **Ticket 80mm completo** (comprobante.service.ts): imprimir vuelto + monto recibido,
   desglose de pago mixto (backend ya guarda pagos por método), referencia Yape.
4. **TICKET quema correlativos de BOLETA** — `siguienteComprobante()` solo distingue
   esFactura; TICKET usa serie B001. Serie propia o quitar TICKET del POS.
5. **Tope de descuento en el backend** — `maxDescuentoPct` por rol vive solo en UI
   (pos.ts:177). Backend acepta cualquier descuento ≤ total. Validar por rol + auditar.
6. **Error de stock con nombre de producto** — "Stock vendible insuficiente (disponible
   3, requerido 5)" no dice QUÉ producto. Agregar nombre en el mensaje del backend.
7. **Timeout + offline** — Sin timeout HTTP (cobro colgado = POS muerto), sin detección
   de offline. Timeout ~15s con reintento (misma idempotencyKey) + banner sin conexión.
8. **Catálogo liviano** — `cargarInventario()` trae todo el catálogo + stock + TODOS los
   lotes; recarga completa tras cada venta (pos.ts:607). Con catálogo real (3-5k
   productos) será lento. Endpoint `/pos/catalogo` (producto + presentaciones +
   stockVendible + vencimiento FEFO precalculados) + índices pg_trgm (comentados en
   schema.prisma). Refrescar solo stock de productos vendidos tras la venta.
9. **Ventas en espera** — `EstadoVenta.PENDIENTE` existe sin uso. Botón "en espera /
   recuperar" (cliente olvidó billetera). Muy pedido en mostrador.
10. **Higiene** — Borrar mock `registrar()` + `_correlativo` + `decrementarStock()`
    (venta.service.ts:102-143, producto.service.ts); `historial()` vacío; migrar
    `window:keypress` → `keydown` (scanners); tests de `pos-calculos.ts`.
11. **Categorías derivadas del catálogo** — `categoriasDisponibles()` ya existe;
    el POS usa 7 hardcodeadas (pos.ts:110). Conectar.

## B. Backend — seguridad y solidez (pendiente de auditoría previa)

1. Scoping por sucursal desde el JWT (ventas/reportes/caja): un VENDEDOR puede
   consultar/registrar en otras sucursales. `GET /ventas` y `/ventas/:id` sin @Roles.
2. `anular()` no registra QUIÉN anuló. Agregar userId del anulador (+ tabla AuditLog
   futura para precios/ajustes/descuentos).
3. Refresh token irrevocable 7 días (sin jti/blacklist). Redis ya está en compose.
4. Producción: `prisma migrate deploy` en vez de `db push --accept-data-loss` en el
   CMD del Dockerfile (riesgo de pérdida de datos silenciosa). Backups pg_dump diarios.
5. **Sobrepago silencioso**: registrar() valida `pagado >= total` pero permite exceso
   sin registrar vuelto; en métodos no-efectivo (tarjeta/Yape) un exceso descuadra el
   arqueo por método. Validar: no-efectivo debe sumar exacto; exceso solo en efectivo.
6. **Tests backend de flujos de dinero**: venta transaccional (stock insuficiente
   revierte todo), arqueo de caja, FEFO multi-lote, devolución con reingreso.
   Hoy hay ~10 specs; los flujos críticos de dinero necesitan cobertura real.
7. **Tokens JWT en localStorage** (front): un XSS roba sesión de 7 días. Mitigación
   aceptable a corto plazo (mismo patrón que muchos sistemas); ideal a futuro:
   refresh en cookie httpOnly. Anotado como deuda consciente, no bloqueante.

## C. Regulatorio (tras QA, antes de vender)

1. **SUNAT** (lunes con PSE): comprobante electrónico + nota de crédito ligada a
   devoluciones/anulaciones existentes.
2. **Controlados DIGEMID**: modelo RecetaVenta (médico, CMP, retenida), bloqueo en POS,
   libro de psicotrópicos = vista mensual sobre MovimientoStock (kardex ya per-lote).
3. Registro sanitario con fecha de vencimiento + alerta.
4. Cadena de frío (si cliente tiene refrigerados): flag + registro de temperatura.

## D. Wow de demo (front+back)

1. **Autocompletar DNI (RENIEC) y RUC (padrón SUNAT)** en alta de cliente del POS y
   proveedores de Compras. Endpoint proxy NestJS `/consultas/documento/:num` con token
   del proveedor de API en servidor + caché. Un solo proveedor sirve para todo.
2. Historial del cliente al identificarlo en POS ("qué llevó la vez pasada").
3. Resumen diario automático al dueño (correo/WhatsApp): ventas, arqueo, alertas.
4. Margen real por producto en Finanzas (costoPromedio ya existe).
5. **Kardex visible por producto**: pantalla "historia de este producto" (compró/
   vendió/ajustó, por lote) sobre MovimientoStock que ya registra todo.
   Herramienta anti-robo-hormiga que los dueños piden.
6. **Metas por sucursal**: `metaVentaMensual` existe en el schema sin uso —
   dashboard de avance vs meta.
7. **Alerta de productos sin rotación** (capital muerto): sin ventas en 60-90 días,
   junto a las alertas de vencimiento y stock bajo que ya existen en el dashboard.

## E. UI/UX (auditoría de diseño — marca azul intacta)

1. **Tipografía miniatura**: text-[9px]/[10px] con uppercase + tracking-wider saturan
   el POS. Ilegible para un QF de 45+ años en monitor 1366×768. Piso: 11px para meta,
   12-13px para datos. Quitar uppercase de micro-etiquetas (mantener en headers de
   sección).
2. **font-black en todo**: cuando todo grita, nada tiene jerarquía. Reservar black
   para el Total a pagar; labels → semibold, datos → bold.
3. **Contraste**: `text-secondary` (#6B7280) sobre `background-light` (#F3F4F6) ≈ 4.4:1
   (borderline); `text-secondary/40` en iconos/meta falla de lejos. Subir a /60 mínimo
   o usar slate-500 sólido.
4. **Dos azules distintos**: `hover:bg-blue-700`, `text-blue-600` (pos.html:229,416)
   conviven con primary #0055FF. Definir ramp primary-50..900 en tailwind.config y
   eliminar blue-* crudos. Mismo caso: colisión semántica violet (Yape + "De Marca")
   y orange (efectivo + warning) — un color, un significado.
5. **Targets táctiles**: steppers ± de 20px (size-5) y delete de 15px en carrito
   (pos.html:475-501). Muchas boticas usan monitor táctil. Mínimo 28px.
6. **Radios inconsistentes**: rounded-lg/xl/2xl mezclados sin regla. Escala: controles
   8px (lg), tarjetas 12px (xl), modales 16px (2xl). Quitar 2xl de KPI cards.
7. **Dashboard**: (a) sin skeletons — los números "saltan" de 0 al valor real con red
   lenta; copiar patrón del POS (pos.html:149). (b) KPI cards con border-l-4 de color
   (side-stripe) — reemplazar por icono con fondo tintado, patrón que ya usan las
   alertas. (c) "5 sucursales combinadas" HARDCODEADO (dashboard.html:112) — usar el
   count real. (d) hero super-admin con glassmorphism (bg-white/15 backdrop-blur) —
   simplificar a superficie sólida slate-700/white.
8. **Modales sin focus-trap**: Tab se escapa del modal al fondo. Riesgo de teclado
   en flujo receta/presentación. Trap + devolver foco al cerrar.
9. **Estados disabled sin motivo visible**: fila opacity-40 no dice por qué (origen
   del bug QA del "candado"). Siempre acompañar con texto ("Sin stock", "Vencido").
10. **darkMode: "class" muerto** en tailwind.config con background-dark definido y sin
    uso. Quitar (promesa muerta) o implementar de verdad.
11. **Inputs numéricos táctiles**: agregar inputmode="decimal" a montos (efectivo,
    mixto, descuento) para teclado numérico en táctil.

## F. Hallazgos de la captura del POS (revisión visual en vivo)

1. **Método de pago por defecto = EFECTIVO** (o recordar el último). Hoy es TARJETA;
   en botica peruana 70-80% es efectivo/Yape → cientos de clics extra al día.
2. **Navegación por teclado ↑↓ + Enter** en las filas de resultados (hoy solo F1
   enfoca el buscador; elegir producto exige mouse).
3. **Botón Cobrar deshabilitado debe explicar por qué**: "Agrega productos" /
   "Abre tu caja" en el propio botón.
4. **Fila de alternativas: mostrar ahorro** ("Genérico: ahorra S/. 0.20") en los
   grupos por principio activo.
5. **Reducir badge soup**: stock como número + punto de color (no pastilla rellena);
   pastilla solo para RECETA. Rojo reservado a vencimiento crítico + receta;
   stock bajo → ámbar.
6. **Precio en color neutro** (el azul parece link) y quitar "Desde" repetido;
   agregar fila de cabeceras de columna (Producto · Tipo · Stock · Precio).
7. **BUG: agrupación por principio activo es case-sensitive** — producto
   "paracetamol" (minúscula) queda fuera del grupo Paracetamol. Normalizar
   (trim + lowercase) al agrupar en producto.service/buscarAgrupado.
8. **Seed de demo digno**: 30-50 productos reales bien escritos, precios
   coherentes, sin "sss botica" ni "A. SILVA". El cliente juzga los datos
   tanto como el diseño.

## G. POS v1.1 — refinamientos post-QA (priorizar con feedback real)

1. Auto-imprimir tras cobrar (check en Configuración) — ahorra un clic por venta.
2. Reimprimir la última venta desde el propio POS (atajo).
3. Redondeo de vuelto a múltiplos de 0.10 — ⏸ EN PAUSA: consultar con el
   cliente su política de redondeo antes de implementar.
4. Impresión por iframe oculto (adiós popups bloqueados y document.write).
5. Refresco periódico ligero de stock (~60s) para multi-terminal simultáneo.
6. Búsqueda server-side paginada si el catálogo supera ~10k productos.
7. Modo contingencia offline (vender sin internet + sincronizar) — feature grande.
8. Descuento por línea además del total.
9. Tests E2E del flujo de venta (Playwright).
10. Modal de receta con captura de datos (médico/CMP/retenida) → va con DIGEMID.

## H. Visión experta — features de dominio botica (roadmap comercial)

Dinero de compras:
1. Importar factura electrónica XML del proveedor (UBL/SUNAT) → compra
   registrada en segundos sin tipeo. Diferenciador fuerte en Perú.
2. Cuentas por pagar: saldo por proveedor, vencimientos 30/60 días,
   calendario de pagos (las boticas compran a crédito).
3. Bonificaciones de laboratorio (12+1) en Compras → costo promedio real.
4. Orden de compra formal desde Reposición → recepción contra OC.

Dinero de inventario:
5. Liquidación por vencer: descuento controlado sugerido antes de que el
   lote muera en Mermas (recuperar 70% > perder 100%).
6. Generación e impresión de etiquetas de código de barras propias
   (fraccionados y productos sin EAN).

Canales:
7. Pedidos WhatsApp/delivery: pantalla "por atender" → convertir en venta.
8. Proformas/cotizaciones imprimibles → convertir en venta.

Dueño:
9. PWA instalable (dashboard en el celular) + resumen diario por WhatsApp
   (API WhatsApp Business).

Estrategia:
10. DECIDIR YA: instalación por cliente vs multi-tenant SaaS (empresaId).
    Cambiar después es cirugía mayor.

## Orden de ejecución sugerido

Fase 1 (hoy): A1 + A2 + A3 (cobro confiable + boleta real) → A4, A5, A6.
Fase 2: E1-E5 (legibilidad y consistencia visual del POS) + E7 dashboard.
Fase 3: A7, A8 (resiliencia y velocidad con datos reales) + B1-B3.
Fase 4: C (SUNAT + controlados) + D1 (DNI/RUC) + resto de D y E.
