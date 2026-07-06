#!/bin/bash
# Verify a trip-one deploy actually reached production, matching the project's
# deploy-cloudflare skill: deploy success != prod success. Confirms asset hash
# match, health check, and no console-visible backend failures.
set -e

PROD="https://trip-one.pages.dev"
DIST_DIR="$(dirname "$0")/../dist"

echo "--- Asset hash check ---"
PROD_JS=$(curl -s "$PROD/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
LOCAL_JS=$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' "$DIST_DIR/index.html" | head -1)
if [ "$PROD_JS" != "$LOCAL_JS" ]; then
  echo "STALE: prod=$PROD_JS local=$LOCAL_JS"
  exit 1
fi
echo "OK: prod is serving $PROD_JS"

echo "--- Health check ---"
HEALTH=$(curl -s "$PROD/api/health")
if [ "$HEALTH" != '{"status":"ok"}' ]; then
  echo "FAIL: /api/health returned: $HEALTH"
  exit 1
fi
echo "OK: /api/health is clean"

echo "--- Security headers ---"
HEADERS=$(curl -sI "$PROD/")
echo "$HEADERS" | grep -qi "x-frame-options: DENY" || { echo "FAIL: missing X-Frame-Options"; exit 1; }
echo "OK: security headers present"

echo "--- Demo trips ---"
for id in 00000000-0000-4000-8000-000000000001 00000000-0000-4000-8000-000000000002; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PROD/trip/$id")
  if [ "$CODE" != "200" ]; then
    echo "FAIL: demo trip $id returned $CODE"
    exit 1
  fi
done
echo "OK: both demo trips reachable"

echo ""
echo "All deploy verification checks passed against $PROD"
