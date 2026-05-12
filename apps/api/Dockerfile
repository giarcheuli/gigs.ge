# ── API image ──────────────────────────────────────────────────────────────
# Build context: monorepo root (set in docker-compose.yml)
# Runs: Fastify API on port 3001
#
# The entrypoint automatically runs `drizzle-kit push` + UAT seed on every
# container start (both are idempotent) before handing off to the server.

FROM node:20-alpine AS builder

# Install the exact pnpm version pinned in package.json
RUN npm install -g pnpm@8.15.4

WORKDIR /repo

# Layer 1: workspace manifests only — cached unless lockfile changes
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install all deps (dev + prod) so we can build TS and run drizzle-kit
RUN pnpm install --frozen-lockfile

# Layer 2: source — busts only when code changes
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared types first, then the API
RUN pnpm --filter @gigs/shared build && pnpm --filter @gigs/api build

# ── Production image ────────────────────────────────────────────────────────
# Keeps ALL deps (including drizzle-kit / tsx) so the entrypoint can run
# db:push and db:seed:uat at startup. Acceptable for UAT; trim for prod.

FROM node:20-alpine

RUN npm install -g pnpm@8.15.4

WORKDIR /repo

ENV NODE_ENV=production

# Copy the full built workspace so pnpm scripts (db:push, db:seed:uat) work
COPY --from=builder /repo/pnpm-lock.yaml ./
COPY --from=builder /repo/pnpm-workspace.yaml ./
COPY --from=builder /repo/package.json ./
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/apps/api ./apps/api

WORKDIR /repo/apps/api

EXPOSE 3001

COPY apps/api/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
