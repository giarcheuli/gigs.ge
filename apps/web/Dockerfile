# ── Web image ───────────────────────────────────────────────────────────────
# Build context: monorepo root (set in docker-compose.yml)
# Runs: Next.js 14 App Router on port 3000
#
# NEXT_PUBLIC_API_URL is a build-time ARG — it is baked into the JS bundle.
# Set it to the public URL of your API (e.g. http://<GCE_IP>:3001).

FROM node:20-alpine AS builder

RUN npm install -g pnpm@8.15.4

WORKDIR /repo

# Layer 1: workspace manifests — cached unless lockfile changes
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

# Layer 2: source
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Bake the API URL into the Next.js bundle at build time
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build shared types first, then the web app
RUN pnpm --filter @gigs/shared build && pnpm --filter @gigs/web build

# ── Production image ────────────────────────────────────────────────────────

FROM node:20-alpine

RUN npm install -g pnpm@8.15.4

WORKDIR /repo

ENV NODE_ENV=production

COPY --from=builder /repo/pnpm-lock.yaml ./
COPY --from=builder /repo/pnpm-workspace.yaml ./
COPY --from=builder /repo/package.json ./
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/apps/web ./apps/web

WORKDIR /repo/apps/web

EXPOSE 3000

CMD ["pnpm", "start"]
