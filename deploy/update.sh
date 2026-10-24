#!/usr/bin/env bash
# Uso en la carpeta de Dockge: bash update.sh ghcr.io/yianfri/routale:sha-COMMIT
set -euo pipefail
image="${1:?Indica una imagen exacta}"
if [[ ! "$image" =~ ^ghcr\.io/[a-z0-9_-]+/[a-z0-9_-]+(:sha-[a-f0-9]{40}|@sha256:[a-f0-9]{64})$ ]]; then
  printf '%s\n' 'Se necesita una etiqueta de commit o un digest válido de GHCR.' >&2
  exit 1
fi
if [[ ! -f compose.yaml || ! -f .env ]]; then
  printf '%s\n' 'Ejecuta dentro de la stack con compose.yaml y .env preparados.' >&2
  exit 1
fi
previous="$(sed -n 's/^BITACORA_IMAGE=//p' .env)"
cp .env .env.previous
# Descarga primero. Si falla, la aplicación anterior sigue funcionando.
docker pull "$image"
awk -v image="$image" 'BEGIN { found=0 } /^BITACORA_IMAGE=/ { print "BITACORA_IMAGE=" image; found=1; next } { print } END { if(!found) print "BITACORA_IMAGE=" image }' .env > .env.next
mv .env.next .env
if ! docker compose up -d --wait --wait-timeout 90; then
  cp .env.previous .env
  docker compose up -d --wait --wait-timeout 90
  printf '%s\n' "La actualización falló; se volvió a $previous." >&2
  exit 1
fi
printf '%s\n' "Routale actualizada a $image. La copia anterior de .env permite volver atrás."
