#!/bin/bash
set -e

COMPOSE="docker compose -f docker-compose.test.yml"
SEMAPHORE_URL="http://localhost:3000"
MCP_URL="http://localhost:3001"

cleanup() {
  echo "Cleaning up..."
  $COMPOSE down -v 2>/dev/null
}
trap cleanup EXIT

echo "=== Starting Semaphore ==="
$COMPOSE up -d semaphore
echo "Waiting for Semaphore to be healthy..."
for i in $(seq 1 60); do
  if curl -sf "$SEMAPHORE_URL/api/ping" >/dev/null 2>&1; then
    echo "Semaphore is ready"
    break
  fi
  [ "$i" -eq 60 ] && echo "Semaphore failed to start" && exit 1
  sleep 2
done

echo ""
echo "=== Generating API token ==="
COOKIE=$(mktemp)
curl -sf -c "$COOKIE" -X POST "$SEMAPHORE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"auth":"admin","password":"changeme123"}'

TOKEN=$(curl -sf -b "$COOKIE" -X POST "$SEMAPHORE_URL/api/user/tokens" \
  -H "Content-Type: application/json" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
rm -f "$COOKIE"
echo "Token: ${TOKEN:0:8}..."

echo ""
echo "=== Starting MCP server ==="
export SEMAPHORE_API_TOKEN="$TOKEN"
$COMPOSE up -d mcp
sleep 3

echo ""
echo "=== Running E2E tests ==="
MCP_URL="$MCP_URL" npx vitest run tests/e2e/ --reporter=verbose
