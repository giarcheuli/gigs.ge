# Branching and SDLC Guide

This guide defines how work should move through the repository while the team is driving toward the first credible UAT slice.

The goal is simple: one visible integration branch, one smallest slice at a time, and no ambiguity about which branch reflects the current product state.

## Canonical Branches

### `main`

Use `main` as the stable baseline.

Rules:

1. Do not use `main` for exploratory or agent-driven accumulation.
2. Merge into `main` only when a slice or milestone is coherent and validated.
3. Treat `main` as the last trustworthy checkpoint for the broader repo.

### `uat/first-slice`

Use `uat/first-slice` as the canonical integration branch for the first stakeholder UAT journey.

Rules:

1. This is the source of truth for current UAT progress.
2. Backlog, handoff, and README state must reflect this branch.
3. All new delivery branches start from here.
4. If a cloud or Copilot branch contains useful work, merge or cherry-pick it here quickly.

### Task Branches

Create short-lived task branches from `uat/first-slice`.

Examples:

1. `feat/uat-frontend-flow`
2. `feat/uat-smoke-docs`
3. `fix/uat-contract-signing`
4. `docs/uat-readiness-sync`

Rules:

1. One branch should serve one smallest meaningful slice.
2. Do not mix unrelated workstreams on the same task branch.
3. Merge task branches back into `uat/first-slice`, not directly into `main`.

## Cloud and Agent Branches

Copilot or cloud branches are temporary intake branches, not long-term product branches.

Rules:

1. Do not treat `copilot/*` branches as the ongoing project source of truth.
2. If a `copilot/*` branch contains useful work, integrate it into `uat/first-slice` promptly.
3. After integration, continue work from `uat/first-slice` or a fresh task branch, not from the old `copilot/*` branch.

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
2. Switch to `uat/first-slice`.
3. Pull the latest remote state with fast-forward only.
4. Create one short-lived task branch.
5. Implement one smallest meaningful slice.
6. Run the narrowest useful executable validation.
7. Update the smallest truthful docs needed for the change.
8. Merge the task branch back into `uat/first-slice`.
9. Refresh the handoff and backlog if current-state claims changed.

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

## Docs Ownership

The repo should use these documents as the operating source of truth:

1. `README.md` for top-level orientation
2. `docs/guides/uat-readiness-handoff.md` for current product state and blockers
3. `docs/backlog.json` for delivery state and ordering
4. This guide for branch and workflow policy

Do not let these files describe different branch states.

## Commands

### Bootstrap the Canonical Integration Branch

Use this only if `origin/uat/first-slice` does not exist yet.

```bash
git fetch origin
git switch -c uat/first-slice --track origin/copilot/define-first-uat-slice-again
git push -u origin uat/first-slice
```

### Sync the Canonical Integration Branch

Use this for normal day-to-day work once `uat/first-slice` exists on `origin`.

```bash
git fetch origin
git switch uat/first-slice
git pull --ff-only origin uat/first-slice
```

### Start a New Task Branch

```bash
git switch uat/first-slice
git pull --ff-only origin uat/first-slice
git switch -c feat/uat-frontend-flow
```

### Merge an Agent Branch into the Canonical Integration Branch

```bash
git fetch origin
git switch uat/first-slice
git pull --ff-only origin uat/first-slice
git merge --no-ff origin/copilot/some-branch
```

### Bring One Commit Across

```bash
git fetch origin
git switch uat/first-slice
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
