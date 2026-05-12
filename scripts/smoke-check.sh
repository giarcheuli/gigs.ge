#!/usr/bin/env bash
# smoke-check.sh — post-deploy verification for the gigs.ge UAT environment.
#
# Usage:
#   bash scripts/smoke-check.sh <api-base-url> [web-base-url]
#
# Examples:
#   # Local dev stack
#   bash scripts/smoke-check.sh http://localhost:3001 http://localhost:3000
#
#   # GCE VM
#   bash scripts/smoke-check.sh http://34.123.45.67:3001 http://34.123.45.67:3000
#
# What it verifies:
#   1. API health check responds with {"status":"ok"}
#   2. Web app root responds with HTTP 200
#   3. Login with UAT seed account succeeds (returns access token)
#   4. GET /auth/me with the token returns the correct email
#   5. GET /api/v1/gigs returns a 200 (list may be empty on a fresh env)
#   6. GET /api/v1/regions returns a non-empty regions list
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed (details printed to stderr)
#
# Dependencies: curl, jq (both available on GCE default images and most CI runners)

set -euo pipefail

API_BASE="${1:-}"
WEB_BASE="${2:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

pass() { echo -e "${GREEN}  ✓${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}  ✗${NC} $1" >&2; FAIL=$((FAIL + 1)); }
info() { echo -e "${YELLOW}  →${NC} $1"; }

if [[ -z "$API_BASE" ]]; then
  echo "error: api-base-url is required"
  echo ""
  echo "usage: bash scripts/smoke-check.sh <api-base-url> [web-base-url]"
  echo "  example: bash scripts/smoke-check.sh http://localhost:3001 http://localhost:3000"
  exit 1
fi

if ! command -v curl &>/dev/null; then
  echo "error: curl is required but not installed" >&2
  exit 1
fi
if ! command -v jq &>/dev/null; then
  echo "error: jq is required but not installed" >&2
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  gigs.ge UAT smoke check"
echo "  API: $API_BASE"
[[ -n "$WEB_BASE" ]] && echo "  Web: $WEB_BASE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. API health ─────────────────────────────────────────────────────────────
info "1/6  API health"
HEALTH_BODY=$(curl -sf "$API_BASE/health" 2>/dev/null || echo "")
if echo "$HEALTH_BODY" | jq -e '.status == "ok"' &>/dev/null; then
  pass "GET /health → {\"status\":\"ok\"}"
else
  fail "GET /health did not return {\"status\":\"ok\"} (got: $HEALTH_BODY)"
fi

# ── 2. Web root ───────────────────────────────────────────────────────────────
if [[ -n "$WEB_BASE" ]]; then
  info "2/6  Web root"
  WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_BASE/" 2>/dev/null || echo "000")
  if [[ "$WEB_STATUS" == "200" ]]; then
    pass "GET $WEB_BASE/ → HTTP 200"
  else
    fail "GET $WEB_BASE/ → HTTP $WEB_STATUS (expected 200)"
  fi
else
  info "2/6  Web root — skipped (no WEB_BASE provided)"
fi

# ── 3. Login with UAT seed account ───────────────────────────────────────────
# These are intentional demo credentials seeded by db:seed:uat — not real secrets.
UAT_EMAIL='poster1@uat.gigs.ge'    # gitguardian:ignore
UAT_PASSWORD='Uat-Demo-2026!'      # gitguardian:ignore
info "3/6  Login ($UAT_EMAIL)"
LOGIN_BODY=$(curl -sf -X POST "$API_BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$UAT_EMAIL\",\"password\":\"$UAT_PASSWORD\"}" 2>/dev/null || echo "")

ACCESS_TOKEN=$(echo "$LOGIN_BODY" | jq -r '.accessToken // empty' 2>/dev/null || echo "")
if [[ -n "$ACCESS_TOKEN" && "$ACCESS_TOKEN" != "null" ]]; then
  pass "POST /api/v1/auth/login → access token issued"
else
  fail "POST /api/v1/auth/login did not return an access token (response: $LOGIN_BODY)"
  echo ""
  echo "  Remaining checks that require auth are skipped."
fi

# ── 4. GET /auth/me ───────────────────────────────────────────────────────────
info "4/6  GET /auth/me"
if [[ -n "$ACCESS_TOKEN" && "$ACCESS_TOKEN" != "null" ]]; then
  ME_BODY=$(curl -sf "$API_BASE/api/v1/auth/me" \
    -H "Authorization: Bearer $ACCESS_TOKEN" 2>/dev/null || echo "")
  ME_EMAIL=$(echo "$ME_BODY" | jq -r '.email // empty' 2>/dev/null || echo "")
  if [[ "$ME_EMAIL" == "poster1@uat.gigs.ge" ]]; then
    pass "GET /api/v1/auth/me → email matches seeded account"
  else
    fail "GET /api/v1/auth/me did not return expected email (got: $ME_BODY)"
  fi
else
  info "4/6  GET /auth/me — skipped (no token)"
fi

# ── 5. Gig list ───────────────────────────────────────────────────────────────
info "5/6  Gig list"
GIGS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/api/v1/gigs" \
  -H "Authorization: Bearer ${ACCESS_TOKEN:-}" 2>/dev/null || echo "000")
if [[ "$GIGS_STATUS" == "200" ]]; then
  pass "GET /api/v1/gigs → HTTP 200"
else
  fail "GET /api/v1/gigs → HTTP $GIGS_STATUS (expected 200)"
fi

# ── 6. Regions (seed check) ───────────────────────────────────────────────────
info "6/6  Regions seed"
REGIONS_BODY=$(curl -sf "$API_BASE/api/v1/regions" 2>/dev/null || echo "")
REGION_COUNT=$(echo "$REGIONS_BODY" | jq 'length' 2>/dev/null || echo "0")
if [[ "$REGION_COUNT" -gt 0 ]]; then
  pass "GET /api/v1/regions → $REGION_COUNT regions loaded"
else
  fail "GET /api/v1/regions returned empty or non-JSON (got: $REGIONS_BODY)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS + FAIL))
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}  All $TOTAL checks passed — UAT environment is healthy.${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  exit 0
else
  echo -e "${RED}  $FAIL of $TOTAL checks FAILED.${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  exit 1
fi
