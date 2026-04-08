#!/bin/sh

set -eu

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

notify_failure() {
  step="$1"
  code="$2"
  log "ERROR: ${step} failed with exit code ${code}"

  if [ -n "${ALERT_WEBHOOK_URL:-}" ] && command -v curl >/dev/null 2>&1; then
    curl -fsS -X POST -H "Content-Type: application/json" \
      -d "{\"text\":\"news-radar cron failed at step '${step}' (exit ${code})\"}" \
      "$ALERT_WEBHOOK_URL" >/dev/null || true
  fi
}

run_step() {
  step="$1"
  shift
  log "Starting: ${step}"
  if "$@"; then
    log "Finished: ${step}"
  else
    code=$?
    notify_failure "$step" "$code"
    exit "$code"
  fi
}

log "Starting scheduled one-shot run"
run_step "pipeline run" make run
run_step "build pages" make build-pages
run_step "database dump" make dump-db
log "Scheduled one-shot run finished successfully"
