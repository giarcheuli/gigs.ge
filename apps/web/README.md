# @gigs/web

User-facing Next.js app for gigs.ge — the gig board, applications, contracts, and user profiles.

## Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Data Fetching:** TanStack Query
- **Forms:** React Hook Form + Zod (schemas from `@gigs/shared`)

## Quick Start

```bash
# From monorepo root
pnpm --filter @gigs/web dev   # Start on port 3000
```

## Build

```bash
pnpm --filter @gigs/web build
```

## Docs

- [Getting Started](../../docs/guides/getting-started.md)
- [Monorepo Structure](../../docs/architecture/monorepo-structure.md)
- [Full Specification](../../SYSTEM_DESIGN.md)
