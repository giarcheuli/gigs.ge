# Project Status — 2026-10-19

A dated snapshot of what shipped, what the repo and cloud look like, and what was cleaned up. For what comes next, see the [improvement plan](../planning/improvement-plan.md).

## 1. What shipped in this cycle

| PR | What | Where it runs |
|----|------|---------------|
| #23 | Real email through Resend: verification code and password reset, sent via Cloud Tasks | dev + UAT |
| #24 | Runbook and backlog updates for the email cutover | dev + UAT |
| #25 | Promotion of dev → main (UAT) | UAT |
| #26 | Configurable platform settings: admin-only fee/timer settings API, audit history, contract policy snapshots | dev (UAT after next promotion) |

Earlier slices already live on both environments: email-only verification with optional phone (#17), mutual contract cancellation (#19), and server-side gig visibility (#21).

**Verified by hand:** a real mailbox received the verification code and the password-reset link on dev. On UAT, Resend accepted both email types for a test inbox. After #26, the admin settings API returned `403` for a normal user and `401` for an anonymous caller.

## 2. Infrastructure changes and why

We gave each environment its own credentials because one shared set meant a leak in dev would also expose UAT.

- **Separate dev database server.** Dev moved to its own Cloud SQL instance, `gigsge-dev-db`. Cloud SQL's `postgres` user is not a true superuser, so isolating two databases inside one instance by ownership tricks did not work. A separate instance gives a hard wall.
- **Secrets out of trigger settings.** Database passwords, JWT secrets, and Resend keys now live in Secret Manager and reach Cloud Run as secret references. The old plain-text trigger values were removed, and the UAT database password was rotated.
- **Per-environment identities.** Each API runs as its own service account (`gigsge-api-dev-runtime`, `gigsge-api-uat-runtime`), which can read only its own secrets and queue.

Details: [operations/cloud-inventory.md](../operations/cloud-inventory.md).

## 3. Repository audit and housekeeping

| Finding | Action taken |
|---------|--------------|
| Settings feature existed only as **uncommitted local changes** | Committed, rebased onto current dev (conflicts with mutual cancellation resolved), tested (92 API tests pass), merged as #26 |
| PR #15 (preflight line endings) open since 2026-10-14 | Closed; dev already had the fix via `.gitattributes` |
| 14 remote branches whose PRs were merged or abandoned | Deleted; the 4 with unmerged history are kept as `archive/*` tags |
| 7 extra local worktrees | Removed after confirming no unsaved changes |
| 3 AI process reports mixed into live docs | Moved to [docs/archive/](../archive/README.md) |
| Status handoff described the web app as "placeholder pages" | Rewritten ([uat-readiness-handoff.md](../guides/uat-readiness-handoff.md)) |

**Result:** GitHub now has only `dev` and `main`, no open PRs, and no feature branches. `main` will match `dev` after the promotion that follows this docs PR.

## 4. Open findings (not fixed in this pass)

These need a decision or a riskier change, so they moved to the [improvement plan](../planning/improvement-plan.md):

1. **No automated test gate on PRs.** There is no `.github/workflows/`. PRs are checked only by GitGuardian, and the deploy runs after merge. A broken test would not block a merge.
2. **Over-broad cloud permissions.** The default compute account (used by both deploy triggers and both web services) has project **Editor**. The unused Cloud Build account still has project-wide Secret Accessor.
3. **UAT database has no backups.** Deletion protection is now on, but there is no point-in-time restore.
4. **UAT shares the dev Resend key**, and **UAT's API logs in as `postgres`** (existing tables are owned by it).
5. **Leftovers on the UAT instance:** an unused `gigsge_dev` database and `gigsge_dev_app` login (password scrambled). Removing them needs one SQL session.
6. **42 old container images** under retired names (`gcr.io/gigsge/api`, `gcr.io/gigsge/web`).
7. **No production environment yet.** See [environments-and-integrations.md](../architecture/environments-and-integrations.md).
