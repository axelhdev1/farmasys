# FarmaSys — Guía de puesta en producción

> Objetivo: pasar de "funciona en mi máquina" a "opera con el dinero y el
> inventario de un cliente". Ejecutar EN ORDEN. Los comandos asumen el
> docker-compose actual (api + postgres + redis).

## 1. Migraciones en lugar de `db push` (OBLIGATORIO con datos reales)

Hoy el contenedor arranca con `prisma db push --accept-data-loss`: puede
BORRAR columnas con datos sin avisar. En producción se usa `migrate deploy`.

**Baseline (una sola vez, en tu máquina de desarrollo):**

```bash
cd backend
mkdir -p prisma/migrations/0_init
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
# Marca la baseline como ya aplicada en la BD EXISTENTE (no la vuelve a correr):
npx prisma migrate resolve --applied 0_init
```

**Cambiar el CMD del Dockerfile** (solo después de crear la baseline):

```dockerfile
# ANTES (desarrollo):
# CMD npx prisma db push --skip-generate --accept-data-loss && node dist/main
# DESPUÉS (producción):
CMD npx prisma migrate deploy && node dist/main
```

**De aquí en adelante**, cada cambio de schema en desarrollo se hace con
`npx prisma migrate dev --name descripcion_del_cambio` (genera la migración
que producción aplicará con `migrate deploy`).

## 2. Backups automáticos (diarios + restore probado)

Backup manual (probar YA):

```bash
docker compose exec -T postgres pg_dump -U farmasys -d farmasys -F c -f /tmp/backup.dump
docker compose cp postgres:/tmp/backup.dump ./backups/farmasys-$(date +%F).dump
```

Automatizar en el VPS (crontab, 3 a.m., conserva 14 días):

```bash
0 3 * * * cd /ruta/farmasys/backend && docker compose exec -T postgres pg_dump -U farmasys -d farmasys -F c > backups/farmasys-$(date +\%F).dump && find backups -name "*.dump" -mtime +14 -delete
```

**Restore (ensayarlo antes de necesitarlo):**

```bash
docker compose exec -T postgres pg_restore -U farmasys -d farmasys --clean --if-exists < backups/farmasys-2026-07-13.dump
```

Regla: un backup que nunca se restauró NO es un backup.

## 3. Secretos y entorno

- Generar secretos NUEVOS para el servidor (los de desarrollo ya están quemados):
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- `NODE_ENV=production` (activa el fail-fast de secretos débiles ya implementado).
- `environments/environment.ts` (prod): apuntar `apiUrl` al dominio real.

## 4. HTTPS con Caddy (reverse proxy)

`Caddyfile` mínimo en el VPS (Caddy gestiona los certificados solo):

```
farmasys.tudominio.com {
    reverse_proxy localhost:3000
}
app.tudominio.com {
    root * /var/www/farmasys-front/browser
    file_server
    try_files {path} /index.html
}
```

Front: `ng build --configuration production` → subir `dist/sistema-botica/browser`.

## 5. Índices de búsqueda (con catálogo real)

```bash
docker compose exec -T postgres psql -U farmasys -d farmasys < prisma/sql/pg_trgm.sql
```

## 6. Checklist final antes de entregar

- [ ] Baseline de migraciones creada y CMD cambiado a `migrate deploy`
- [ ] Backup diario en cron + UN restore ensayado con éxito
- [ ] Secretos de producción nuevos, `NODE_ENV=production`
- [ ] HTTPS activo (Caddy), Swagger inaccesible (`/api/docs` responde 404)
- [ ] pg_trgm aplicado
- [ ] Catálogo importado (ver PROCEDIMIENTO-APERTURA.md)
- [ ] Login de prueba por cada rol: el vendedor NO ve Finanzas ni otras sucursales

## Deuda consciente (siguiente iteración)

- Revocación de refresh tokens en Redis (hoy: stateless 7 días; diseño
  sugerido: guardar `jti` por usuario en Redis y validarlo en /auth/refresh,
  invalidar en logout/cambio de contraseña).
- Cookies httpOnly para tokens en lugar de localStorage.
