#!/usr/bin/env bash
# Genera un archivo único por función (para desplegar desde el editor del panel de
# Supabase sin CLI). Las dependencias npm: quedan como imports externos.
# Uso: bash supabase/functions/bundle.sh
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
for f in food-photo workout-plan assistant-chat; do
  deno bundle --platform deno --external 'npm:*' -o "dist/$f.js" "$f/index.ts" >/dev/null
  echo "✔ dist/$f.js ($(wc -c <"dist/$f.js") bytes)"
done
