# FarmaSys — Ideas / Pendientes

> ## 📌 NOTA DE ORGANIZACIÓN (ago-2026) — leer primero
>
> **La documentación se movió a `docs/`.** En la raíz quedan solo tres archivos,
> a propósito, porque el repositorio se publicó en GitHub como portafolio y una
> raíz con 18 archivos `.md` se ve desordenada:
>
> | En la raíz | Por qué se queda ahí |
> |---|---|
> | `README.md` | La portada del repositorio |
> | `LICENSE` | Todos los derechos reservados. GitHub lo detecta solo |
> | `FLUJO-SISTEMA.md` | Es carta de presentación: muestra cómo está documentado |
>
> Todo lo demás —planes, guías, capacitación, handoff, este archivo— vive ahora
> en **`docs/`**. Si un enlace parece roto, es por esto: apuntaba a la raíz.
> Los del `README.md` ya se corrigieron.
>
> **También se retiró** el componente de bloqueo por inactividad
> (`src/app/layout/bloqueo-inactividad/`, borrado por completo).
>
> **Y se añadió** la demostración para portafolio: ver la sección más abajo y
> `demo/README.md`.
>
> ### Historial de git reiniciado
>
> El historial anterior tenía `node_modules.rar` (60 MB) commiteado: el `.git`
> pesaba 44 MB por eso, y añadirlo al `.gitignore` no lo saca de los commits ya
> hechos. Como eran solo tres commits sin valor (*"initial commit"*), se empezó
> de cero en vez de reescribir el historial.
>
> **Regla desde ahora:** ningún `.rar`, `.zip` ni respaldo dentro de la carpeta
> del proyecto. El `.gitignore` ya los bloquea, pero un archivo ya commiteado no
> se arregla con `.gitignore` — hay que reescribir el historial o empezar de
> nuevo. Los respaldos van FUERA de `H:\sistema-botica`.

> **Estado backend (NestJS+Prisma) — actualizado:** Fases 0–7 implementadas y
> verificadas (sintaxis OK). Módulos: Auth, Usuarios, Sucursales, Productos,
> Inventario/Lotes (FEFO), Compras/Proveedores, Ventas/Pagos (transaccional),
> Caja (arqueo + reporte Z), Clientes (DNI/RUC), Reportes (KPIs/margen), SUNAT
> (PSE stub intercambiable). Docker Compose (api+postgres+redis) + Swagger en
> `/api/docs`. Muchos puntos de abajo YA están cubiertos en el backend; quedan
> pendientes en el **frontend** (conectar los servicios Angular vía HTTP) y la
> implementación real del PSE de producción. Build/test se corren en Windows
> (el sandbox no compila esbuild/instala npm).



> **📋 EMPIEZA POR AQUÍ: `PLAN-MAESTRO.md`** — reúne TODO lo que falta para que
> las 5 boticas operen, ordenado por riesgo, con los hallazgos de las auditorías
> de código. Este archivo y `PLAN-LOGIN.md` son el detalle de partes concretas.

## Configuración — ajustes que NO hacen nada (verificado en código)

De los 16 ajustes de la pantalla, **8 se guardan y nadie los lee**. Cambiarlos
muestra "Guardado" y no pasa nada. Ya se conectaron los dos que importaban
(IGV y días de alerta de vencimiento); estos quedan pendientes:

| Ajuste | Qué pasa hoy | Cuándo conectarlo |
|---|---|---|
| `directorTecnico` | No sale en ningún lado | **Con SUNAT** (va en el comprobante formal de una botica) |
| `colegiatura` | Ídem | **Con SUNAT** |
| `licenciaFuncionamiento` | Ídem | **Con SUNAT** |
| `moneda` / `simbolo` | Todo el sistema dice "S/." fijo | Solo si alguna vez opera en otra moneda |
| `logoUrl` / `logoEnTicket` | El ticket no usa logo | **Esperando al cliente:** decidir si el ticket lleva imagen o solo el nombre en texto. Imagen = subir archivo + impresora que la soporte; texto = trivial |
| `tipoImpresion` | El ticket es siempre 80mm | Si aparece impresora A4 |

**RESUELTO (ago-2026):** ya no mienten. Los de Regencia/DIGEMID se pueden
cargar pero llevan la etiqueta *"Se guardan · aún no se imprimen"* explicando
que entran con la facturación electrónica. Formato del ticket, moneda y símbolo
están **deshabilitados** con el sello *"Próximamente"* / *"Fija"*: cambiarlos no
tenía efecto, y un campo editable que no hace nada confunde más que uno bloqueado.

Ya conectados (no tocar): `razonSocial`, `ruc`, `direccionFiscal`, `pieTicket`
(salen en el ticket) · `stockMinimoDefault` · `umbralDescuadreCaja` ·
`igvPorcentaje` · `alertaVencimientoDias`.

### Endurecido (ago-2026)

- **Topes en todos los números.** Antes solo había mínimo. Un IGV de 180 se
  guardaba, la pantalla mostraba 180 % y el sistema seguía cobrando 18 %
  porque `igv.util.ts` descarta lo absurdo — pantalla y realidad decían cosas
  distintas. Ahora el DTO rechaza: IGV 0–50, alerta 1–365 días, stock mínimo
  0–1000, umbral de descuadre 0–1000. Los mismos rangos están duplicados en
  `configuracion.ts` (constante `LIMITES`): **si se cambia uno hay que cambiar
  los dos**, o el guardado falla con error del servidor en vez de avisar antes.
- **Bitácora de cambios** (`CambioConfiguracion`): una fila por campo
  modificado, con quién, valor anterior y nuevo. Se escribe en la misma
  transacción que el guardado — si no se puede registrar, el cambio tampoco
  entra. Visible en Configuración → Historial de cambios (solo ADMIN).
  El motivo real: `umbralDescuadreCaja` es el ajuste más abusable del sistema
  (subirlo = ningún cajero vuelve a justificar un faltante) y antes no dejaba
  rastro.
- **El umbral de descuadre ya se puede editar.** Existía en base y en la API,
  pero la pantalla no tenía el campo: solo se podía cambiar por Swagger.
- **Textos falsos corregidos:** decía "el cálculo de venta usa 18%" (ya es
  configurable) y "5 intentos por minuto" (son 15).

### Configuración — pendientes reales

| Qué | Por qué importa | Estado |
|---|---|---|
| **¿Config global o por botica?** | Hoy la fila es única (`id: "global"`) para las 5 sedes. Razón social y RUC sí son comunes. Pero `umbralDescuadreCaja` y `stockMinimoDefault` razonablemente varían por sede — una botica céntrica no tolera lo mismo que una de barrio. Cambiarlo en una lo cambia en las cinco. | **Preguntar al cliente.** No es bug; es decisión de negocio |
| ~~**Dígito verificador del RUC**~~ | **RESUELTO.** Valida módulo 11 en front y backend. El util `rucValido()` ya existía para clientes; faltaba aplicarlo al RUC del emisor, que va en todos los comprobantes | ✅ |

---

## Finanzas — hecho y pendiente (ago-2026)

**Arreglado:**

- **Doble conteo de mercadería.** La categoría de gasto `MERCADERIA` descontaba
  la compra otra vez sobre el costo de ventas. Bloqueada al crear; las filas
  viejas se avisan en pantalla (`gastosMercaderia` en el P&L).
- **Fecha real del gasto.** Antes todo caía en el día de captura: el alquiler
  pagado el 3 y cargado el 10 distorsionaba el período. Ahora se elige, con
  tope en hoy.
- **Corregir en vez de borrar** (`PATCH /gastos/:id`) y confirmación antes de
  eliminar, con quién lo registró visible en la lista.
- **Gastos fijos mensuales** (ver `FLUJO-SISTEMA.md` §5.1).
- **Alcance financiero separado:** solo SUPER_ADMIN cruza sucursales en las
  pantallas de dinero (§8 del mismo documento).

**Pendiente:**

| Qué | Por qué | Cuándo |
|---|---|---|
| Auditoría de borrado de gastos | Eliminar un gasto cambia la utilidad del mes y no queda rastro de quién fue. Lo ideal sería anular en vez de borrar (como las ventas) | Cuando haya datos reales y el borrado sea un riesgo |
| Comparar las 5 boticas en una pantalla | Hoy hay que entrar sede por sede y anotar a mano | Depende de si el dueño usa SUPER_ADMIN |
| Confirmar pendientes uno por uno | El botón registra **todos** los meses pendientes de golpe; no se puede saltar uno | Si en la práctica molesta |
| Separar costos fijos de variables | El punto de equilibrio trata **todo** gasto como fijo. Con pocos gastos variables el error es chico, pero existe | Cuando el negocio tenga comisiones o gastos por venta |

---

## Inventario — hecho y pendiente (ago-2026)

**Arreglado:**

- **El kardex ya dice quién** (`MovimientoStock.registradoPor`). Ver
  `FLUJO-SISTEMA.md` §5.2. Mermas también lo muestra: usa la misma tabla.
- **Fuera `movimientosMock`:** cinco movimientos inventados con nombres falsos
  ("Ana Silva", "Carlos Soto") y facturas de mentira que seguían en el código.
- **Los días de alerta salen de Configuración.** Estaban fijos en 30 y
  **repetidos en cuatro sitios** del mismo archivo, así que el ajuste no hacía
  nada aquí y arreglar una copia no arreglaba las otras. Ahora hay un único
  `clasificarVencimiento()`; las tarjetas KPI y la tabla ya no pueden discrepar.

- **Disponibilidad en las otras boticas** en la ficha del producto
  (`FLUJO-SISTEMA.md` §5.3). Resuelve la pregunta del mostrador sin llamar por
  teléfono a las otras sedes.
- **Fuera los `confirm()` del navegador.** Desactivar y eliminar ahora usan
  modales propios, con la marca del sistema y explicando la consecuencia real
  de cada opción. De paso: el botón **Eliminar** no existía en la pantalla — la
  función estaba en el código y en la API, pero no había forma de llamarla.

**Pendiente (decidido no hacer todavía, a la espera del catálogo real):**

| Qué | Por qué | Cuándo |
|---|---|---|
| Paginar la tabla | Se renderizan todas las filas de golpe. Con el catálogo chico no se nota; con 2.000 SKUs en la laptop del cliente, sí | Cuando se sepa cuántos productos maneja de verdad. Optimizar antes es adivinar |
| Exportar inventario | Finanzas exporta CSV, inventario no. Hace falta para el conteo físico y para mandar el stock al contador | Junto con la paginación |

---

## Cobro con tarjeta (ago-2026)

**Hecho:** campo de **N° de voucher + últimos 4 dígitos** para tarjeta y N° de
operación para transferencia, en el POS y en el pago mixto. Se guarda en
`Pago.referencia` y sale en el ticket. Ver `FLUJO-SISTEMA.md` §2.4.

**Pendiente — decisión del cliente:**

| Qué | Por qué | Qué hace falta |
|---|---|---|
| **Comisión del operador en Finanzas** | Izipay cobra ≈**3,44 % + IGV** más un fijo de ≈**S/ 0,69 + IGV** por transacción. Hoy el sistema registra S/ 100 de venta con tarjeta y no descuenta nada: la utilidad sale inflada | Saber la **tarifa real negociada** del cliente. Luego: campo en Configuración + resta en el P&L y en el flujo de caja |
| **Días de abono** | El dinero de tarjeta entra al día hábil siguiente, no hoy. El flujo de caja lo trata como disponible | Menor. Solo importa si el dueño usa el flujo para decidir pagos a proveedores |
| **Integración con el datáfono** | Evitaría teclear el monto dos veces y el error de tipeo | Izipay lo permite vía plataforma **AXIUM** (terminales Android de Ingenico), pero exige asesor comercial y terminal compatible. **No hacer hasta que haya volumen y presupuesto** |

> **Dato para la conversación con el cliente:** el cargo fijo por transacción
> pesa muchísimo en tickets bajos, que es lo normal en botica. En una venta de
> S/ 20 el operador se lleva ≈8 %, no el 3,44 % nominal; en una de S/ 200, ≈4,5 %.
> Conviene que lo sepa antes de decidir si empuja la tarjeta o el efectivo.
> (Tarifas verificadas en ago-2026; varían por rubro y volumen — confirmar con
> el asesor.)

---

## Dashboard — hecho (ago-2026)

El inicio son **tres zonas**, no dos pantallas: la torre de control
(SUPER_ADMIN), el hero personal (usuario normal) y **una zona común que ven los
dos**. Todos los defectos estaban en la zona común. Ver `FLUJO-SISTEMA.md` §6.1.

- **"Valor inventario" ya no lo ve cualquiera.** Estaba en la pantalla de inicio
  de cualquier vendedor, sin control de rol, justo después de haber cerrado el
  P&L y los márgenes por permiso. Ahora exige `tienePermiso('finanzas')`; en su
  lugar el cajero ve **el estado de su turno**, que es lo que necesita al entrar.
- **Una sola definición de cada número.** La zona común recalculaba el valor de
  inventario **a precio de venta** (y truncando por el factor mayor: 250 unidades
  con caja de 100 contaban 2 cajas y se perdían 50), mientras la torre de control
  lo mostraba **a costo**. Dos números para la misma botica a un scroll de
  distancia. Ahora ambas leen el KPI del backend.
- **Días de vencimiento configurables.** Eran 90 fijos en la tarjeta y 30 en el
  panel de alertas. Ahora salen de Ajustes, igual que Inventario y el backend.
- **Fuera `_ventasMock`:** 45 líneas de ventas inventadas con clientes y boletas
  falsas — bajo un comentario que decía "todo REAL, nada simulado".
- **Métodos de pago correctos.** TRANSFERENCIA se pintaba como Efectivo y el
  pago mixto tomaba solo el primer pago. Ahora hay etiqueta propia para
  transferencia y mixto, mirando todos los pagos de la venta.
- **El gráfico por hora sigue el horario real.** Asumía 8am–8pm: las ventas
  fuera de esa franja no salían en la barra pero sí en el total del día.
- **La categoría del producto ya no sale vacía** en top productos y alertas.
- **La torre de control es solo del dueño.** `GET /reportes/sucursales` aceptaba
  `ADMIN`: la pantalla no se la mostraba, pero un encargado de sede podía ver la
  venta del día de las otras cuatro boticas llamando a la API. Ahora es
  `@Roles('SUPER_ADMIN')`. **Ocultarlo en el HTML no era protegerlo.**

### Barrido pendiente: otros endpoints que cruzan sedes

Con `SUPER_ADMIN` = dueño y `ADMIN` = encargado de una sede, `sucursalEfectiva`
tiene un borde: **si un admin no manda `sucursalId`, devuelve todas las sedes.**
Afecta a:

| Endpoint | Qué se ve de otras boticas |
|---|---|
| `GET /compras` | Las compras y a qué precio compró cada sede |
| `GET /devoluciones` | Devoluciones de cualquier sede |
| `GET /caja/olvidadas` | Cajas sin cerrar de cualquier sede |

**No lo cambié todavía a propósito:** tocar esto afecta la operación diaria y
puede ser que el dueño SÍ quiera que un encargado vea las compras de todas
(para coordinar pedidos). **Es decisión de negocio, no bug.** Lo financiero
—P&L, márgenes, gastos— ya está cerrado con `verificarSucursalFinanciera`.

---

## Clientes y bloqueo de sesión (ago-2026)

- **El historial de compras del cliente era falso.** `historialMock`: cinco
  compras inventadas que se pintaban **iguales para todos los clientes** — y no
  era código muerto, se mostraba en pantalla. Ahora sale del backend
  (`GET /ventas?clienteId=`, filtro nuevo), con estado vacío honesto y el total
  gastado calculado de las compras reales.
- **Fuera `_clientesMock`:** clientes inventados con DNIs, correos, teléfonos y
  direcciones de aspecto real, **y el nombre de una clínica que existe**. En un
  repo público eso parece una fuga de datos de clientes.
- **Bloqueo por inactividad: implementado y luego RETIRADO a pedido** (ago-2026).
  Se quitó el componente, el campo `minutosInactividad` del schema y el ajuste de
  la pantalla. Sigue siendo un hueco real de seguridad — está anotado en
  `FLUJO-SISTEMA.md` §11 por si se retoma.

---

## Demostración para portafolio (ago-2026) — LEER ANTES DE TOCAR

Se añadió una **semilla de demostración** para poder enseñar el sistema en
entrevistas y tomar capturas, sin pagar hosting. Instrucciones y guion en
**`demo/README.md`**.

**Qué se creó y por qué, para que nadie lo confunda más adelante:**

| Archivo | Qué es |
|---|---|
| `backend/prisma/seed-demo.ts` | Datos ficticios: 3 sucursales, **94 productos** en 18 categorías, 30 días de ventas, mermas y gastos |
| `demo/README.md` | Cómo levantarlo, credenciales y guion de 4 minutos |
| `backend/package.json` → `db:seed:demo` | El comando que lo ejecuta |

**Decisiones que conviene no deshacer:**

- **Es el backend REAL con datos ficticios**, no un backend simulado. Las ventas,
  lotes, kardex y cajas se escriben en las mismas tablas que la operación real.
  Un backend falso escondería justo lo que más vale del proyecto (transacciones,
  FEFO, costo promedio) y se nota en cinco minutos.
- **Un solo código, dos semillas.** No se duplicó el proyecto en otra carpeta:
  dos copias se desincronizan y una se queda vieja.
- **El seed vive en `backend/prisma/`** aunque el resto de la demo esté en
  `demo/`. No es desorden: necesita el cliente de Prisma y Node resuelve las
  dependencias desde la carpeta del archivo. Fuera de `backend/` no compila.
- **Se protege solo:** si la base ya tiene ventas, aborta. Para forzarlo hay que
  pasar `DEMO_FORCE=1` a propósito. Así no puede ensuciar la base del cliente.
- **Aleatoriedad con semilla fija:** la demo se ve igual en cualquier equipo, así
  que las capturas del portafolio coinciden con lo que ve quien la levanta.

> ⚠️ **`prisma/seed-demo.ts` está excluido en `tsconfig.build.json`.** Si se
> quita de esa lista, cambia el `rootDir` y el build de Docker falla con
> *"Cannot find module '/app/dist/main'"*. Ya pasó con `reset-admin.ts`.

**Las claves de `demo/README.md` son solo para datos ficticios.** Nunca en una
instalación real.

---

## Login y acceso — GUARDADO PARA DESPUÉS

Plan completo en **`PLAN-LOGIN.md`** (fases L1–L11, con prioridades y qué toca
cada una). Resumen de lo que quedó pendiente:

- **Contraseñas (lo más urgente):** ningún usuario puede cambiar la suya
  (`UsuariosController` tiene `@Roles('SUPER_ADMIN','ADMIN')` a nivel de clase)
  y todos siguen con las claves del seed. Falta `PATCH /usuarios/mi-password` +
  campo `debeCambiarPassword` que fuerce el cambio en el primer ingreso.
- **Auditoría de accesos:** no existe ningún modelo de auditoría en el schema.
  El único rastro es `Usuario.ultimoAccesoEn`, que se sobrescribe en cada login.
  Sin esto no se puede investigar un descuadre de caja.
- **Bloqueo por intentos:** hoy el Throttler es por IP, no por cuenta. Un cajero
  que se equivoca 5 veces bloquea el terminal para todos.
- **Bloqueo por inactividad:** el refresh dura 7 días; si el cajero se aleja del
  mostrador, cualquiera vende bajo su nombre. Es el hueco que deja abierto el
  modelo de caja del bloque C. Toca el POS → bloque aparte.

El flujo de login en sí ya está auditado y sin bugs conocidos (jul-2026).

---

## Caja (próximos pasos guardados)

### 1. Reporte de cierre imprimible ("cierre Z")
Al cerrar la caja, mostrar una ventana con el resumen completo del turno y un botón
**"Imprimir cierre"** (misma impresora 80mm que la boleta del POS). El cajero entrega
ese papel junto con el efectivo. Contenido:
- Cajero, terminal, turno (apertura → cierre).
- Ventas del turno por método: efectivo, Yape/Plin, tarjeta, otros + total y # tickets.
- Arqueo de efectivo: fondo + ventas efectivo + ingresos − egresos = esperado vs contado → diferencia.
- Guardar para reimprimir desde el histórico.

### 2. Motivo obligatorio en diferencias grandes
En el cierre, si la diferencia supera un umbral (ej. > S/. 20), exigir un campo
**"Motivo del descuadre (obligatorio)"** antes de permitir cerrar. Si la diferencia es
pequeña, no aparece. Queda registrado en el cierre para auditoría.

### Otras mejoras de caja (menores)
- Estado de caja siempre visible (chip en header/sidebar: "Caja abierta · S/. esperado").
- Detalle de movimientos (ingresos/egresos con categoría y motivo) dentro del reporte de cierre.
- Montos rápidos en la apertura (50 / 100 / 200).
- Vista de Admin para ver / forzar cierre de cajas de todos los cajeros.

## Roadmap general (más adelante)
- Persistencia global (IndexedDB) para ventas, stock y lotes (la caja ya persiste en localStorage).
- Baja de lotes vencidos (merma) desde Inventario.
- SUNAT: comprobante electrónico real (XML, estados, notas de crédito).
- Precio de compra + IGV por producto (margen real en Finanzas).
