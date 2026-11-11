#!/usr/bin/env bash
# Preflight ONLY. No DDL, network setup or DB mutations.
set -euo pipefail
stop(){ printf 'STOP: %s\n' "$1" >&2; exit 2; }
[[ "${NEXA_GATE_C_SYNTHETIC:-}" == "YES" ]] || stop "Synthetic-only approval flag missing"
[[ "${PGHOST:-}" == "127.0.0.1" ]] || stop "PGHOST must be 127.0.0.1"
[[ "${PGHOSTADDR:-127.0.0.1}" == "127.0.0.1" ]] || stop "PGHOSTADDR not loopback"
[[ "${PGDATABASE:-}" == nexa_gate_c_lab_* ]] || stop "Not a disposable Gate C database"
[[ -z "${PGSERVICE:-}" && -z "${PGSERVICEFILE:-}" ]] || stop "PGSERVICE forbidden"
[[ -z "${SUPABASE_URL:-}" && -z "${SUPABASE_DB_URL:-}" &&
   -z "${DATABASE_URL:-}" && -z "${OPENAI_API_KEY:-}" ]] ||
   stop "Remote/service credentials present in shell"
command -v psql >/dev/null 2>&1 || stop "psql unavailable locally"
command -v pg_isready >/dev/null 2>&1 || stop "pg_isready unavailable"
export PGSSLMODE=disable
pg_isready -h 127.0.0.1 -p "${PGPORT:-5432}" -d "$PGDATABASE" >/dev/null ||
 stop "local PostgreSQL not ready"
got="$(psql -X -qAt -h 127.0.0.1 -p "${PGPORT:-5432}" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -c 'select current_database() || chr(124) || coalesce(inet_server_addr()::text,chr(45));' 2>/dev/null)" ||
 stop "local database connection failed"
[[ "$got" == "$PGDATABASE|127.0.0.1" ]] || stop "connected to a non-loopback server"
printf 'PASS: isolated-LAB locator and local PostgreSQL connection.\n'
printf 'NOT PROVEN: outbound network blocked, authenticity of private schema, C01-C10.\n'
printf 'No SQL mutation was performed.\n'
