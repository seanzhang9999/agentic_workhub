#!/usr/bin/env bash
set -euo pipefail
if [[ "$(id -u)" -eq 0 ]]; then echo "Run as a normal sudo-capable deployment user, not root." >&2; exit 1; fi
command -v git >/dev/null || { echo "git is required" >&2; exit 1; }
command -v docker >/dev/null || { echo "Docker Engine is required" >&2; exit 1; }
docker compose version >/dev/null || { echo "Docker Compose v2 is required" >&2; exit 1; }
if [[ ! -f .env ]]; then cp .env.example .env; echo "Created .env. Set AWIKI_ROOT_NODE_TOKEN, then rerun." >&2; exit 2; fi
if grep -q 'AWIKI_ROOT_NODE_TOKEN=wikcn_REPLACE_ME' .env; then echo "Set the real AWIKI_ROOT_NODE_TOKEN in .env." >&2; exit 2; fi
docker compose build --pull
echo "Open the printed URL to configure the Feishu application."
docker compose run --rm --entrypoint lark-cli gateway config init --new
echo "Open the printed URL to authorize the Feishu user."
docker compose run --rm --entrypoint lark-cli gateway auth login --recommend
docker compose up -d
docker compose exec -T gateway lark-cli auth status --verify --format json
curl -fsS http://127.0.0.1:8787/healthz
echo
echo "Healthy: http://127.0.0.1:8787/mcp. Next create a Secure MCP Tunnel to this URL."
