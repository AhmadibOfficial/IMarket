#!/usr/bin/env bash
# Deterministic local developer automation, no deployment or payment activation.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
command="${1:-doctor}"
case "$command" in
  doctor)
    command -v node >/dev/null || { echo 'Node.js required'; exit 1; }
    command -v python3 >/dev/null || { echo 'Python 3 required'; exit 1; }
    npm run check:offline
    ;;
  setup)
    command -v docker >/dev/null || { echo 'Install Docker + Compose on Kali'; exit 1; }
    command -v npm >/dev/null || { echo 'npm is required'; exit 1; }
    docker compose up -d postgres
    for attempt in {1..30}; do
      docker compose exec -T postgres pg_isready -U imarket -d imarket >/dev/null 2>&1 && break
      sleep 2
    done
    docker compose exec -T postgres pg_isready -U imarket -d imarket
    npm install --no-fund
    npm run db:migrate
    ;;
  start-api)
    npm run dev:api
    ;;
  start-web)
    npm run dev:web
    ;;
  validate)
    npm run ci
    ;;
  plan)
    npm run next-task
    ;;
  *)
    echo 'Usage: ./scripts/autobuild.sh {doctor|setup|start-api|start-web|validate|plan}'
    exit 2
    ;;
esac
