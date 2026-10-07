#!/bin/sh
# entrypoint.sh — runs inside the API container on every start.
# Pushes the Drizzle schema (idempotent) then seeds UAT accounts before
# handing off to the application process.
set -e

echo "▶ Syncing database schema..."
pnpm db:push

echo "▶ Seeding UAT accounts (idempotent)..."
pnpm db:seed:uat

echo "▶ Starting API server..."
# tsx tolerates extensionless ESM imports; compiled dist crashes under plain node (see backlog m4_hardening)
exec pnpm exec tsx src/server.ts
