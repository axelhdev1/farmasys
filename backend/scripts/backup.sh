#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Respaldo de la base de datos FarmaSys (un volcado).
#
# Genera un archivo comprimido con formato "custom" de PostgreSQL (-Fc), que es
# el que permite restaurar con pg_restore de forma selectiva y ya viene
# comprimido. Aplica rotación: conserva los últimos BACKUP_KEEP y borra el
# resto para que la carpeta no crezca sin control.
#
# Se ejecuta DENTRO del contenedor de respaldo (imagen postgres, que ya trae
# pg_dump). No necesita nada instalado en tu PC.
# ─────────────────────────────────────────────────────────────────────────────
set -eu

DB_HOST="${DB_HOST:-postgres}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-farmasys}"
DEST="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_KEEP:-30}"

# pg_dump lee la contraseña de esta variable de entorno.
export PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"

marca="$(date +%Y-%m-%d_%H%M%S)"
archivo="${DEST}/farmasys_${marca}.dump"

mkdir -p "$DEST"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Respaldando ${DB_NAME} → $(basename "$archivo")"

# -Fc: formato custom comprimido. Se escribe primero a un temporal y solo al
# terminar bien se renombra: así un respaldo cortado a la mitad nunca queda
# como si fuera válido.
tmp="${archivo}.parcial"
if pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -Fc -f "$tmp"; then
  mv "$tmp" "$archivo"
  tam="$(du -h "$archivo" | cut -f1)"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] OK — ${tam}"
else
  rm -f "$tmp"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: el respaldo falló. No se guardó nada." >&2
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# COPIA ESPEJO (fuera del disco de la base).
#
# Un respaldo que vive en el MISMO disco que la base no es un respaldo: salva de
# un borrado accidental, pero no de que ese disco se dañe, lo roben o lo cifre
# un ransomware. Si BACKUP_ESPEJO apunta a una carpeta sincronizada con la nube
# (Google Drive, OneDrive, Dropbox) o a un disco externo, cada respaldo se copia
# ahí automáticamente.
# ─────────────────────────────────────────────────────────────────────────────
if [ -n "${BACKUP_ESPEJO:-}" ]; then
  if mkdir -p "$BACKUP_ESPEJO" 2>/dev/null && cp "$archivo" "$BACKUP_ESPEJO/" 2>/dev/null; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Copia espejo → ${BACKUP_ESPEJO}"
    # El espejo se rota aparte: suele convenir guardar más historia fuera.
    keepEspejo="${BACKUP_ESPEJO_KEEP:-90}"
    totalEsp="$(ls -1 "${BACKUP_ESPEJO}"/farmasys_*.dump 2>/dev/null | wc -l)"
    if [ "$totalEsp" -gt "$keepEspejo" ]; then
      ls -1t "${BACKUP_ESPEJO}"/farmasys_*.dump | tail -n "$((totalEsp - keepEspejo))" \
        | while read -r viejo; do rm -f "$viejo"; done
    fi
  else
    # No se corta el respaldo por esto: el local ya quedó guardado.
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] AVISO: no se pudo copiar a ${BACKUP_ESPEJO}" >&2
  fi
fi

# Rotación: deja solo los BACKUP_KEEP más recientes.
total="$(ls -1 "${DEST}"/farmasys_*.dump 2>/dev/null | wc -l)"
if [ "$total" -gt "$KEEP" ]; then
  sobran=$((total - KEEP))
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Rotación: borrando ${sobran} respaldo(s) antiguo(s) (se conservan ${KEEP})"
  ls -1t "${DEST}"/farmasys_*.dump | tail -n "$sobran" | while read -r viejo; do
    rm -f "$viejo"
    echo "    borrado $(basename "$viejo")"
  done
fi
