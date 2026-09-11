# Imagen Debian (slim): Prisma funciona sin problemas de OpenSSL/musl.
FROM node:20-slim
WORKDIR /app

# OpenSSL: requerido por el motor de Prisma.
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Dependencias (todas: el contenedor también corre migraciones y seed).
COPY package*.json ./
RUN npm install

# Cliente Prisma a partir del esquema.
COPY prisma ./prisma
RUN npx prisma generate

# Código y build.
COPY . .
RUN npm run build

EXPOSE 3000

# Healthcheck contra /api/v1/health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Crea/sincroniza las tablas desde el esquema y arranca el API.
# (db push: ideal en el primer arranque, no requiere archivos de migración.)
# --accept-data-loss: db push marca como "posible pérdida" cualquier cambio de
# constraint (p. ej. añadir un UNIQUE). En este proyecto los cambios de esquema
# son aditivos (columnas nuevas), así que es seguro aplicarlos sin intervención.
# Para producción real conviene migrar a `prisma migrate` con historial versionado.
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node dist/main"]
