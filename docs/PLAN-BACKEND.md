# FarmaSys — Plan del Backend (Producción)

**Stack decidido:** NestJS (TypeScript) + PostgreSQL + Prisma (ORM) · API REST · JWT.
Mismo lenguaje que el frontend Angular → se reutilizan modelos y lo mantiene un solo equipo.

---

## 1. Arquitectura general
- **API REST** modular (un módulo por dominio, igual que el frontend).
- **PostgreSQL** como base de datos (transacciones ACID, integridad referencial).
- **Prisma** para esquema, migraciones y acceso a datos con tipos.
- **JWT** (access + refresh) para autenticación; **guards por rol y por sucursal**.
- **Multi-sucursal**: casi todo se filtra por `sucursalId`; el SUPER_ADMIN ve todo.
- Frontend se conecta **incremental**: los servicios Angular ya tienen el HTTP comentado.

---

## 2. Esquema de base de datos (tablas)

**Núcleo**
- `sucursales` (nombre, distrito, dirección, teléfono, estado, QR Yape/Plin, series de comprobante, correlativos).
- `usuarios` (nombres, apellidos, email, password_hash, estado) + `usuario_roles` (rol, sucursal_id).
- `productos` (código, nombre, principio_activo, concentración, categoría, laboratorio, ubicación, es_generico, requiere_receta, controlado, registro_sanitario DIGEMID, tipo_afectacion_igv, unidad_base, activo).
- `presentaciones` (producto_id, nombre, factor, precio_venta, codigo_barras, es_base).

**Inventario / lotes (FEFO)**
- `lotes` (producto_id, sucursal_id, lote, vencimiento, cantidad_base, estado).
- `stock_sucursal` (producto_id, sucursal_id, cantidad_base, stock_minimo) — o derivado de lotes.
- `movimientos_stock` (producto_id, sucursal_id, tipo, cantidad_base, motivo, referencia_id, usuario_id, fecha).
- `proveedores` y `compras` / `ingresos_mercaderia` (con lote + vencimiento) — cierra el ciclo de inventario y da **precio de compra** para el margen.

**Ventas**
- `ventas` (numero_comprobante, tipo_comprobante, sucursal_id, cajero_id, caja_sesion_id, cliente_id, subtotal, igv, total, estado, motivo_anulacion, fecha).
- `venta_items` (venta_id, producto_id, presentacion_id, lote_id, cantidad, precio_unitario, subtotal).
- `pagos` (venta_id, metodo, monto, referencia) — soporta **pago mixto** (varios métodos por venta).

**Caja**
- `caja_sesiones` (sucursal_id, cajero_id, terminal, monto_inicial, apertura_en, estado, cierre_*).
- `movimientos_caja` (caja_sesion_id, tipo, categoria, monto, motivo, usuario_id, fecha).

**Clientes y cumplimiento**
- `clientes` (tipo_doc, numero_doc, nombres, apellidos/razón_social, puntos).
- `recetas` (venta_id, medico_cmp, paciente, fecha) — para productos con receta/controlados (DIGEMID).
- `comprobantes_sunat` (venta_id, xml, hash, estado, cdr, ticket) — facturación electrónica.
- `auditoria` (usuario_id, accion, entidad, detalle, fecha) — trazabilidad de cambios sensibles.

---

## 3. Módulos / endpoints (por dominio)
auth · usuarios · sucursales · productos · presentaciones · lotes/stock · movimientos-stock ·
compras/proveedores · clientes · ventas · pagos · caja · comprobantes (SUNAT) · reportes · auditoría.
(CRUD + acciones específicas: vender, anular, abrir/cerrar caja, registrar movimiento, FEFO, etc.)

---

## 4. Seguridad
- Contraseñas con **bcrypt**; nunca texto plano.
- **JWT access (corto) + refresh (largo)**; logout invalida refresh.
- **Guards por rol** y **scoping por sucursal** (un cajero solo ve su sucursal).
- **CORS** restringido al dominio del frontend.
- **Rate limiting** y validación estricta de entrada (class-validator DTOs).
- **HTTPS** obligatorio en producción.

---

## 5. Cosas críticas que NO hay que olvidar (las típicas que se pasan por alto)
- **Dinero en DECIMAL/NUMERIC**, nunca `float` (los float redondean mal los soles). En código, decimal.js o enteros en céntimos.
- **Transacciones**: vender = (descontar lote FEFO + crear venta + items + pagos + sumar a caja) **todo o nada**.
- **Bloqueo de concurrencia** al descontar stock (dos cajeros a la vez no deben dejar stock negativo).
- **Zona horaria America/Lima** consistente en backend y BD (no guardar en hora local ambigua; UTC + convertir).
- **Correlativos de comprobante atómicos** (serie B001 → 00000001, sin saltos ni duplicados) — generarlos dentro de transacción.
- **Soft-delete** (campo `activo`/`eliminado_en`) en vez de borrar productos/ventas (historial y SUNAT lo exigen).
- **Migraciones y seeds** versionados (Prisma migrate) — nada de cambiar la BD a mano.
- **Backups automáticos** de la base (diario) + prueba de restauración.
- **Validación de RUC/DNI** (dígito verificador) en el backend, no solo en el front.
- **Idempotencia** al cobrar (evitar doble venta si el cajero hace doble clic / reintento de red).
- **Logs y auditoría** de acciones sensibles (anulaciones, cambios de precio, cierres de caja, accesos).
- **Variables de entorno** (.env) para credenciales/DB/secretos — fuera del código.
- **IGV por producto** (algunos medicamentos están inafectos/exonerados) — no asumir 18% a todo.
- **Manejo de errores uniforme** (filtros de excepción) y respuestas consistentes.

---

## 6. SUNAT (facturación electrónica)
- Integrar vía **PSE/OSE** (Nubefact, Bizlinks o similar) — NO construir el firmado XML desde cero.
- Estados del comprobante: PENDIENTE → ACEPTADO / RECHAZADO; soportar **notas de crédito** (anulaciones).
- Guardar XML + CDR + hash por comprobante.

---

## 7. Hosting / despliegue
- **App + Postgres gestionado**: Railway o Render (simple, barato para empezar). Alternativa: VPS propio.
- **Backups** activados en el Postgres gestionado.
- Dominio + certificado HTTPS.
- Variables de entorno en el panel del hosting (no en el repo).

---

## 8. Orden de implementación (fases)
1. **Scaffold** NestJS + conexión Postgres (Prisma) + config/.env + esquema base + migración inicial.
2. **Auth** (usuarios, login JWT, roles, guards).
3. **Catálogo**: productos, presentaciones, sucursales.
4. **Inventario**: stock por sucursal, lotes (FEFO), movimientos.
5. **Ventas + pagos** (transaccional) + correlativos.
6. **Caja**: apertura, movimientos, cierre/arqueo.
7. **Clientes, recetas, reportes, auditoría.**
8. **SUNAT** (comprobantes electrónicos vía PSE).
9. **Conexión incremental del frontend** (reemplazar mocks por HTTP, módulo por módulo).
10. **Despliegue + backups + pruebas de carga básicas.**

---

## 9. Riesgos / decisiones pendientes
- **Hosting**: ¿nube (Railway/Render) o servidor local en la botica? (afecta backups y acceso remoto).
- **Proveedor SUNAT** (PSE/OSE) a elegir — implica costo por comprobante.
- **Migración de datos** si ya hay información en papel/Excel de la botica.
- **Conexión a internet** de la botica (si es inestable, considerar modo offline parcial en el POS).
- **Impresora térmica** del local (drivers/compatibilidad para boleta y cierre Z).

---

## 10. Siguiente acción
Empezar por la **Fase 1**: scaffold del backend NestJS + Prisma + esquema inicial de la BD + migración.
El frontend se mantiene funcionando con mocks hasta que cada módulo del backend esté listo.
