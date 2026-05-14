#!/usr/bin/env bash

# Local guard for production web bundle auth endpoints.
# Fails if auth pages are compiled to call localhost directly.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"

cd "$ROOT_DIR"

echo "▶ Building @gigs/web production bundle (local-only check)..."
pnpm --filter @gigs/web build >/tmp/gigs-web-build.log 2>&1 || {
  echo "✗ Web build failed. See /tmp/gigs-web-build.log"
  exit 1
}

if [[ ! -d "$WEB_DIR/.next" ]]; then
  echo "✗ Missing build output at apps/web/.next"
  exit 1
fi

echo "▶ Scanning compiled auth bundles for localhost auth calls..."

if grep -R -E 'localhost:3001[^\n]*api/v1/auth/(login|register|verify-otp|refresh|resend-otp|me)' "$WEB_DIR/.next" >/tmp/gigs-web-auth-base.err 2>&1; then
  echo "✗ Found localhost auth endpoint(s) in production bundle:"
  cat /tmp/gigs-web-auth-base.err
  exit 1
fi

echo "✓ No direct localhost auth endpoints found in production bundle."
echo "✓ Local web auth-base guard passed."
