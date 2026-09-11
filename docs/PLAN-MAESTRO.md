# FarmaSys — Plan maestro

Todo lo que falta para que las **5 boticas** operen con este sistema, ordenado
por riesgo real. Reúne los hallazgos de las auditorías de código y los
pendientes acumulados de todas las sesiones.

Regla de siempre: **cero riesgos al flujo de venta, todo aditivo.**

Estado a la fecha: el sistema funciona, corre en Docker (5 servicios) y está
listo para demo. Lo que sigue es lo que falta para **operar de verdad**.

---

## FASE 0 — Bloqueantes legales y de datos

Sin esto no se puede operar, por más que el software funcione.

### 0.1 · Facturación electrónica SUNAT 🔴 OBLIGATORIO POR LEY
`backend/src/sunat/pse-stub.provider.ts` genera un XML falso y responde
"Aceptado (stub)". Hoy el sistema imprime comprobantes que SUNAT no reconoce.
Operar así es infracción tributaria en cada venta.

Lo que la **botica** debe tener (no lo puedes hacer tú): RUC habido y activo,
habilitación como emisor electrónico, y **certificado digital tributario**
(SUNAT lo facilita gratis hasta el 31/12/2027).

Lo que hay que **construir**: generar XML UBL 2.1, firmarlo, enviarlo, guardar
el CDR. Boletas van por **resumen diario** (mismo día, máximo 7 días); facturas
dentro de 3 días calendario.

Decisión pendiente: **API directa de SUNAT** (sin costo mensual, mucho más
trabajo y riesgo) vs **PSE/OSE** tipo Nubefact/APISUNAT (API REST simple, ellos
firman y envían, exonera homologación, pero cuesta). Para una botica que vende
sobre todo boletas, el PSE suele ser lo pragmático.

El backend ya está preparado: el proveedor se inyecta por token, solo hay que
implementar el real.

### 0.2 · Carga del catálogo real
Productos, stock inicial y usuarios de las 5 boticas. Es lo más subestimado:
alguien tiene que preparar y revisar esa data. Existe el módulo Importar.

### 0.3 · Respaldo fuera del servidor
Hoy los `.dump` viven en el mismo disco que la base. Salva de un borrado
accidental, **no** de que se dañe o roben el equipo. Falta sincronizar
`backend/backups/` a la nube o a un disco externo. Media hora de trabajo.

---

## FASE 1 — Integridad del dato (auditoría de código)

Hallazgos verificados en el código. Ordenados por daño económico.

### 1.1 · Stock mínimo en cero: la alerta nunca suena 🔴
**El más caro del día a día.** Cadena verificada:

- `StockSucursal.stockMinimo` nace en **0**.
- El alta de producto no lo define (no existe el campo en el formulario).
- La compra crea la fila de stock **sin mínimo** (`compras.service.ts:225-230`).
- Las dos consultas de alerta exigen `stockMinimo > 0`
  (`reportes.service.ts:52`, `inventario.service.ts:110`).

Resultado: **ningún producto dispara alerta de stock bajo, nunca.** La tarjeta
"Stock crítico" marcará 0 siempre y la botica se entera de que se quedó sin algo
cuando el cliente lo pide. Inutiliza además el módulo de Reposición (mismo filtro).

Remate: existe `Configuracion.stockMinimoDefault` — se **guarda** en Ajustes y
**nadie lo lee** en todo el backend.

**Arreglo:** aplicar ese default al crear la fila de stock + campo de mínimo en
el alta del producto + acción masiva para fijarlo por categoría.

### 1.2 · Compras sin historial ni anulación ✅ RESUELTO
Los tres endpoints (`GET /compras`, `GET /compras/:id`,
`PATCH /compras/:id/anular`) ya tienen pantalla: pestaña **Historial** en
Compras, con detalle desplegable por compra y anulación con motivo obligatorio
(solo ADMIN). Un error de tipeo ya se puede revertir en vez de contaminar el
costo promedio para siempre.

### 1.3 · Productos duplicados 🟠
Solo `codigo` es único; `nombre` no. Nada impide crear "Cetirizina 10mg" dos
veces con códigos distintos. Con 5 boticas y varias personas cargando catálogo
es cuestión de tiempo.

Daño silencioso: el stock queda **partido entre dos fichas**, una muestra "sin
stock" mientras la otra tiene 40, y los reportes de rotación mienten sobre ambas.

**Arreglo:** al crear, avisar si ya existe un producto con nombre y concentración
muy parecidos (no bloquear: confirmar).

### 1.3-bis · El costo no viajaba en las transferencias ✅ RESUELTO 🔴
La transferencia entre boticas movía la mercadería **pero no el costo**: el
destino recibía el producto con `costoPromedio` nulo (o con el suyo viejo, sin
recalcular). Efecto en cadena:

- esas unidades se vendían con costo 0 → **Finanzas mostraba 100% de margen**
  en esa botica, que es falso;
- el **valor del inventario del destino salía S/ 0** aunque tuviera mercadería.

Ahora el costo viaja y se recalcula como promedio ponderado en destino, igual
que en una compra. El origen conserva su costo medio (sacar al costo medio no
altera el costo medio de lo que queda).

### 1.4 · Carrera al descontar stock 🟠
`inventario.service.ts:405-445` (`consumirFefo`) **lee** los lotes, calcula si
alcanza, y **después** descuenta. Entre lectura y escritura no hay bloqueo de
fila. Dos cajeros vendiendo la última unidad del mismo producto en el mismo
instante pueden pasar ambos la validación → se vende de más y el stock queda
negativo, en silencio.

Con 5 boticas y varios terminales deja de ser hipotético. Y **el schema no tiene
ni un `CHECK` constraint**: toda la integridad depende del código.

**Arreglo:** `CHECK (cantidadBase >= 0)` en la base como red de seguridad
(barato) + bloqueo de fila en la transacción (correcto).

### 1.5 · Borrar una presentación borra historia de ventas 🟠
`eliminarPresentacion()` solo verifica que quede una presentación. **No comprueba
si tiene ventas.** La relación `VentaItem → Presentacion` es opcional sin
`onDelete`, así que Prisma usa `SetNull`: al borrar, las ventas históricas
**pierden el vínculo sin avisar** — se conserva precio y cantidad, pero ya no se
sabe si se vendió caja, blíster o unidad.

Hoy el frontend no expone ese botón (solo se alcanza por API), pero está armado
y esperando.

### 1.6 · Higiene 🟡
- ✅ **Proveedores editables** — ya se pueden corregir (RUC, teléfono, email).
  Ojo: dar de BAJA un proveedor existe en el servicio del backend pero **no
  tiene ruta en el controller**; si hace falta, hay que exponerla primero.
- ✅ **Servicio muerto** `core/services/inventario.service.ts` vaciado con una
  nota. Falta **borrar el archivo** desde el Explorador (el sandbox no puede).
- **Endpoints sin usar**: `stock-global/:productoId` (ver un producto en las 5
  boticas a la vez — muy útil antes de una transferencia), `proximos-vencer`,
  `alertas-stock`.
- **Código de barras**: no se puede asignar al crear el producto. El backend lo
  soporta, el formulario no lo envía. Con escáner en el mostrador, ese producto
  no se encuentra al escanearlo.
- ✅ **El campo "factor"** ahora se llama "Contiene" y explica qué poner.
- ✅ **Ajuste de stock**: rechazaba mal — permitía ingresar lotes YA VENCIDOS
  (Compras sí lo bloqueaba; el ajuste era la puerta trasera) y creaba la fila de
  stock sin mínimo. Corregido también en Transferencias.
- ✅ **Campos fantasma en la edición de Inventario**: "Presentación" y "Precio
  compra" se podían escribir y se **descartaban en silencio** al guardar.
  Ahora la presentación se guarda de verdad y el costo es solo lectura (lo
  calculan las compras; editarlo a mano falsearía el margen).
- ✅ **Inventario ignoraba el selector de sucursal** 🔴 — usaba la sucursal del
  TOKEN en vez de la ACTIVA. El dueño cambiaba a "Norte" en el header, entraba a
  Inventario y veía —y **ajustaba stock de**— Central sin enterarse. Afectaba
  cargar, ver movimientos, ajustar y guardar. Mismo fallo en el historial de
  compras. Corregido y ahora recarga solo al cambiar de botica.
- **N+1**: `kpisPorSucursal` hace ~3 consultas por sucursal en bucle secuencial
  (~20 con 5 boticas) y el dashboard lo repite por polling.

---

## FASE 2 — Seguridad y control (ver PLAN-LOGIN.md)

### 2.1 · Auditoría de accesos 🟠
**No existe ningún registro de quién entró y cuándo.** El único rastro es
`Usuario.ultimoAccesoEn`, que se sobrescribe en cada login. Si falta plata en un
arqueo, no se puede investigar nada. Todo el modelo de caja se construyó para que
"no haya movimiento raro", pero el acceso en sí no deja huella.

### 2.2 · Bloqueo por inactividad 🟠
El refresh dura 7 días. Si el cajero se aleja del mostrador, cualquiera vende
bajo su nombre y el descuadre cae sobre él. Es el hueco que deja abierto todo el
control de caja. Va con PIN de desbloqueo (teclear la clave 20 veces al día es
inviable en mostrador).

### 2.3 · Bloqueo por intentos por CUENTA, no por IP 🟡
Hoy el throttler limita por IP: un cajero que se equivoca bloquea el terminal
para todos, y un atacante que rote IPs prueba claves sin límite real.

### 2.4 · Menores 🟡
`NODE_ENV=production` como primer paso del checklist de despliegue (el fail-fast
de secretos existe pero solo se arma en producción) · quitar las cifras
inventadas del panel del login ("5 Sucursales · 12k+ SKUs · 24/7").

---

## FASE 3 — Operación diaria

- **Reporte de cierre Z imprimible** — el cajero necesita entregar un papel con
  su arqueo al cerrar turno. Se usa todos los días.
- **Motivo obligatorio en descuadres grandes** — el umbral ya es configurable.
- **Capacitación** — un sistema que nadie sabe usar no sirve. Existe
  `CAPACITACION.md`.

---

## FASE 4 — Infraestructura para las 5 boticas

- **Servidor**: VPS 4 GB / 2 vCPU, NVMe. Recomendado **Vultr o DigitalOcean en
  São Paulo** (~50 ms a Lima, ~US$24/mes). Hetzner es más barato (~€5) pero está
  en EE.UU. (~130 ms).
- **Dominio + HTTPS.**
- **Rotación de logs de Docker** (hoy crecen sin límite) + afinar retención de
  respaldos (14 días en disco + copia a la nube).
- **Contingencia de internet** 🟠 — con servidor central, si una botica pierde
  conexión **no puede vender**: no hay modo offline. Mínimo, plan de datos 4G de
  respaldo por local. El modo offline real es un desarrollo grande, pero con 5
  sedes conviene tenerlo en el radar.

---

## FASE 5 — Valor comercial (sin urgencia)

Puntos de fidelización de clientes · descuentos por línea en el POS · vista de
stock global por producto.

---

## Orden recomendado

1. **1.1 (stock mínimo)** — mejor relación impacto/esfuerzo de toda la lista.
2. **1.2 (historial y anulación de compras)** — el backend ya está; solo falta pantalla.
3. **0.1 (SUNAT)** — el más grande; decidir vía antes de escribir código.
4. **1.3 + 1.4 + 1.5** — integridad del dato antes de que entren 5 boticas.
5. **2.1 + 2.2** — auditoría e inactividad.
6. **Fase 4** — servidor, cuando lo anterior esté cerrado.

---

## Ya resuelto (para no repetir)

Flujo de login auditado y corregido · jerarquía y permisos por usuario · Mi
Perfil y cambio obligatorio de clave inicial · caja seria (terminales, relevo de
turno, arqueo, cajas olvidadas) · compras con factura única y anulación en
backend · finanzas con ingreso real sin IGV, mermas, IGV estimado, punto de
equilibrio, rentabilidad por categoría y días de inventario · dashboard sin datos
inventados y con estados vacíos · bug de zona horaria que borraba las ventas del
día después de las 7 pm · forma farmacéutica, categoría como lista cerrada y
precio de venta obligatorio (un producto a S/ 0 se despachaba gratis).
