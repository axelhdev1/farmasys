# FarmaSys — Backend (NestJS + Prisma + PostgreSQL)

API de la botica. Por ahora se corre **solo en tu computadora** (local). El servidor/hosting se verá después.

## Requisitos (instalar una vez en Windows)
1. **Node.js 20+** → https://nodejs.org (instalador LTS).
2. **PostgreSQL 16** → https://www.postgresql.org/download/windows/
   - Durante la instalación, anota el usuario (por defecto `postgres`) y la **contraseña** que elijas.
   - Abre **pgAdmin** (viene con Postgres) y crea una base de datos llamada **`farmasys`**.

## Configuración del proyecto
Desde la carpeta `backend/`:

```bash
# 1. Instala dependencias
npm install

# 2. Crea tu archivo de entorno a partir del ejemplo
copy .env.example .env
#   Luego edita .env y pon tu contraseña real de Postgres en DATABASE_URL
#   Ej: postgresql://postgres:TU_PASSWORD@localhost:5432/farmasys?schema=public

# 3. Crea las tablas en la base (primera migración)
npm run prisma:migrate
#   Cuando pida un nombre, escribe: init

# 4. (Opcional) Datos de prueba mínimos
npm run db:seed

# 5. Arranca el API en modo desarrollo (se reinicia al guardar)
npm run start:dev
```

## Pruebas
```bash
npm test            # tests unitarios (jest)
npm run test:cov    # con cobertura
```

## Documentación de la API (Swagger)
Con el API corriendo, abre **http://localhost:3000/api/docs**. Verás todos los
endpoints por dominio, podrás autenticarte con el botón **Authorize** (pega el
`accessToken` del login) y probar las llamadas.

Login de prueba (tras `db:seed`):
```
POST /api/v1/auth/login
{ "email": "admin@farmasys.pe", "password": "Admin1234!" }
```

## Docker (opcional, todo en uno)
Levanta API + PostgreSQL + Redis con un solo comando:
```bash
docker compose up --build
```
El API aplica migraciones automáticamente y queda en http://localhost:3000/api/v1.

## Verificar que funciona
Abre en el navegador:  **http://localhost:3000/api/v1/health**

Deberías ver algo como:
```json
{ "status": "ok", "service": "farmasys-backend", "db": "ok", "time": "..." }
```
Si `db` dice `"ok"`, la conexión a PostgreSQL está bien.

## Comandos útiles
- `npm run prisma:studio` → abre una interfaz web para ver/editar la base de datos.
- `npm run prisma:migrate` → aplica cambios del esquema (`prisma/schema.prisma`).
- `npm run build` / `npm run start:prod` → compilar y correr en producción (más adelante).

## Estructura
```
backend/
  prisma/
    schema.prisma   ← modelo de la base de datos (tablas)
    seed.ts         ← datos iniciales mínimos
  src/
    main.ts         ← arranque (CORS, validación, prefijo /api/v1)
    app.module.ts   ← módulo raíz (aquí se agregan los módulos por dominio)
    app.controller.ts ← endpoint /health
    prisma/         ← servicio Prisma compartido
  .env.example      ← plantilla de variables de entorno
```

## Módulos implementados (por dominio)
| Dominio | Prefijo | Qué hace |
|---|---|---|
| Auth | `/auth` | Login JWT (access+refresh), `/me`, guards rol + scope. |
| Usuarios | `/usuarios` | CRUD, roles, sucursal, soft-delete (solo ADMIN). |
| Sucursales | `/sucursales` | CRUD, series de comprobante, baja lógica. |
| Productos | `/productos` | CRUD + presentaciones, IGV, búsqueda y agrupado (POS). |
| Inventario | `/inventario` | Stock, lotes, FEFO, alertas, ajustes, merma. |
| Compras | `/compras` | Proveedores + ingreso transaccional (lotes, costo promedio). |
| Ventas | `/ventas` | Venta transaccional (FEFO, pago mixto, correlativo atómico, idempotencia), anulación. |
| Caja | `/caja` | Abrir/movimientos/cierre arqueo, resumen, reporte Z. |
| Clientes | `/clientes` | CRUD, validación DNI/RUC (dígito verificador). |
| Reportes | `/reportes` | KPIs dashboard, top productos, ventas/día, margen. |
| SUNAT | `/sunat` | Comprobante electrónico (PSE intercambiable), nota de crédito. |

## Reglas críticas respetadas
Dinero `Decimal` (nunca float) · transacciones atómicas en venta/compra ·
correlativos atómicos · soft-delete · validación RUC/DNI · idempotencia de cobro ·
índices en FKs y búsquedas · API stateless (JWT) lista para escalar horizontalmente.

## Producción / escalado
- **Docker Compose**: `api` + `postgres` + `redis` (ver `docker-compose.yml`).
- **Redis**: reservado para caché de catálogo y colas (BullMQ) de tareas lentas
  (envío a SUNAT, emails).
- **SUNAT/PSE**: el proveedor se inyecta por contrato (`PseProvider`); en local
  usa un stub. Para producción, implementar `NubefactProvider`/`BizlinksProvider`
  con el mismo contrato y cambiar el `provide` en `SunatModule`.
- **Búsqueda por texto**: para coincidencias parciales rápidas en producción,
  crear índices GIN `pg_trgm` (ver nota en `prisma/schema.prisma`).
