# Project: gigs.ge

## Agent Behavior Rules (CRITICAL)
- **When stuck**: Stop immediately. Do NOT retry the same failing approach. Explain the root cause clearly, then write out a numbered breakdown of subtasks. Wait for the user to authorize before taking any action.
- **No silent retries**: If a command fails twice, escalate to the user with an explanation before trying again.
- **One action at a time when authorized**: Execute one subtask, report outcome, then wait for authorization for the next.

A mobile-first gig-board for Georgia with trust-based fees and dispute resolution.

## Architecture
- **Monorepo**: Turborepo + pnpm (`apps/api`, `apps/web`, `apps/admin`, `packages/shared`)
- **Backend**: Fastify, Drizzle ORM, PostgreSQL 16, BullMQ (Redis)
- **Frontend**: Next.js 14 (App Router), Tailwind CSS, TanStack Query
- **Storage**: Cloudflare R2 (S3-compatible)
- **Auth**: JWT access tokens (15 min) + httpOnly refresh cookie (7 days)

See [SYSTEM_DESIGN.md](../SYSTEM_DESIGN.md) for the full specification.

## Code Conventions
- TypeScript strict mode everywhere
- Zod schemas shared between API validation and frontend forms via `packages/shared`
- Database enums use TEXT columns, not Postgres ENUM types
- All timestamps UTC, all UUIDs via `gen_random_uuid()`
- Route files grouped by domain: `auth/`, `gigs/`, `users/`, etc.

## Business Logic (Critical)
- **Fee split**: 3% poster, 2% worker — calculated on `agreed_price`
- **48h auto-complete**: If one party marks "Done" and the other is silent for 48 hours, contract auto-completes
- **24h grace period**: Contracts cancelled within 24 hours of signing incur no fees
- **Half-time rule**: Neither party can mark Complete/Not Done until half the job duration has elapsed
- **14-day overdue auto-complete**: If both parties are silent past due date, contract auto-completes after 14 days
- **Carry-over**: Monthly invoice fees below 1.00 GEL carry to next month
- **Dispute → Arbiter**: After 24h of unresolved dispute, either party can submit evidence for admin review; auto-resolves after 7 days
- **Contact info is temporary**: Visible only while contract is active; hidden on terminal states

## Documentation Rules
- Every code change must have a corresponding doc update in `/docs/`
- Educational tone: explain *why*, not just *what*
- Atomic files: split at ~200 lines
- Use Mermaid for state machines and flow diagrams

## Branching and SDLC Rules
- Two-tier ladder since 2026-10-07: `dev` (integration, auto-deploys https://dev.gigs.ge) → `main` (stable/UAT, auto-deploys https://uat.gigs.ge). `uat/first-slice` is retired.
- All new feature, fix, and doc slices branch from `dev` and merge back into it via reviewed PR; promote `dev` → `main` when verified on dev.gigs.ge.
- Treat `copilot/*` branches as temporary intake branches. Merge or cherry-pick useful work into `dev` quickly via a task branch and PR.
- Do not continue feature work from stale milestone branches when a newer integration branch exists.
- Before coding, read the branch and workflow policy in `/docs/guides/branching-and-sdlc.md` together with the current UAT handoff and backlog.
- Delivery priority order: UAT deployment and stakeholder docs, deal-lifecycle automation (configurable timers), billing (configurable fees) and uploads, launch hardening.

## Skills Reference
Domain-specific workflows are defined in `.github/skills/`:

| Skill | When to Load |
|-------|-------------|
| `backend-api` | API routes, middleware, auth guards, validation |
| `database-schema` | Table design, migrations, seeding, Drizzle ORM |
| `deal-lifecycle` | Contract state transitions, timers, disputes, arbitration |
| `billing-invoicing` | Fee calculation, ledger, invoices, cron jobs |
| `frontend-web` | Next.js pages, components, forms, visibility rules |
| `storage-upload` | R2 uploads, image processing, EXIF stripping |
| `docs-writer` | Writing or updating any documentation |
