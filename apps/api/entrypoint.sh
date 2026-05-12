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
exec node dist/server.js
