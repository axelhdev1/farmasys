# FarmaSys — Plan completo del sistema

Estado al día: **backend corriendo en Docker** (PostgreSQL + Redis + API), login JWT
funcionando, catálogo demo cargado y consultas reales OK. Todos los dominios
(Auth, Usuarios, Sucursales, Productos, Inventario/Lotes, Compras, Ventas, Caja,
Clientes, Reportes, SUNAT) están implementados y respondiendo.

Este plan tiene 3 partes:
- **Parte 1 — Verificación definitiva** (probar que el backend NO tiene errores).
- **Parte 2 — Completar el backend** (lo que falta para producción).
- **Parte 3 — Conectar el frontend Angular** (reemplazar mocks por API real).

---

## PARTE 1 — Verificación definitiva del backend (sin errores)

Hasta ahora la sintaxis se verificó fuera del contenedor. Como el contenedor ya
tiene TODO instalado, aquí corremos las pruebas REALES. Con el backend levantado,
abre una terminal en `backend` y ejecuta uno por uno:

### 1.1 Verificación de tipos (TypeScript real)
```
docker compose exec api npx tsc --noEmit -p tsconfig.json
```
- **Esperado:** que no imprima nada (o "0 errores"). Si imprime errores, son de
  tipos; cópialos y se corrigen.

### 1.2 Tests unitarios (jest)
```
docker compose exec api npm test
```
- **Esperado:** todas las suites en verde (auth, usuarios, productos, sucursales,
  inventario/FEFO, compras, caja, clientes/RUC, ventas, sunat).

### 1.3 Validación del esquema de base de datos (Prisma)
```
docker compose exec api npx prisma validate
```
- **Esperado:** "The schema at prisma/schema.prisma is valid".

### 1.4 Salud del servicio
```
http://localhost:3000/api/v1/health   → { "db": "ok" }
```

> Cuando 1.1, 1.2 y 1.3 estén en verde, el backend queda **verificado sin errores**.

---

## PARTE 2 — Completar el backend para producción

El backend funciona, pero estos puntos lo dejan listo para uso real en la botica.
Orden recomendado:

### 2.1 Migraciones versionadas (en vez de `db push`)
Hoy las tablas se crean con `db push` (rápido para arrancar). Para producción,
generar migraciones versionadas:
```
docker compose exec api npx prisma migrate dev --name init
```
Esto crea `prisma/migrations/` que se versiona en git y se aplica con
`prisma migrate deploy` en cada despliegue.

### 2.2 Índices de búsqueda por texto (pg_trgm)
Para que la búsqueda del POS sea rápida con muchos productos, crear los índices
GIN documentados en `schema.prisma` (Producto.nombre y principioActivo).

### 2.3 Refresh token con revocación
Hoy el refresh es stateless (escala bien, pero no se puede "cerrar sesión" de
forma forzada). Si se requiere revocación, guardar un hash del refresh token por
usuario y validarlo al refrescar.

### 2.4 Rate limiting + seguridad HTTP
Agregar `@nestjs/throttler` (límite de intentos de login) y `helmet`
(cabeceras de seguridad).

### 2.5 Auditoría de acciones sensibles
Tabla de auditoría (quién hizo qué y cuándo): anulaciones, cambios de precio,
ajustes de stock, cierres de caja. Vía interceptor NestJS.

### 2.6 SUNAT real (reemplazar el stub)
Implementar `NubefactProvider` o `BizlinksProvider` con el contrato `PseProvider`
ya definido (mismo `enviar`/`consultarEstado`), y cambiar el `provide` en
`SunatModule`. Mover el envío a una **cola (BullMQ + Redis)** para no bloquear la
venta.

### 2.7 Colas con Redis (BullMQ)
Para tareas lentas (SUNAT, emails, reportes pesados): `@nestjs/bullmq`. Redis ya
está corriendo en el compose.

### 2.8 Tests end-to-end (e2e)
Pruebas que levantan la app y prueban flujos completos (login → vender → cerrar
caja) con `supertest`. Carpeta `test/`.

### 2.9 Backups automáticos de PostgreSQL
Job diario de `pg_dump` (cron) con retención. Crítico para datos de ventas.

---

## PARTE 3 — Conectar el frontend Angular al backend

El front ya tiene los servicios con HTTP comentado. Se conecta **módulo por
módulo**, probando cada uno antes de pasar al siguiente, para no romper nada.

### 3.0 Preparación (una vez)
- Crear `environment.ts` con `apiUrl = 'http://localhost:3000/api/v1'`.
- Crear un **HttpInterceptor** que agregue el header `Authorization: Bearer <token>`
  a cada petición y maneje el 401 (refrescar token o mandar al login).
- Proveer `HttpClient` (provideHttpClient) en la app.

### 3.1 Login (AuthService) — PRIMERO
- Reemplazar el login mock por `POST /auth/login`.
- Guardar `accessToken`/`refreshToken` y los datos del usuario.
- Conectar `authGuard` y `rolGuard` con los roles reales del token.
- **Probar:** iniciar sesión con admin y navegar.

### 3.2 Catálogo (ProductoService)
- `buscar` → `GET /productos/buscar?q=`
- `buscarAgrupado` → `GET /productos/agrupado?q=`
- listado/alta/edición → `GET/POST/PATCH /productos`
- **Probar:** que el POS liste y busque productos reales.

### 3.3 Inventario / Stock (StockSucursalService)
- `stockEn/stockGlobal` → `GET /inventario/stock/...`
- lotes/FEFO/alertas → endpoints de `/inventario`
- **Probar:** que el POS muestre stock y días por vencer reales.

### 3.4 Ventas (POS) — el corazón
- Registrar venta → `POST /ventas` (con items, pagos, idempotencyKey).
- Historial de ventas → `GET /ventas` (reemplaza el mock desconectado).
- **Probar:** vender de verdad y que descuente stock (FEFO) y genere comprobante.

### 3.5 Caja (CajaService)
- abrir/movimientos/cerrar/resumen → endpoints `/caja`.
- Reporte Z imprimible → `GET /caja/:id/reporte-z`.
- **Probar:** abrir caja, vender, cerrar con arqueo.

### 3.6 Dashboard / Reportes
- KPIs → `GET /reportes/kpis/:sucursalId` (ya devuelve datos reales).
- top productos, ventas por día, margen.

### 3.7 Clientes, Sucursales, Usuarios (administración)
- CRUD conectados a sus endpoints.

### 3.8 SUNAT (emisión)
- Botón "emitir comprobante" → `POST /sunat/emitir/:ventaId`.

---

## Checklist "sistema completo"
- [ ] Parte 1 (verificación) en verde: tsc, tests, prisma validate.
- [ ] Migraciones versionadas creadas.
- [ ] Frontend conectado: login, catálogo, inventario, ventas, caja, dashboard.
- [ ] SUNAT real integrado (PSE de producción) + colas.
- [ ] Seguridad: rate limit, helmet, auditoría.
- [ ] Backups automáticos.
- [ ] Despliegue/hosting definido (cuando se decida salir de local).

---

## Orden sugerido de trabajo
1. **Parte 1** (verificar que no hay errores) — ahora.
2. **Parte 3.0 a 3.4** (conectar login → catálogo → inventario → ventas) — el mayor
   valor visible: el POS funcionando con datos reales.
3. **Parte 2.1** (migraciones) en cuanto el esquema se estabilice.
4. Resto de Parte 3 (caja, dashboard, administración).
5. **Parte 2** (producción: SUNAT real, colas, seguridad, backups).
6. **Parte 4 / Fase 9** (MCP) — opcional, una vez el sistema base esté andando.

---

## PARTE 4 (Fase 9) — Servidor MCP (asistente IA sobre FarmaSys)

Objetivo: exponer las capacidades de FarmaSys como **herramientas MCP** para que un
asistente de IA (Claude) pueda consultar y operar la botica en lenguaje natural
("¿cuánto stock de paracetamol queda?", "¿cuánto se vendió hoy?").

### Arquitectura
- Un **servidor MCP** independiente (TypeScript, SDK oficial `@modelcontextprotocol/sdk`)
  que es una **capa delgada**: traduce cada herramienta en una llamada a la API REST
  de NestJS ya existente. No se reescribe el backend.
- Corre como un servicio más en `docker-compose` (o local), junto al API.
- Se autentica con un **usuario de servicio** (rol limitado) y su token JWT.

### Herramientas — Etapa 1 (solo lectura, seguras)
- `buscar_producto(q)` → `GET /productos/buscar`
- `stock_producto(productoId, sucursalId)` → `GET /inventario/stock/...`
- `proximos_a_vencer(sucursalId, dias)` → `GET /inventario/proximos-vencer/...`
- `alertas_stock_bajo(sucursalId)` → `GET /inventario/alertas-stock/...`
- `kpis(sucursalId, desde, hasta)` → `GET /reportes/kpis/...`
- `top_productos(sucursalId)` → `GET /reportes/top-productos/...`
- `ventas(sucursalId, desde, hasta)` → `GET /ventas`

### Herramientas — Etapa 2 (escritura, con más control)
- `registrar_compra(...)` → `POST /compras`
- `ajustar_stock(...)` → `POST /inventario/ajuste`
- (Ventas y caja se dejan al POS; no se exponen por IA salvo decisión explícita.)

### Seguridad
- Token de servicio con permisos mínimos (idealmente un rol "REPORTES"/lectura).
- Lista blanca de herramientas; las de escritura desactivadas por defecto.
- Registrar (auditar) cada llamada del MCP.

### Pasos
1. Carpeta `mcp-server/` con el SDK MCP.
2. Cliente HTTP que reusa la API y guarda el token de servicio.
3. Definir las herramientas de la Etapa 1 (lectura).
4. Probar con un cliente MCP (p.ej. Claude Desktop / Cowork).
5. Etapa 2 (escritura) cuando se valide la Etapa 1.
