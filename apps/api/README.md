# @gigs/api

Fastify backend for gigs.ge — handles auth, gig management, contracts, billing, and admin operations.

## Stack

- **Runtime:** Node.js 20 LTS
- **Framework:** Fastify
- **ORM:** Drizzle ORM → PostgreSQL 16
- **Queue:** BullMQ (Redis)
- **Storage:** Cloudflare R2 (S3-compatible)

## Quick Start

```bash
# From monorepo root
cp apps/api/.env.example apps/api/.env  # Then edit with your values
pnpm --filter @gigs/api dev             # Start in watch mode (port 3001)
```

## Database

```bash
pnpm --filter @gigs/api db:push      # Push schema (dev)
pnpm --filter @gigs/api db:seed      # Seed regions & cities
pnpm --filter @gigs/api db:generate  # Generate migration
pnpm --filter @gigs/api db:migrate   # Apply migration
pnpm --filter @gigs/api db:studio    # Drizzle Studio GUI
```

Schema files live in `src/db/schema/` — one file per domain, barrel-exported from `index.ts`.

## API Base

All routes are under `/api/v1/`. Health check: `GET /health`.

## Docs

- [Database Design](../../docs/architecture/database-design.md)
- [Auth Flow](../../docs/architecture/auth-flow.md)
- [Full Specification](../../SYSTEM_DESIGN.md)
