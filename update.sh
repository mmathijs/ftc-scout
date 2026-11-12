#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

echo "==> Building server image (common + server)"
docker compose build server

echo "==> Starting server"
docker compose up -d server

SERVER_PORT="$(grep -E '^PORT=' packages/server/.env | cut -d= -f2 | tr -d '"' | tr -d '[:space:]')"
SERVER_PORT="${SERVER_PORT:-4005}"

echo "==> Waiting for server to become ready on port ${SERVER_PORT}"
ready=""
for _ in $(seq 1 60); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${SERVER_PORT}/graphql" || true)"
    if [ -n "$code" ] && [ "$code" != "000" ]; then
        ready="1"
        break
    fi
    sleep 1
done
if [ -z "$ready" ]; then
    echo "Server did not become ready on port ${SERVER_PORT} in time" >&2
    exit 1
fi
echo "Server is up."

echo "==> Building web image (common + web:gen against local server + web build)"
docker compose build web

echo "==> Starting web"
docker compose up -d web

echo "==> Cleaning up dangling images"
docker image prune -f

echo "==> Done."
docker compose ps
