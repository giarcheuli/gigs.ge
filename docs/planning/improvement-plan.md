# Improvement Plan

Prioritized next steps after the [2026-10-19 status review](../status/2026-10-19-project-status.md). The backlog of record is [backlog.json](../backlog.json); this page explains the **order** and the **why**.

Ordering principle: protect what exists (data, secrets, merge quality) first, then finish the features that make contracts trustworthy, then money and media, then launch hardening.

## Now: safety net (small, high leverage)

| # | Item | Why it matters | Owner |
|---|------|----------------|-------|
| 1 | **CI test gate on PRs.** GitHub Actions workflow running build + API tests on every PR to `dev`/`main`, required before merge | Today a failing test does not block a merge; it only shows up after deploy | Agent |
| 2 | **UAT database backups** (daily, 7-day retention) | Stakeholder test data has no restore path. Cost is a few cents per month at this size | Owner approves, agent enables |
| 3 | **Least-privilege deploy identity.** Dedicated deployer and web-runtime service accounts; remove **Editor** from the default compute account; drop the unused Cloud Build account's project-wide secret access | Editor can change almost anything in the project, and every deploy runs with it | Agent (one supervised change) |
| 4 | **Remove UAT-instance leftovers** (`gigsge_dev` DB, `gigsge_dev_app` login), and give UAT a dedicated DB owner instead of `postgres`, in one SQL session | Smaller blast radius if the UAT password ever leaks | Agent prepares SQL; owner runs it in Cloud SQL Studio |
| 5 | **Dedicated UAT Resend key** | Today revoking the dev key also breaks UAT email | Owner creates the key in Resend; agent swaps it |
| 6 | **Container image cleanup policy** (keep the last 10 per service; delete the retired `api`/`web` image names) | Storage cost creeps up, and old images clutter rollback choices | Agent, after owner OK (deletion is permanent) |

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
