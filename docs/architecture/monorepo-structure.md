# Architecture: Monorepo Structure

For **gigs.ge**, we use a monorepo managed by **Turborepo** and **pnpm**.

## Why a Monorepo?

In a marketplace with separate interfaces (User-facing vs. Admin), a monorepo provides three key advantages:

1. **Shared Domain Logic**: The 3%/2% fee constants, contract status enums, half-time rule formula, and Zod validation schemas are written once in `packages/shared` and used by both the API and the frontends.
2. **Type Safety**: TypeScript interfaces for all 21 database tables are shared across the entire stack — a schema change in `shared` breaks the build immediately if consumers aren't updated.
3. **Simplified Orchestration**: `pnpm dev` starts the backend, the website, and the admin panel simultaneously via Turborepo.

## Folder Overview

```
gigs.ge/
├── apps/
│   ├── api/              # Fastify backend (port 3001)
│   │   ├── src/
│   │   │   ├── config/   # Environment variables
│   │   │   ├── db/       # Drizzle ORM schema + seed
│   │   │   ├── app.ts    # Fastify app factory
│   │   │   └── server.ts # Entry point
│   │   └── drizzle.config.ts
│   ├── web/              # Next.js 14 user-facing app (port 3000)
│   │   └── src/app/      # App Router pages
│   └── admin/            # Next.js 14 admin panel (port 3002)
│       └── src/app/      # App Router pages
├── packages/
│   └── shared/           # @gigs/shared
│       └── src/
│           ├── constants/ # Enums, fee rates, timing, limits
│           ├── types/     # TypeScript interfaces (all 21 tables)
│           └── schemas/   # Zod validation schemas
├── docs/                 # Architecture docs & guides
├── .github/              # Copilot instructions + skills
├── SYSTEM_DESIGN.md      # Full specification (v0.5)
├── turbo.json            # Build pipeline
└── pnpm-workspace.yaml   # Workspace config
```

## Package Dependencies

The build order matters — Turborepo handles it automatically via `dependsOn`:

```
@gigs/shared  ←── @gigs/api
              ←── @gigs/web
              ←── @gigs/admin
```

`shared` builds first (plain TypeScript compilation), then the three apps build in parallel.

## Key Commands

| Command | Scope | What it does |
|---------|-------|-------------|
| `pnpm dev` | All | Start all apps in watch mode |
| `pnpm build` | All | Production build (shared → apps) |
| `pnpm --filter @gigs/api dev` | API only | Start Fastify in watch mode |
| `pnpm --filter @gigs/web dev` | Web only | Start Next.js dev server |

---

**Related:** [Database Design](./database-design.md) · [Auth Flow](./auth-flow.md) · [Getting Started](../guides/getting-started.md)
