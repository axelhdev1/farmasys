# FarmaSys Backend — Guía de arranque (paso a paso)

Dos caminos. Elige uno:
- **Opción A — Docker** (recomendada): un solo comando levanta API + base de datos + Redis. No instalas PostgreSQL.
- **Opción B — Manual**: instalas Node y PostgreSQL tú mismo. Útil si no quieres Docker.

---

## Opción A — Con Docker (la más fácil)

### Paso A1. Instalar Docker Desktop
- Descárgalo de https://www.docker.com/products/docker-desktop
- Instálalo, reinicia si lo pide, y **ábrelo** (debe quedar corriendo, ícono de ballena en la barra).

### Paso A2. Abrir una terminal en la carpeta `backend`
- Abre la carpeta `sistema-botica\backend` en el Explorador de Windows.
- En la barra de dirección escribe `cmd` y presiona Enter (abre la terminal ya ubicada ahí).

### Paso A3. Crear el archivo `.env`
En la terminal:
```
copy .env.example .env
```
Luego ábrelo con el Bloc de notas:
```
notepad .env
```
Cambia estas líneas por valores seguros (los secretos pueden ser cualquier texto largo):
- `JWT_ACCESS_SECRET="..."` → pon una cadena larga y aleatoria.
- `JWT_REFRESH_SECRET="..."` → otra cadena distinta.

Para generar cadenas aleatorias, en otra terminal:
```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
(Con Docker NO necesitas tocar `DATABASE_URL`: el compose ya conecta a su propia base.)

Guarda y cierra el Bloc de notas.

### Paso A4. Levantar todo
```
docker compose up --build
```
- La primera vez tarda unos minutos (descarga imágenes y compila).
- Verás logs. Cuando aparezca **"FarmaSys API escuchando en http://localhost:3000/api/v1"**, está listo.
- El API crea las tablas automáticamente (migraciones).

### Paso A5. Cargar datos de prueba (admin + catálogo)
Abre **otra** terminal en `backend` y ejecuta:
```
docker compose exec api npm run db:seed
```
Esto crea el usuario admin y productos demo.

### Paso A6. Verificar (ver "Verificación" más abajo)

### Para apagar
En la terminal de los logs presiona `Ctrl + C`, y si quieres liberar todo:
```
docker compose down
```

---

## Opción B — Manual (sin Docker)

### Paso B1. Instalar Node.js 20+
- Descarga el instalador **LTS** de https://nodejs.org e instálalo.
- Verifica en una terminal: `node -v` (debe decir v20 o superior).

### Paso B2. Instalar PostgreSQL 16
- Descarga de https://www.postgresql.org/download/windows/
- Durante la instalación, **anota la contraseña** que pongas al usuario `postgres`.
- Al terminar, abre **pgAdmin** (se instala junto) y crea una base de datos llamada **`farmasys`**.

### Paso B3. Abrir terminal en `backend`
- Carpeta `sistema-botica\backend` → en la barra de dirección escribe `cmd` + Enter.

### Paso B4. Instalar dependencias
```
npm install
```
(Tarda un poco la primera vez.)

### Paso B5. Crear y editar `.env`
```
copy .env.example .env
notepad .env
```
Cambia:
- `DATABASE_URL` → pon tu contraseña real de Postgres. Ejemplo:
  `postgresql://postgres:TU_PASSWORD@localhost:5432/farmasys?schema=public`
- `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` → cadenas largas distintas
  (genera con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).

Guarda y cierra.

### Paso B6. Crear las tablas (migración)
```
npm run prisma:migrate
```
Cuando pida un nombre, escribe: **init** y Enter.
Esto crea todas las tablas e índices en la base `farmasys`.

### Paso B7. Cargar datos de prueba
```
npm run db:seed
```

### Paso B8. Arrancar el API
```
npm run start:dev
```
Déjalo corriendo (se reinicia solo cuando guardas cambios).

---

## Verificación (vale para A y B)

### 1. ¿El API está vivo?
Abre en el navegador: **http://localhost:3000/api/v1/health**
Debe mostrar algo como:
```json
{ "status": "ok", "service": "farmasys-backend", "db": "ok", "time": "..." }
```
Si `db` dice `"ok"`, la base de datos conecta bien.

### 2. Probar el login y la documentación
Abre: **http://localhost:3000/api/docs** (Swagger).
- Busca **POST /auth/login**, clic en "Try it out", pega:
  ```json
  { "email": "admin@farmasys.pe", "password": "Admin1234!" }
  ```
- Ejecuta. Copia el valor de `accessToken` de la respuesta.
- Arriba a la derecha, botón **Authorize**, pega el token y confirma.
- Ahora puedes probar cualquier endpoint protegido (productos, ventas, caja...).

### 3. Correr los tests (opcional)
```
npm test
```
(En Docker: `docker compose exec api npm test`.)

---

## Si algo falla
- **Errores al `npm install` o `npm run build`**: cópialos y mándamelos; suelen ser ajustes menores de tipos.
- **`prisma migrate` da error**: cópialo; puede ser una relación a afinar en el esquema.
- **`db` dice "error" en /health**: revisa la contraseña de `DATABASE_URL` (opción B) o que Docker esté corriendo (opción A).
- **Puerto 3000 ocupado**: cambia `PORT` en `.env`.

## Credenciales de prueba
- Usuario: `admin@farmasys.pe`
- Contraseña: `Admin1234!`
(Cámbiala tras el primer login en producción.)
