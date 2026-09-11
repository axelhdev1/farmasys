# FarmaSys — Seguridad y Producción (Fase 2)

Guía para dejar el sistema listo y seguro antes de entregarlo a un cliente.
Se divide en **lo que ya está hecho por código** y **lo que tú debes hacer en el servidor**.

---

## ✅ Ya implementado (código)

| Protección | Qué hace |
|-----------|----------|
| **Rate-limit en login** | Máx. 5 intentos/min por IP (refresh: 10/min). Frena ataques de fuerza bruta. Devuelve `429 Too Many Requests`. |
| **Helmet** | Cabeceras de seguridad HTTP (anti-clickjacking, sniffing, etc.). |
| **Fail-fast de secretos** | Con `NODE_ENV=production`, el API **se niega a arrancar** si los secretos JWT son débiles o de prueba. |
| **Swagger solo en dev** | La documentación de la API (`/api/docs`) no se expone en producción. |
| **Validación de caja en venta** | Una venta solo se asocia a una caja del **propio cajero**, de su sucursal y **abierta**. Evita colgar ventas a cajas ajenas o cerradas. |
| **Secretos fuertes** | El `.env` ya trae secretos aleatorios de 64 caracteres (reemplazaron los placeholders). |

> Para activar todo esto: reconstruye el contenedor →
> `docker compose up -d --build api`

---

## 🔧 Lo que debes hacer en el servidor (operativo)

### 1. Secretos propios para producción
Los secretos del `.env` actual sirven para tu desarrollo. **Para el servidor real, genera otros nuevos** (los actuales ya quedaron en historiales de chat/repos):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_ACCESS_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_REFRESH_SECRET
```

Ponlos en el `.env` del servidor y añade:
```
NODE_ENV=production
```
Si te equivocas (secreto débil), el API no arranca — esa es la red de seguridad.

### 2. Contraseña real de PostgreSQL
Hoy usa `postgres/postgres` (default). En el servidor define:
```
POSTGRES_USER=farmasys
POSTGRES_PASSWORD=<contraseña-fuerte>
POSTGRES_DB=farmasys
```
y actualiza `DATABASE_URL` en consecuencia.

### 3. Migraciones versionadas (reemplazar `db push`)
`db push` es ideal mientras desarrollas, pero en producción conviene historial de
migraciones para no perder datos:

```bash
# La primera vez (con la BD ya creada por db push), se hace un "baseline":
npx prisma migrate dev --name init      # genera la migración inicial
# En el servidor, en cada despliegue:
npx prisma migrate deploy
```
Luego puedes quitar `--accept-data-loss` del `CMD` del Dockerfile.

### 4. Backups automáticos de la base
Respaldo diario con `pg_dump` (ejemplo con cron en el host):

```bash
# /etc/cron.d/farmasys-backup  → cada día a las 2:00 am
0 2 * * *  docker exec backend-postgres-1 pg_dump -U farmasys farmasys | gzip > /backups/farmasys_$(date +\%F).sql.gz
```
Guarda los backups **fuera del servidor** (otro disco / nube) y prueba restaurarlos.

### 5. HTTPS + dominio (reverse proxy)
Nunca expongas el API en HTTP plano. Pon un reverse proxy delante (Caddy es el más
simple — HTTPS automático):

```
# Caddyfile
api.tubotica.com {
    reverse_proxy localhost:3000
}
```
Y ajusta `CORS_ORIGIN` al dominio real del frontend.

### 6. Logs y monitoreo
- Centraliza logs del contenedor (`docker compose logs` → archivo / servicio).
- Un monitor de uptime (UptimeRobot, healthchecks.io) apuntando a `/api/v1/health`.

---

## 📋 Checklist antes de entregar al cliente

- [ ] `NODE_ENV=production` en el servidor.
- [ ] Secretos JWT nuevos y fuertes (no los del repo).
- [ ] Contraseña de PostgreSQL cambiada.
- [ ] Migraciones con `prisma migrate deploy` (no `db push`).
- [ ] Backup diario funcionando y **restauración probada**.
- [ ] HTTPS activo + `CORS_ORIGIN` con el dominio real.
- [ ] Swagger inaccesible en producción (ya automático con `NODE_ENV=production`).
- [ ] Monitor de uptime configurado.
- [ ] Usuario admin del cliente creado con contraseña propia (no la del seed).

---

*Relacionados: `ROADMAP-FARMASYS.md` (Fase 2), `PLAN-SUCURSALES.md`.*
