#!/usr/bin/env bash

set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3000}"
WORKER_TOKEN="${TAKEOFF_RENDER_WORKER_TOKEN:-}"
WORKER_LIMIT="${TAKEOFF_RENDER_WORKER_LIMIT:-2}"
IDLE_SLEEP_SECONDS="${TAKEOFF_RENDER_WORKER_IDLE_SLEEP_SECONDS:-4}"
BUSY_SLEEP_SECONDS="${TAKEOFF_RENDER_WORKER_BUSY_SLEEP_SECONDS:-1}"

if [[ -z "${WORKER_TOKEN}" ]]; then
  echo "TAKEOFF_RENDER_WORKER_TOKEN is required."
  exit 1
fi

echo "Starting takeoff render worker against ${APP_URL}"

while true; do
  response="$(
    curl --silent --show-error --fail \
      -X POST \
      -H "Authorization: Bearer ${WORKER_TOKEN}" \
      "${APP_URL}/api/takeoff/render-jobs/run?limit=${WORKER_LIMIT}"
  )"

  processed_count="$(printf '%s' "${response}" | grep -o '"processedCount":[0-9]*' | head -n1 | cut -d: -f2 || true)"

  if [[ -n "${processed_count}" && "${processed_count}" != "0" ]]; then
    sleep "${BUSY_SLEEP_SECONDS}"
  else
    sleep "${IDLE_SLEEP_SECONDS}"
  fi
done
