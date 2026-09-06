#!/usr/bin/env bash
set -euo pipefail
docker compose ps
curl -fsS http://127.0.0.1:8787/healthz
echo
docker compose exec -T gateway lark-cli --version
docker compose exec -T gateway lark-cli auth status --verify --format json
