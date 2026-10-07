# Branching and SDLC Guide

This guide defines how work should move through the repository as the team drives toward launch.

The goal is simple: one visible integration branch, one smallest slice at a time, and no ambiguity about which branch reflects the current product state.

> **History note (2026-10-07):** `uat/first-slice` was the integration branch for the first UAT slice. It was fully merged into `main` via PR #14 and is now retired. Later the same day the `dev` branch and dev environment were introduced, creating the current two-tier ladder.

## Canonical Branches

### `dev`

Use `dev` as the integration branch for fresh work. Every merge auto-deploys to **https://dev.gigs.ge**.

Rules:

1. All new task branches start from `dev` and merge back into it via PR.
2. `dev` may be broken at any time — it is the proving ground, not the showroom.
3. The dev environment has its own database (`gigsge_dev`); wiping or reseeding it is always acceptable.

### `main`

Use `main` as the stable/UAT tier. Every merge auto-deploys to **https://uat.gigs.ge**.

Rules:

1. This is the source of truth for the stakeholder-visible product state.
2. `main` only receives promotions from `dev` (or urgent hotfixes via task branch + PR).
3. Backlog, handoff, and README state must reflect this branch.
4. Never commit directly to `main`; promote or PR.

### Promotion

```
feature branch → dev → auto-deploys dev.gigs.ge     (fresh work, may break)
                  ↓ verified on dev.gigs.ge
                main → auto-deploys uat.gigs.ge      (stable, stakeholder-facing)
                  ↓ future
                qa.gigs.ge → production gigs.ge
```

Promote with a PR from `dev` into `main` (or `git merge --ff-only dev` when histories align).

### Task Branches

Create short-lived task branches from `dev`.

Examples:

1. `feat/uat-frontend-flow`
2. `feat/uat-smoke-docs`
3. `fix/uat-contract-signing`
4. `docs/uat-readiness-sync`

Rules:

1. One branch should serve one smallest meaningful slice.
2. Do not mix unrelated workstreams on the same task branch.
3. Merge task branches back into `dev` via a reviewed PR; never push task work directly to `dev` or `main`.

## Cloud and Agent Branches

Copilot or cloud branches are temporary intake branches, not long-term product branches.

Rules:

1. Do not treat `copilot/*` branches as the ongoing project source of truth.
2. If a `copilot/*` branch contains useful work, integrate it into `main` promptly via a task branch and PR.
3. After integration, continue work from `main` or a fresh task branch, not from the old `copilot/*` branch.

## Delivery Order for First UAT

Until the first UAT slice is complete, prefer this sequence:

1. Auth foundation
2. Gigs, applications, and contracts minimum backend path
3. Frontend UAT stitching
4. Stakeholder docs, smoke checks, and walkthrough
5. Post-UAT hardening

Do not widen scope just because the schema supports more than the current slice.

## Required Working Cycle

Every coding task should follow this loop:

1. Fetch remotes and confirm the canonical integration branch.
2. Switch to `dev`.
3. Pull the latest remote state with fast-forward only.
4. Create one short-lived task branch.
5. Implement one smallest meaningful slice.
6. Run the narrowest useful executable validation.
7. Update the smallest truthful docs needed for the change.
8. Merge the task branch back into `dev` via PR; verify on dev.gigs.ge.
9. Promote `dev` → `main` when the slice is UAT-ready.
10. Refresh the handoff and backlog if current-state claims changed.

## Validation Rules

Before calling a slice done:

1. Run the narrowest executable checks that match the touched surface.
2. Do not treat a diff review as a substitute for executable validation when a real check exists.
3. If docs now disagree with code, fix the docs in the same slice.

For current backend work, the usual baseline is:

1. `pnpm --filter @gigs/api lint`
2. `pnpm --filter @gigs/api test`

For current frontend work, prefer:

1. `pnpm --filter @gigs/web build`
2. `pnpm --filter @gigs/web lint` when the repo supports it cleanly

## Related Policy

For PR standards, CI pipeline, CD strategy, release tagging, and the full list of forbidden
practices, see [sdlc-and-cicd.md](./sdlc-and-cicd.md).

## Docs Ownership

The repo should use these documents as the operating source of truth:

1. `README.md` for top-level orientation
2. `docs/guides/uat-readiness-handoff.md` for current product state and blockers
3. `docs/backlog.json` for delivery state and ordering
4. This guide for branch and workflow policy

Do not let these files describe different branch states.

## Commands

### Sync the Canonical Integration Branch

Use this for normal day-to-day work.

```bash
git fetch origin
git switch dev
git pull --ff-only origin dev
```

### Start a New Task Branch

```bash
git switch dev
git pull --ff-only origin dev
git switch -c feat/my-task-name
```

### Promote dev to UAT

```bash
git switch main
git pull --ff-only origin main
git merge --no-ff dev -m "promote: dev -> main"
git push origin main
```

### Merge an Agent Branch into the Canonical Integration Branch

```bash
git fetch origin
git switch dev
git pull --ff-only origin dev
git merge --no-ff origin/copilot/some-branch
```

### Bring One Commit Across

```bash
git fetch origin
git switch dev
git cherry-pick <commit-sha>
```

## Operational Checklist

Use this checklist before each implementation session:

1. Am I on the canonical integration branch or a fresh task branch from it?
2. Does the branch I am using reflect the latest UAT truth?
3. Is the requested work one smallest meaningful slice?
4. Which executable validation proves this slice?
5. Which docs must change if the slice lands?

If any answer is unclear, resolve that before coding.
