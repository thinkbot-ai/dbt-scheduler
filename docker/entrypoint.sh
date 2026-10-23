#!/bin/sh
set -eu

ROLE="${1:-${PROCESS_ROLE:-api}}"
export PROCESS_ROLE="$ROLE"

case "$ROLE" in
  api)
    exec node --import tsx/esm apps/api/src/index.ts
    ;;
  scheduler)
    exec node --import tsx/esm apps/scheduler/src/index.ts
    ;;
  worker)
    exec node --import tsx/esm apps/worker/src/index.ts
    ;;
  web)
    exec npm run dev -w @dbt-scheduler/web -- --host 0.0.0.0 --port 3000
    ;;
  *)
    echo "Unknown process role: $ROLE" >&2
    echo "Expected: api | scheduler | worker | web" >&2
    exit 1
    ;;
esac
