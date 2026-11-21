#!/usr/bin/env bash
# Runs the Cloudflare Pages site locally on workerd (wrangler pages dev) with a throwaway local D1,
# applies the schema + dev migration, then runs cloudflare/tests/e2e-pages-runtime.mjs.
# Uses only generated test secrets; never touches a remote database.
#   WRANGLER=/path/to/wrangler tools/e2e-local.sh
set -euo pipefail
cd "$(dirname "$0")/.."
WRANGLER="${WRANGLER:-npx --yes wrangler@3}"
PORT="${PORT:-8788}"
STATE="$(mktemp -d)"
PASS="e2e-$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
SALT="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)"
cleanup(){ pkill -f "pages dev public --port $PORT" 2>/dev/null || true; pkill -f workerd 2>/dev/null || true; rm -rf "$STATE"; }
trap cleanup EXIT
export WRANGLER_SEND_METRICS=false
$WRANGLER pages dev public --port "$PORT" --compatibility-date=2026-11-01 --persist-to "$STATE" \
  --d1 DEV_DB=e2e-local --binding DEPLOYMENT_ENV=development \
  --binding "RATE_LIMIT_SALT=$SALT" --binding "ADMIN_PASSWORD=$PASS" >"$STATE/server.log" 2>&1 &
for _ in $(seq 1 90); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 1; done
curl -s -o /dev/null "http://127.0.0.1:$PORT/api/health"   # materialise the local D1 file
DB="$(find "$STATE" -name '*.sqlite' | head -1)"
python3 - "$DB" <<'EOF'
import sqlite3,sys
c=sqlite3.connect(sys.argv[1])
for f in ['cloudflare/schema.sql','cloudflare/schema-community.sql','cloudflare/migrations/20261120-single-reaction-dev.sql']:
    c.executescript(open(f,encoding='utf-8').read())
c.commit()
EOF
BASE_URL="http://localhost:$PORT" ADMIN_PASSWORD="$PASS" node cloudflare/tests/e2e-pages-runtime.mjs
