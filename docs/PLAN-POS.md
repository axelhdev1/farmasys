# PLAN POS — Dejar el Punto de Venta listo y perfecto para el cliente

> Generado 2026-07-13. Consolida TODAS las observaciones del análisis
> (ANALISIS-MEJORAS.md secciones A, E, F). Reglas fijas:
> **cero riesgo al flujo de venta** (todo aditivo, venta actual intacta),
> **marca azul intacta** (afinar, no rediseñar), Angular no compila en el
> sandbox → verificación por transpile + QA en vivo del usuario por fase.

## Definición de "listo para el cliente"

1. Una venta NUNCA se duplica ni se pierde, aunque la red falle a mitad del cobro.
2. El ticket impreso coincide al 100% con lo registrado en BD (montos, IGV, hora,
   cajero real) e incluye vuelto y desglose de pago.
3. El cajero puede vender una jornada completa sin mouse y sin fricción
   (método por defecto correcto, teclado, mensajes claros).
4. Legible para un QF de 45+ años en monitor 1366×768 táctil.
5. Cero datos falsos visibles (A. SILVA, CAJA-01, "sss botica", precios absurdos).

---

## FASE 0 — Quick wins (30 min, solo front, riesgo nulo)

| # | Tarea | Archivo | Detalle |
|---|-------|---------|---------|
| 0.1 | Bug agrupación case-sensitive | producto.service.ts (buscarAgrupado) | Normalizar principioActivo con trim()+toLowerCase() como clave de grupo; mostrar la forma original capitalizada |
| 0.2 | Categorías dinámicas | pos.ts:110 | Reemplazar array hardcodeado por categoriasDisponibles() del servicio (+ 'Todos'); mapa de iconos por nombre con icono default |
| 0.3 | EFECTIVO como método por defecto | pos.ts:218 | `metodoPagoSeleccionado = signal('EFECTIVO')`; además recordar último método usado en la sesión (signal, no localStorage) |
| 0.4 | Cajero y terminal reales | pos.ts:106-107 | `operador` ← auth.usuario() (nombres+apellidos), `terminal` ← cajaAbierta()?.terminal ?? '—'. Quitar constantes |
| 0.5 | Botón Cobrar explicativo | pos.html (botón F12) | Deshabilitado con label contextual: sin caja → "Abre tu caja (F12)", carrito vacío → "Agrega productos", procesando → spinner "Procesando…" |

**QA F0:** producto "paracetamol" aparece dentro del grupo Paracetamol; categorías
reflejan el catálogo real; al abrir POS el método es Efectivo; badge muestra el
cajero logueado; botón explica su estado.

---

## FASE 1 — Cobro a prueba de balas (backend + front, el corazón del plan)

| # | Tarea | Archivos | Detalle |
|---|-------|----------|---------|
| 1.1 | Idempotencia end-to-end | pos.ts (procesarVenta), venta.service.ts (registrarPOS) | Generar `idempotencyKey` (crypto.randomUUID()) al INICIAR el cobro; guardarla en un signal hasta éxito; enviarla en el POST. En reintento se reusa → el backend devuelve la venta previa en vez de duplicar |
| 1.2 | Timeout + reintento | venta.service.ts | `timeout(15000)` de rxjs en registrarPOS. En error de timeout/red: toast con botón "Reintentar" que repite con la MISMA key. procesandoVenta nunca queda colgado |
| 1.3 | Detección offline | pos.ts / pos.html | Listener `online/offline` → banner rojo fijo "Sin conexión — no se puede cobrar" + deshabilitar Cobrar. Aditivo, no toca la venta |
| 1.4 | Error de stock con producto | backend inventario.service.ts (consumirFefo) | Incluir nombre del producto en el mensaje: "Stock insuficiente de Amoxicilina 500mg (disponible 3, requerido 5)". consumirFefo recibe/consulta nombre (ya carga el producto en registrar → pasar nombre como parámetro opcional) |
| 1.5 | Tope de descuento en servidor | backend ventas.service.ts (registrar) | Validar dto.descuento contra rol del JWT: VENDEDOR ≤10%, FARMACEUTICO ≤15%, ADMIN/SUPER sin tope (mismos valores que pos.ts:177). Si excede → BadRequest con mensaje claro |
| 1.6 | Registrar quién descuenta/anula | backend ventas.service.ts | Venta ya guarda cajeroId (ok). `anular()`: agregar `anuladaPorId` (campo nuevo aditivo en schema) con el userId del JWT |

**QA F1 (simulable):** cobrar con red cortada a mitad (DevTools offline) → reintentar
→ UNA sola venta en BD. Descuento 50% como VENDEDOR vía Swagger → 400. Anular →
anuladaPorId poblado. Carrito con 2 productos y uno sin stock → el error nombra
el producto correcto.

---

## FASE 2 — El ticket perfecto (la boleta ES el producto ante el cliente)

| # | Tarea | Archivos | Detalle |
|---|-------|----------|---------|
| 2.1 | Boleta desde la respuesta del backend | pos.ts (procesarVenta.next), pos.model.ts | Construir VentaCompletada desde `resp` (VentaBackend): números (subtotal, igv, descuento, total, fecha) del servidor. Los datos de UI (nombres de producto/presentación) se cruzan por productoId con el carrito. La hora impresa = fecha del servidor |
| 2.2 | Vuelto y recibido en el ticket | comprobante.service.ts, pos.ts | ComprobanteImprimible += `recibido?`, `vuelto?`. Solo efectivo simple: pasar montoRecibido() y vuelto(). Render bajo el TOTAL: "Recibido S/. 50.00 / Vuelto S/. 12.50" |
| 2.3 | Desglose de pago mixto + referencia Yape | comprobante.service.ts | ComprobanteImprimible += `pagos?: {label, monto, referencia?}[]`. Si hay >1 pago, render línea por método en vez de "Mixto". Referencia Yape impresa si existe |
| 2.4 | Correlativo de TICKET propio | backend schema.prisma + ventas.service.ts (siguienteComprobante) | Campos aditivos Sucursal: `serieTicket "T001"`, `siguienteTicket 1`. switch por tipo en vez de esFactura. TICKET deja de quemar números de BOLETA (correlativos legales) |
| 2.5 | Reimpresión coherente | features/ventas (historial) | Verificar que la reimpresión use el MISMO generarDesde con los mismos campos nuevos (vuelto no aplica en reimpresión → opcionales) |

**QA F2:** venta en efectivo → ticket muestra recibido/vuelto; venta mixta → desglose
por método; venta TICKET → número T001-000001 y la siguiente BOLETA no salta;
comparar ticket impreso vs GET /ventas/:id → idénticos.

---

## FASE 3 — Pulido visual del POS (afinación, no rediseño; azul intacto)

| # | Tarea | Detalle |
|---|-------|---------|
| 3.1 | Rampa primary en tailwind.config | Definir primary {50..900} derivada de #0055FF; buscar/reemplazar `blue-600/700/50` crudos por tokens primary-*. Un solo azul en toda la app |
| 3.2 | Tipografía: piso 11px | Barrido de pos.html: text-[9px]→text-[11px], text-[10px]→text-[11px] en metadatos; quitar `uppercase tracking-wider` de micro-etiquetas (solo headers de sección lo conservan) |
| 3.3 | Jerarquía de peso | font-black SOLO en Total a pagar y nombre de producto; labels→font-semibold, montos→font-bold |
| 3.4 | Contraste | text-secondary/40 → /70 mínimo; placeholder legible; verificar text-secondary sobre background-light |
| 3.5 | Badge soup | Stock: número + punto de color (verde/ámbar/rojo) sin pastilla rellena. Pastilla solo RECETA (rojo) y GENÉRICO/MARCA (outline sutil). Rojo reservado: vencimiento ≤30d y receta; stock bajo → ámbar |
| 3.6 | Columna precio | Quitar "Desde" por fila; fila de cabeceras (Producto · Tipo · Stock · Precio) sticky en cada sección; precio text-text-main font-bold (no azul-link) |
| 3.7 | Ahorro genérico | En grupos con alternativas: badge "Ahorra S/. X" en el genérico más barato vs el de marca del grupo |
| 3.8 | Targets táctiles | Steppers ± y eliminar del carrito: size-5 → size-7 (28px); área de fila clickeable ≥40px de alto |
| 3.9 | Estados con motivo | Fila disabled: además de opacity, texto del porqué ("Sin stock" / "Vencido") visible en la fila |
| 3.10 | Focus trap en modales | Receta, presentación, nuevo cliente, vaciar: atrapar Tab dentro del modal y devolver foco al cerrar (directiva compartida reutilizable) |
| 3.11 | inputmode="decimal" | Efectivo recibido, mixto (3 inputs), descuento → teclado numérico en táctil |
| 3.12 | Radios consistentes | Controles rounded-lg, tarjetas/paneles rounded-xl, modales rounded-2xl. Quitar mezclas |

**QA F3:** captura lado a lado antes/después; legible a 1366×768 y 125% zoom;
probar Tab en cada modal; tocar steppers con dedo en táctil (si hay).

---

## FASE 4 — Velocidad y flujo pro (con datos reales)

| # | Tarea | Archivos | Detalle |
|---|-------|----------|---------|
| 4.1 | Endpoint /pos/catalogo liviano | backend productos o inventario controller/service | Producto + presentaciones + stockVendible + vencimiento del lote FEFO + unidadesVencidas PRECALCULADOS en SQL (groupBy/raw). No enviar todos los lotes al front |
| 4.2 | Índices pg_trgm | migración SQL manual | CREATE EXTENSION pg_trgm + índices GIN en Producto.nombre y principioActivo (ya comentados en schema.prisma) |
| 4.3 | Refresh parcial post-venta | pos.ts:607, producto.service.ts | Tras vender: actualizar solo stock de los productoIds vendidos (respuesta de venta o GET puntual). Adiós recarga completa del catálogo |
| 4.4 | Navegación por teclado ↑↓ Enter | pos.ts, pos.html | Signal `filaActiva`; ↑↓ mueven resaltado sobre filas visibles, Enter agrega (o abre selector), Esc limpia. F1→escribe→↓↓→Enter→F12: venta completa sin mouse |
| 4.5 | Ventas en espera | pos.ts + pos.html (aditivo, local) | 3 ranuras "En espera": guardar carrito+cliente en signal, chip para recuperar. Sin backend (no persiste tras F5 — suficiente para mostrador) |
| 4.6 | Higiene de código | venta.service.ts, producto.service.ts, pos.ts | Borrar registrar() mock + _correlativo + generarNumero + decrementarStock + historial() vacío; window:keypress → keydown; specs de pos-calculos.ts (calcularTotales: vacío, descuento>total, redondeo) |

**QA F4:** con seed de 3000 productos: apertura del POS <2s, búsqueda fluida,
venta no recarga todo; venta completa solo con teclado; poner en espera →
recuperar → cobrar.

---

## FASE 5 — Puesta en operación real (el cliente vende con SUS datos)

| # | Tarea | Detalle |
|---|-------|---------|
| 5.1 | Importador de catálogo | Endpoint + pantalla (o script asistido) para cargar el catálogo REAL del cliente desde Excel/CSV: producto, principio activo, categoría, laboratorio, presentaciones con factores y precios, código de barras. Validación fila por fila con reporte de errores (sin esto, alguien tipea 3000 productos a mano) |
| 5.2 | Carga de inventario inicial | Stock y lotes reales de apertura vía el módulo de Inventario Físico ya existente (contar por lote → cerrar ajusta). Documentar el procedimiento de apertura de tienda |
| 5.3 | Barrido anti-mock | Grep de 'A. SILVA', 'CAJA-01', 'sss', HTML muerto de inventario (~350 líneas), mocks restantes. Nada falso en un sistema en producción |
| 5.4 | Producción segura (de ANALISIS-MEJORAS B) | `prisma migrate deploy` en vez de `db push --accept-data-loss` (con datos reales del cliente esto es OBLIGATORIO, no opcional); backup pg_dump diario automatizado + restore probado; HTTPS/Caddy; scoping por sucursal desde JWT; revocación de refresh tokens |
| 5.5 | Capacitación mínima | Guía de 1 página por rol (cajero / QF / dueño): abrir caja, vender, receta, cierre Z, qué hacer si se va internet |

---

## Orden de ejecución y dependencias

```
F0 (30min) → F1 (cobro) → F2 (ticket) → F3 (visual) → F4 (velocidad/flujo) → F5 (demo)
                └─ 1.1 es prerequisito de 1.2 (reintento usa la key)
                └─ 2.1 es prerequisito de 2.2/2.3 (ticket lee resp del backend)
                └─ 4.2 es prerequisito real de 4.1 con catálogo grande
```

Cada fase termina con su QA en vivo ANTES de empezar la siguiente (Angular no
compila en sandbox). Cambios de schema (1.6, 2.4) son aditivos → seguros con el
flujo docker actual, pero recordar: en producción migrar a `prisma migrate deploy`.

## Después de este plan (ya en ANALISIS-MEJORAS.md)

SUNAT/PSE (lunes) y controlados DIGEMID (RecetaVenta + libro de psicotrópicos):
son los dos requisitos LEGALES para operar formalmente — van inmediatamente
después de F5, antes de que el cliente emita comprobantes reales.
Luego: autocompletar DNI/RUC (RENIEC/padrón), skeletons del dashboard,
resumen diario al dueño, margen por producto.
