# Getting Started

> Everything you need to run gigs.ge locally.

## Prerequisites

| Tool | Version | Check |
| ---- | ------- | ----- |
| Node.js | 20 LTS | `node --version` |
| pnpm | 8.x | `pnpm --version` |
| PostgreSQL | 16 | `psql --version` |
| Redis | 7+ | `redis-cli ping` |

If you don't have pnpm:

```bash
npm install -g pnpm@8
```

## 1. Clone & Install

```bash
git clone <repo-url> gigs.ge
cd gigs.ge
pnpm install
```

This installs dependencies for all 4 packages (`shared`, `api`, `web`, `admin`) in one go.

## 2. Environment Variables

Copy the example env file for the API:

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` and fill in at minimum:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gigsge
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=<generate-a-random-string>
JWT_REFRESH_SECRET=<generate-a-different-random-string>
```

## 3. Database Setup

Create the database and push the schema:

```bash
createdb gigsge
pnpm --filter @gigs/api db:push    # Push schema directly (dev shortcut)
pnpm --filter @gigs/api db:seed    # Seed Georgian regions & cities
```

> In production, use `db:generate` + `db:migrate` instead of `db:push`.

## 4. Run Everything

```bash
pnpm dev
```

This starts all three apps via Turborepo:

| App | URL | Description |
| --- | --- | ----------- |
| API | `http://localhost:3001` | Fastify backend |
| Web | `http://localhost:3000` | User-facing Next.js app |
| Admin | `http://localhost:3002` | Admin dashboard |

Health check: `curl http://localhost:3001/health`

## 5. Build

```bash
pnpm build
```

Builds all packages in dependency order (`shared` → `api`, `web`, `admin`).

## Project Structure

```text
gigs.ge/
├── apps/
│   ├── api/          # Fastify + Drizzle ORM
│   ├── web/          # Next.js 14 (user-facing)
│   └── admin/        # Next.js 14 (admin panel)
├── packages/
│   └── shared/       # Zod schemas, types, constants
├── docs/             # You are here
├── SYSTEM_DESIGN.md  # Full specification (v0.5)
├── turbo.json        # Turborepo pipeline config
└── pnpm-workspace.yaml
```

## Useful Commands

| Command | What it does |
| ------- | ------------ |
| `pnpm dev` | Start all apps in watch mode |
| `pnpm build` | Production build (all packages) |
| `pnpm --filter @gigs/api db:studio` | Open Drizzle Studio (DB GUI) |
| `pnpm --filter @gigs/api db:generate` | Generate migration from schema diff |
| `pnpm --filter @gigs/api db:migrate` | Apply pending migrations |
| `pnpm --filter @gigs/api db:seed` | Seed regions & cities |
| `pnpm --filter @gigs/web dev` | Start only the web app |

## What's Next?

After setup, read:

- [Monorepo Structure](../architecture/monorepo-structure.md) — why Turborepo + pnpm
- [Database Design](../architecture/database-design.md) — schema conventions and table map
- [Auth Flow](../architecture/auth-flow.md) — JWT pattern and guards
- [UAT Readiness Handoff](./uat-readiness-handoff.md) — what is implemented today, the current UAT blockers, and the next delivery priorities

---

**Related:** [SYSTEM_DESIGN.md](../../SYSTEM_DESIGN.md) · [API README](../../apps/api/README.md) · [backlog.json](../backlog.json)
