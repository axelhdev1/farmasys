# Plan profesional — Módulo Sucursales (Multi-botica)

> FarmaSys · Roadmap para convertir "Mis Sucursales" de una vista estática a un
> **centro de control multi-botica**: gestión + inteligencia + comparación + control.

---

## 1. Visión

Hoy "Sucursales" es una pantalla de **solo lectura con datos inventados**. La visión es
convertirla en el **panel de mando del dueño de la cadena**: el lugar donde da de alta
boticas, ve en tiempo real cómo va cada una, las compara, detecta problemas (caja sin abrir,
stock crítico, vencimientos) y entra a gestionar cualquiera con un clic.

En una frase: **de "directorio" a "torre de control".**

---

## 2. Estado actual (diagnóstico)

| Área | Estado |
|------|--------|
| Listado de sucursales | ✅ Conectado al backend (ids reales) |
| Crear / editar / desactivar desde la UI | ❌ No existe (el backend sí lo soporta) |
| KPIs por sucursal (ventas, tickets, stock, alertas) | ❌ Eran mock; hoy muestran **0** |
| QR de pago (Yape/Plin) | ⚠️ Modelo distinto front (objeto) vs back (string) |
| Series de comprobante (B001/F001) | ⚠️ Existen en BD, sin UI y sin unicidad garantizada |
| Responsable / fecha de apertura | ⚠️ La UI los muestra; la BD no los tiene |
| Seguridad por sucursal | ⚠️ Cualquier ADMIN puede editar cualquier botica |
| Estados de carga / vacío / animaciones | ❌ No hay |

---

## 3. Objetivos del módulo

1. **Gestionar** boticas de punta a punta sin tocar Swagger.
2. **Ver la verdad** en tiempo real (cero datos inventados).
3. **Comparar** sucursales para decidir (ranking, tendencias, metas).
4. **Controlar** acceso y series por sucursal (blindaje fiscal y multi-tenant).
5. **Escalar** a una cadena (transferencias, reportes consolidados, mapa).

---

## 4. Roadmap por fases

Cada fase es entregable por sí sola (se puede mostrar al cliente al terminarla).

### Fase 1 — Gestión real (CRUD) · *Prioridad máxima*

**Objetivo:** dar de alta, editar y desactivar boticas desde la pantalla.

- **Frontend**
  - `SucursalApiService` (crear, actualizar, desactivar, reactivar).
  - Modal crear/editar: nombre, dirección, distrito, ciudad, teléfono, email,
    estado, **series** (B001/F001), **QR Yape/Plin**, **responsable**.
  - Acciones por tarjeta: editar · desactivar/reactivar · ver detalle.
  - Confirmación de baja (modal destructivo) con chequeo de integridad.
- **Backend**
  - Validación: **series únicas** entre sucursales (boleta y factura).
  - Validación: nombre único (ya existe).
  - Bloquear baja si la sucursal tiene **caja abierta** o stock pendiente (aviso).
- **Criterio de hecho:** un SUPER_ADMIN crea una botica nueva, la edita y la
  desactiva; los cambios persisten y se reflejan en el selector del header.

### Fase 2 — Inteligencia (KPIs reales) · *Alta*

**Objetivo:** que la vista consolidada muestre datos reales, no ceros.

- **Backend**
  - Endpoint `GET /reportes/sucursales` → por cada botica del día:
    ventas, tickets, ticket promedio, productos activos, alertas de stock bajo,
    alertas de vencimiento, **estado de caja** (abierta/cerrada + cajero).
  - Reutiliza la lógica de `ReportesModule` ya existente, agregada por sucursal.
- **Frontend**
  - Cards consolidados reales (suma global).
  - Por tarjeta: ventas del día, tickets, ticket prom., productos, alertas.
  - **Barra comparativa** real entre sucursales.
  - **Mini-tendencia** (sparkline) de ventas de los últimos 7 días.
- **Criterio de hecho:** los números coinciden con el Dashboard/Historial reales.

### Fase 3 — Datos del negocio (QR, series, responsable) · *Alta*

**Objetivo:** reconciliar y exponer los datos que importan para cobrar y facturar.

- **Backend (modelo)**
  - QR estructurado: `qrYapeCelular`, `qrYapeTitular`, `qrYapeImagen` (y Plin),
    o un campo JSON. Hoy es un solo string y el POS espera un objeto.
  - Agregar `responsableId` (FK a Usuario), `email`, `ciudad`.
- **Frontend**
  - Mostrar series (B001/F001) y QR configurado en cada tarjeta.
  - El POS toma el QR real de la sucursal activa (cierra el círculo de cobro).
- **Criterio de hecho:** el QR que se muestra en el POS es el de la botica activa.

### Fase 4 — Seguridad multi-tenant · *Importante*

**Objetivo:** que cada quien solo toque lo suyo.

- **Backend**
  - ADMIN edita/gestiona **solo su sucursal**; SUPER_ADMIN, todas.
  - Auditoría: registrar quién creó/editó/desactivó una sucursal.
  - Verificar que **todos** los endpoints de negocio filtren por `sucursalId`
    (ventas, stock, caja, compras) — evitar fugas entre boticas.
- **Criterio de hecho:** un ADMIN de "Botica Comas" no puede editar "Botica Central".

### Fase 5 — UX/UI profesional · *Pulido*

- Skeletons de carga + estado vacío ("Crea tu primera botica").
- Animaciones de entrada en tarjetas (consistente con POS/Historial/Usuarios).
- Búsqueda/filtro por nombre, distrito y estado.
- **Resaltar la sucursal activa** (la que estás gestionando).
- Formatear fecha de apertura; quitar campos vacíos.
- **Vista de detalle** (drill-down): mini-dashboard de esa botica + sus usuarios +
  su caja + su stock crítico.
- Accesibilidad: labels en botones de ícono, foco/trap en modales.

### Fase 6 — Visión a futuro (escalar a cadena) · *Estratégico*

Funciones que posicionan el sistema como producto serio para cadenas:

- **Transferencias de stock entre sucursales** (con guía de remisión interna).
- **Benchmarking y metas**: objetivo de ventas por botica y % de cumplimiento.
- **Reportes consolidados exportables** (PDF/Excel) para el dueño.
- **Mapa de boticas** (geolocalización lat/lng) con estado en vivo.
- **Horario de atención** + indicador "Abierta / Cerrada" en tiempo real.
- **Alertas push/notificaciones**: "Botica X no abrió caja", "stock crítico".
- **Rol Gerente de sucursal** (entre ADMIN y VENDEDOR).
- **Historial de cambios** por sucursal (auditoría visible).
- Preparar **multi-empresa / multi-RUC** si el cliente maneja varias razones sociales.

---

## 5. Cambios de modelo de datos (resumen)

Para soportar el roadmap, el modelo `Sucursal` debería crecer así (todo aditivo):

```
Sucursal {
  // ya existe: nombre, distrito, direccion, telefono, estado, series, QR(string)
  email           String?      // contacto de la botica
  ciudad          String?
  responsableId   String?      // FK -> Usuario (gerente/admin responsable)
  qrYapeCelular   String?      // QR estructurado
  qrYapeTitular   String?
  qrYapeImagen    String?
  qrPlinCelular   String?
  qrPlinTitular   String?
  qrPlinImagen    String?
  latitud         Float?       // para el mapa (futuro)
  longitud        Float?
  horarioApertura String?      // "08:00"
  horarioCierre   String?      // "22:00"
  metaVentaMensual Decimal?    // para benchmarking (futuro)
}
```

> Se aplican con `prisma db push` (aditivo, sin pérdida de datos), igual que
> hicimos con `dni`/`ultimoAccesoEn` en Usuarios.

---

## 6. Riesgos y cuidados

- **Series duplicadas** → correlativos de comprobante colisionan (problema fiscal). Validar unicidad **antes** de habilitar el CRUD.
- **Baja de sucursal con operaciones vivas** → nunca borrar (soft-delete ya está); avisar si hay caja abierta/stock.
- **Refactor de seguridad** (Fase 4) toca control de acceso: probar con cada rol en vivo.
- **KPIs por sucursal** pueden ser pesados → cachear (Redis ya está disponible) si hay muchas boticas.

---

## 7. Priorización recomendada (qué hacer y en qué orden)

1. **Fase 1 (CRUD + baja segura)** — convierte la pantalla de "vacía" a "útil". *Mayor impacto, bajo riesgo.*
2. **Fase 2 (KPIs reales)** — elimina los ceros y le da sentido a la vista consolidada.
3. **Fase 3 (QR + series + responsable)** — cierra el cobro y lo fiscal.
4. **Fase 4 (seguridad)** — blindaje antes de entregar al cliente.
5. **Fase 5 (UX)** — que se vea premium.
6. **Fase 6 (futuro)** — se vende como roadmap al cliente; se construye según demanda.

---

## 8. Quick wins (se pueden hacer ya, en una sesión)

- CRUD de sucursales con su modal (Fase 1).
- Quitar los KPIs falsos para que no muestre ceros (parche hasta Fase 2).
- Skeletons + estado vacío + animaciones (Fase 5 parcial).
- Formatear fecha y limpiar campos vacíos.

---

*Documento vivo. Se actualiza a medida que se completan fases.*
