# FarmaSys — Roadmap Maestro del Sistema

> Sistema integral de gestión para boticas y farmacias (Perú).
> Documento de estado + visión + plan de evolución hacia producción y escala.

---

## 1. Resumen ejecutivo

**FarmaSys** es un sistema de gestión farmacéutica multi-sucursal: punto de venta,
inventario con control de lotes y vencimientos, compras, caja con arqueo, clientes,
usuarios con roles, y reportería. Está construido con tecnología moderna (Angular +
NestJS + PostgreSQL) y arquitectura por capas, pensado para una botica individual
hoy y para una **cadena de boticas** mañana.

**Para quién:** dueños de botica que necesitan controlar ventas, stock, vencimientos,
caja y personal — y *ver su negocio* en tiempo real, con datos confiables.

**Diferenciador:** control real de **lotes y vencimientos (FEFO)**, **pagos QR sin
comisión** (Yape/Plin directos), y arquitectura **multi-sucursal** desde el día uno.

---

## 2. Arquitectura y stack (señal de profesionalismo)

| Capa | Tecnología |
|------|-----------|
| Frontend | Angular (standalone + signals), Tailwind, diseño responsive |
| Backend | NestJS 10 + Prisma 5 (API REST, stateless) |
| Base de datos | PostgreSQL 16 (dinero en `Decimal`, nunca float) |
| Autenticación | JWT (access + refresh), bcrypt, roles |
| Infra | Docker Compose (API + PostgreSQL + Redis) |
| Documentación | Swagger / OpenAPI en `/api/docs` |

**Principios aplicados:** transacciones atómicas en ventas, idempotencia,
soft-delete (no se borran datos), correlativos de comprobante atómicos,
separación de responsabilidades en servicios.

---

## 3. Estado actual por módulo

🟢 Operativo (datos reales) · 🟡 Parcial / mock · 🔴 Pendiente

| Módulo | Backend | Frontend | Estado |
|--------|:------:|:--------:|--------|
| Autenticación + roles | 🟢 | 🟢 | Login real, JWT, guardas por rol |
| Punto de Venta (POS) | 🟢 | 🟢 | Venta real, FEFO, pago mixto, ticket |
| Inventario (lotes/FEFO/alertas) | 🟢 | 🟢 | Stock real por sucursal |
| Compras / ingreso de stock | 🟢 | 🟢 | Alta de medicamento + ingreso |
| Caja (apertura/arqueo) | 🟢 | 🟢 | Por cajero; falta reporte Z imprimible |
| Historial de ventas | 🟢 | 🟢 | Filtros, paginación, reimpresión, anular |
| Clientes | 🟢 | 🟢 | CRUD + DNI/RUC |
| Usuarios | 🟢 | 🟢 | CRUD real, DNI, último acceso |
| Dashboard | 🟢 | 🟢 | KPIs reales del día |
| Sucursales | 🟢 | 🟡 | Listado real; falta CRUD y KPIs reales |
| Finanzas | 🟢 | 🟡 | Reportes existen; front aún mock |
| Configuración | 🔴 | 🟡 | Por conectar |
| Facturación SUNAT | 🟡 | 🟡 | Estructura lista; falta integrar PSE |

**Lectura:** el **núcleo operativo está construido y funcionando con datos reales.**
Lo que resta es cerrar lo mock, blindar para producción y agregar inteligencia.

---

## 4. Roadmap por fases

Cada fase es un entregable mostrable al cliente.

### Fase 0 — Núcleo operativo · ✅ HECHO
Backend completo + POS, inventario, compras, caja, clientes, usuarios, historial y
dashboard conectados a datos reales. **El ciclo de venta funciona de punta a punta.**

### Fase 1 — Cerrar lo que falta (sistema 100% real)
- **Sucursales:** CRUD completo + KPIs reales (ver `PLAN-SUCURSALES.md`).
- **Finanzas:** conectar a reportes reales (ventas, márgenes, egresos).
- **Configuración:** datos de la botica, series, IGV, impresora.
- **Caja:** reporte Z imprimible en pantalla.
- **Resultado:** ninguna pantalla muestra datos inventados.

### Fase 2 — Seguridad y producción
- Cambiar **secretos JWT** por defecto (hoy son de desarrollo).
- **Rate-limit** en login (anti fuerza bruta) + bloqueo temporal.
- **Migraciones Prisma** versionadas (reemplazar `db push`).
- **Backups automáticos** de PostgreSQL.
- **Despliegue real:** hosting + HTTPS + dominio.
- **Logs y monitoreo** (errores, uptime, alertas de caída).
- Validar `cajaSesionId` del cajero en cada venta.
- **Resultado:** el sistema se puede entregar a un cliente sin riesgos básicos.

### Fase 3 — Inteligencia de negocio (lo que el dueño compra)
- **Reportes de rentabilidad y márgenes** por producto/categoría/sucursal.
- **Top productos** (más y menos vendidos, rotación).
- **Alertas proactivas:** stock crítico, por vencer, "botica sin caja abierta hoy".
- **Exportables PDF/Excel** para el contador.
- **Dashboard ejecutivo** consolidado (dueño de cadena).
- **Resultado:** el dueño *ve su negocio* y toma decisiones — el mayor argumento de venta.

### Fase 4 — Cumplimiento fiscal (SUNAT)
- Integración con **PSE/OSE** (Nubefact, Bizlinks, etc.) — decisión del cliente.
- Emisión de **boleta/factura electrónica** válida.
- **Notas de crédito** y **devoluciones** (reemplazan la anulación informal).
- **Resultado:** el sistema es **legalmente operable** para facturar en Perú.

### Fase 5 — Calidad y robustez
- **Tests e2e** del flujo de venta (lo más crítico) + CI.
- Interceptor de errores con mensajes claros en el front.
- Refactors pendientes: `CarritoStore` (POS), mapa único de permisos.
- **Resultado:** menos incendios, más mantenible.

### Fase 6 — Escalar a cadena / diferenciadores
- **Transferencias de stock entre sucursales** (guía interna).
- **Metas y benchmarking** por botica (% de cumplimiento).
- **Mapa de boticas** (geolocalización) + estado "Abierta/Cerrada" en vivo.
- **App / PWA para tablet** en el mostrador.
- **Fidelización de clientes** (puntos — el campo ya existe).
- **Impresión térmica** real (ESC/POS) y lector de barras (ya integrado).
- **Rol "Gerente de sucursal"** y **multi-RUC** si crece.

---

## 5. Capa transversal (aplica a todo)

- **Seguridad:** secretos, rate-limit, auditoría (quién hizo qué), permisos por sucursal.
- **Producción:** backups, migraciones, HTTPS, monitoreo, variables de entorno.
- **Rendimiento:** caché en Redis para reportes pesados (ya está disponible).
- **UX consistente:** skeletons, estados vacíos, animaciones y toasts unificados (ya aplicado en POS, Historial y Usuarios; extender al resto).

---

## 6. Cómo "convencer al cliente" (guion de demo)

Para que se vea **muy bueno**, la demo debería contar una historia, no listar pantallas:

1. **Login** → entra como dueño; el sistema lo saluda y muestra su tablero del día.
2. **Una venta en vivo (POS)** → busca un medicamento, lo agrega, cobra con Yape,
   imprime el ticket. Rápido, fluido, con animaciones. *"Así de simple vende tu cajera."*
3. **El control que no se ve en otros** → muestra el **lote y vencimiento** que se
   despacha (FEFO) y la **alerta de stock bajo**. *"El sistema cuida que no vendas vencido."*
4. **El cierre de caja** → arqueo por cajera, cada una responde por su caja.
5. **El dueño ve su negocio** → dashboard con ventas del día, ticket promedio,
   y (Fase 3) rentabilidad y productos top. *"Esto es lo que tú vas a mirar cada mañana."*
6. **Multi-sucursal** → "y cuando abras tu segunda botica, ya está lista."

**Tips para que impacte:** datos de demo realistas (no "producto 1"), velocidad
(nada que cargue lento), y cero pantallas con ceros o "próximamente" a la vista.
Por eso conviene cerrar lo mock (Fase 1) **antes** de demostrar.

---

## 7. Priorización recomendada

| Orden | Bloque | Por qué |
|:----:|--------|---------|
| 1 | **Fase 1** (cerrar mock) | Para demostrar sin pantallas vacías |
| 2 | **Fase 2** (seguridad/prod) | Para entregar sin riesgos |
| 3 | **Fase 3** (inteligencia) | Es lo que cierra la venta al dueño |
| 4 | **Fase 5** (calidad) | Para que no se rompa en uso real |
| 5 | **Fase 4** (SUNAT) | Cuando haya cliente y su PSE |
| 6 | **Fase 6** (escala) | Se vende como visión; se construye según demanda |

> Nota: la Fase 4 (SUNAT) es **legalmente obligatoria** para facturar de verdad,
> pero depende del cliente, por eso se ejecuta cuando exista.

---

## 8. Riesgos principales

- **Secretos de desarrollo en producción** → riesgo de seguridad alto. Resolver en Fase 2.
- **Series de comprobante duplicadas entre sucursales** → colisión de correlativos (fiscal).
- **Sin SUNAT** → no se puede facturar legalmente; techo comercial.
- **Sin backups/migraciones** → riesgo de pérdida de datos en producción.
- **Sin tests del flujo de venta** → regresiones difíciles de detectar.

---

## 9. Documentos relacionados
- `PLAN-SUCURSALES.md` — plan detallado del módulo Sucursales.

---

*Documento vivo. Refleja el estado al día de su última actualización y se ajusta
a medida que se completan fases.*
