# Improvement Plan

Prioritized next steps after the [2026-10-19 status review](../status/2026-10-19-project-status.md). The backlog of record is [backlog.json](../backlog.json); this page explains the **order** and the **why**.

Ordering principle (revised 2026-10-19 by the product owner): **user-facing product first.** Merge quality is protected by the CI gate; infrastructure hardening waits until the product is closer to launch.

## Done

| # | Item | Result |
|---|------|--------|
| 1 | **CI test gate on PRs** | `.github/workflows/ci.yml` runs typecheck, API tests, and web/admin builds on every PR to `dev`/`main`; `build-and-test` is a required check in both rulesets |

## Deferred by owner decision (2026-10-19)

Dev and UAT hold only disposable test data that can be re-seeded, so protecting it is not a priority now. Revisit before production exists.

| # | Item | Revisit when |
|---|------|--------------|
| 2 | UAT database backups | Production setup (#14); production gets backups from day one |
| 3 | Least-privilege deploy identity (remove **Editor** from the default compute account) | Production setup (#14) |
| 4 | Remove UAT-instance leftovers; dedicated UAT DB owner | Any convenient SQL session |
| 5 | Dedicated UAT Resend key | When the dev key is next rotated |
| 6 | Container image cleanup policy | When storage cost becomes noticeable |

## Next: finish the deal lifecycle (milestone M2)

| # | Item | Depends on |
|---|------|------------|
| 7 | **Contract timers** (BullMQ): 48h auto-complete, 14-day overdue auto-complete, 7-day dispute auto-resolve, all reading the contract's policy snapshot | #26 snapshots (done) |
| 8 | **Dispute evidence + arbiter resolution API** | Schema exists |
| 9 | **Minimal admin app**: login, platform-settings editor (API is live on dev), dispute queue | #8 for the queue |
| 10 | **Notifications** for contract and dispute events | #7, #8 |

## Then: money and media (M3)

| # | Item | Notes |
|---|------|-------|
| 11 | Billing ledger and fee calculation on completion, using the contract's fee snapshot | 3% poster / 2% worker by default, admin-configurable |
| 12 | Monthly invoice generation with the under-1.00-GEL carry-over, plus an invoice viewer | Payment by bank transfer; admin marks paid (v1) |
| 13 | Cloudflare R2 uploads with EXIF stripping and MIME checks | Gig images, avatars, dispute evidence |

## Before public launch (M4–M5)

| # | Item | Why |
|---|------|-----|
| 14 | **Production environment** in a separate cloud project (`gigsge-prod`) with backups, deletion protection, and live keys only there | See [environments-and-integrations.md](../architecture/environments-and-integrations.md) |
| 15 | End-to-end tests for the hiring journey, plus a CI smoke gate after each deploy | Catch UI + API regressions together |
| 16 | Error logging and alerting (Cloud Logging alerts on 5xx and email-delivery failures) | Know about failures before users report them |
| 17 | Fix ESM build so the API runs from compiled JS instead of `tsx` | Faster cold starts, fewer moving parts in production |
| 18 | Gig search/filter/pagination, profile editing, reviews, Georgian i18n, PWA polish | Launch-quality product breadth |
| 19 | SMS provider (optional for launch) with the test/live pattern | Only if phone verification becomes required |

## Documentation follow-ups

- Split `docs/guides/security-coherence-quickstart.md` (216 lines) and `docs/guides/project-coherence-framework.md` (159 lines, near the limit) when next edited.
- Keep [cloud-inventory.md](../operations/cloud-inventory.md) current in the same PR as any infrastructure change.
- Write a dated status file in `docs/status/` at each promotion to UAT.

## How to run this plan

Each numbered item is one branch, one PR, merged to `dev`, verified on https://dev.gigs.ge, then promoted to `main`. Items marked "Owner" need a decision, an account, or a key that only the product owner can provide. Everything else the agent can do end to end.
