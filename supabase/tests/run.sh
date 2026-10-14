#!/usr/bin/env bash
# Prueba las migraciones y las políticas RLS en un Postgres temporal.
# Requiere los binarios de PostgreSQL (initdb, pg_ctl, psql) en el sistema.
# Uso: bash supabase/tests/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
if [[ -z "$PG_BIN" || ! -x "$PG_BIN/initdb" ]]; then
  echo "No encuentro initdb. Define PG_BIN con la carpeta de binarios de PostgreSQL." >&2
  exit 1
fi

WORK="$(mktemp -d)"
PORT="${PGTEST_PORT:-54329}"
RUN_AS=()
# initdb no puede ejecutarse como root: usa el usuario postgres si existe.
if [[ "$(id -u)" == "0" ]]; then
  chown -R postgres "$WORK"
  RUN_AS=(sudo -u postgres)
  command -v sudo >/dev/null || RUN_AS=(su postgres -s /bin/bash -c)
fi

run() {
  if [[ "${RUN_AS[0]:-}" == "su" ]]; then "${RUN_AS[@]}" "$*"; else "${RUN_AS[@]}" "$@"; fi
}

cleanup() { run "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

run "$PG_BIN/initdb" -D "$WORK/data" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
run "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

echo "• Supabase simulado"
"${PSQL[@]}" -f "$HERE/_supabase_stub.sql"

for f in "$ROOT"/migrations/*.sql; do
  echo "• Migración $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

status=0
for f in "$HERE"/[0-9]*.sql; do
  echo "• Prueba $(basename "$f")"
  if "${PSQL[@]}" -f "$f" >"$WORK/out" 2>&1; then
    sed -n 's/.*NOTICE:  /  /p' "$WORK/out"
  else
    sed -n 's/.*NOTICE:  /  /p; /ERROR/p' "$WORK/out"
    status=1
  fi
done

if [[ $status -eq 0 ]]; then echo "✔ Todas las pruebas de base de datos pasaron"; else echo "✘ Fallaron pruebas de base de datos"; fi
exit $status
