#!/usr/bin/env bash
# Prueba las migraciones de supabase/migrations en un Postgres local desechable:
# simula lo mínimo de Supabase, aplica las migraciones y ejecuta supabase/tests.
set -euo pipefail
shopt -s nullglob

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$PGBIN/initdb" ] || { echo "No encuentro Postgres (define PGBIN)"; exit 1; }

TMP="$(mktemp -d)"
PUERTO="${PUERTO:-54329}"
COMO=()
if [ "$(id -u)" = "0" ]; then
  chown postgres "$TMP"
  COMO=(runuser -u postgres --)
fi

limpiar() { "${COMO[@]}" "$PGBIN/pg_ctl" -D "$TMP/datos" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap limpiar EXIT

"${COMO[@]}" "$PGBIN/initdb" -D "$TMP/datos" -U postgres --auth=trust >/dev/null
"${COMO[@]}" "$PGBIN/pg_ctl" -D "$TMP/datos" -o "-p $PUERTO -k $TMP -c listen_addresses=''" -l "$TMP/log" start >/dev/null

PSQL=("$PGBIN/psql" -h "$TMP" -p "$PUERTO" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

echo "== Simulación de Supabase"
"${PSQL[@]}" -f "$RAIZ/supabase/tests/00_stub_supabase.sql"

for f in "$RAIZ"/supabase/migrations/*.sql; do
  echo "== Migración $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

for f in "$RAIZ"/supabase/tests/[1-9]*.sql; do
  echo "== Pruebas $(basename "$f")"
  "${PSQL[@]}" -f "$f" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
done

echo "== Paridad con src/lib/identificativos.ts"
node "$RAIZ/scripts/sql-casos-identificativos.mjs" | "${PSQL[@]}" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'

echo "Todas las pruebas de base de datos han pasado."
