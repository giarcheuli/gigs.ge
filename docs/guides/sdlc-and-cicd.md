# SDLC and CI/CD Policy

This document defines how code moves from a developer's machine to production at gigs.ge.
It covers environment strategy, the branch lifecycle, PR standards, the automated CI pipeline,
and the release process.

Read this alongside [branching-and-sdlc.md](./branching-and-sdlc.md), which covers the
day-to-day working cycle and git commands.

---

## Environments

| Environment | Source Branch | Purpose | Deploy Trigger |
|---|---|---|---|
| **Local** | any task branch | Fast feedback loop | manual — `pnpm dev` |
| **Dev** | `dev` | Fresh features and fixes, may break | automatic — Cloud Build trigger `deploy-gigsge-dev` → https://dev.gigs.ge |
| **UAT / Staging** | `main` | Stakeholder review and acceptance | automatic — Cloud Build trigger `deploy-gigsge-uat` → https://uat.gigs.ge |
| **QA** | (future) | Pre-production verification | planned — qa.gigs.ge |
| **Production** | `main` (tagged release) | Live users | manual release approval after tag — not yet provisioned |

No environment is ever deployed from a `copilot/*` branch or a task branch.
Only the canonical branches (`dev`, `main`) feed real environments.

> **History note (2026-10-07):** the former integration branch `uat/first-slice` was fully
> merged into `main` (PR #14) and retired. The `dev` branch and dev environment were added
> the same day.

---

## Branch Lifecycle

```
dev                        ← integration branch (deploys dev.gigs.ge)
  └── feat/my-feature      ← short-lived task branch
        ↓  PR opened, CI passes, reviewed
        └── squash-merged back into dev
              ↓  verified on dev.gigs.ge
              └── promoted to main (deploys uat.gigs.ge)
                    ↓  milestone boundary reached, UAT accepted
                    └── tagged release on main
```

### 1. Create

- Always branch from `dev`. Never branch from a stale branch.
- Use a descriptive prefix and scope:
  - `feat/` — new capability
  - `fix/` — bug correction
  - `docs/` — documentation-only change
  - `chore/` — tooling, config, deps
  - `refactor/` — code restructuring without behavior change
- One branch = one smallest meaningful slice. Do not mix workstreams.

### 2. Develop

- Write code, run tests locally before pushing anything.
- Minimum local check before pushing:
  ```bash
  pnpm --filter @gigs/api lint
  pnpm --filter @gigs/api test
  ```
- Keep commits atomic. Prefer [Conventional Commits](https://www.conventionalcommits.org/)
  format: `feat(gigs): add publish endpoint`.

### 3. Open a Pull Request

- **Target**: `dev` for all feature/fix work; `main` only for dev→main promotions and urgent hotfixes.
- **Title**: matches the conventional commit format.
- **Description** must state:
  1. What changed
  2. Why it was needed
  3. How to verify it (manual steps or test name)
- Do not merge a draft PR. Mark it ready for review before merging.
- Require ≥ 1 human approval.
- All CI status checks must pass. A failing CI is a hard block.

### 4. Merge

| Source → Target | Strategy | Reason |
|---|---|---|
| task branch → `dev` | **Squash merge** | Keeps integration history readable; one logical commit per slice |
| `dev` → `main` | **Merge commit (promotion)** | Preserves what was promoted and when |
| milestone boundary | **Tag on `main`** | Marks releases without extra branches |

Never use rebase-and-merge on shared branches. It rewrites history others may have pulled.

### 5. Delete

Delete the source branch immediately after the PR merges — both remote and local.

```bash
git push origin --delete feat/my-feature
git branch -d feat/my-feature
```

Never leave merged branches alive on `origin`. They create noise and confusion about
what is current work.

---

## Branch Protection Rules

Apply these settings in GitHub → Settings → Branches.

### `main`
- Require pull request before merging (no direct pushes)
- Require ≥ 1 approving review
- Require status checks to pass: `lint`, `test`, `build`
- Block force pushes
- Block deletions

---

## CI Pipeline

CI runs automatically on every PR targeting `dev` or `main`.
The pipeline lives in `.github/workflows/ci.yml`.

```
PR opened or updated
  │
  ├── lint    pnpm --filter @gigs/api lint
  ├── test    pnpm --filter @gigs/api test
  └── build   pnpm --filter @gigs/api build
```

A PR cannot be merged if any step fails. This is enforced by branch protection, not by convention.

### Test Details

- All existing Jest tests must pass — no force-merging past a red test suite.
- Integration tests run against a throwaway PostgreSQL instance provisioned by CI.
- Coverage thresholds are not enforced yet; this is a post-launch hardening item.

---

## CD Pipeline

| Stage | Trigger | Target |
|---|---|---|
| Dev | Push/merge to `dev` | Cloud Run (`gigsge-api-dev`, `gigsge-web-dev`) → https://dev.gigs.ge — live since 2026-10-07 |
| UAT / Staging | Push/merge to `main` | Cloud Run (`gigsge-api`, `gigsge-web`) → https://uat.gigs.ge — live since 2026-10-07 |
| Production | Manual approval after version tag | Production environment — not yet provisioned |

Both environments share one parameterized `cloudbuild.yaml`; each trigger supplies its own
service names, database name (`gigsge` / `gigsge_dev`), URLs, and secrets.

After each deploy, run `scripts/smoke-check.ps1` (Windows) or `scripts/smoke-check.sh` (Linux/macOS) against the environment's URLs.

---

## Release Process

A release is a tag on `main` at a milestone boundary (e.g., end of a UAT round,
post-hardening sprint).

```
1. Confirm all CI checks pass on main.
2. Confirm docs/guides/uat-readiness-handoff.md reflects current state.
3. Tag main:
     git tag v<major>.<minor>.<patch>
     git push origin --tags
4. Update uat-readiness-handoff.md with the release note and date.
```

### Versioning — Semantic Versioning (semver)

| Version | Meaning |
|---|---|
| `v0.x.y` | Pre-launch development. Breaking changes are expected. |
| `v1.0.0` | First production-ready release to real users. |
| Patch `y++` | Bug fixes, no new functionality. |
| Minor `x++` | Backward-compatible new features. |
| Major | Breaking API or schema changes. |

---

## What This Policy Forbids

The following are hard rules, not suggestions:

- Direct commits to `dev` or `main` without a PR (promotions from `dev` to `main` excepted).
- Merging a PR while CI is failing.
- Leaving merged branches alive on `origin`.
- Deploying to any environment from a task branch or `copilot/*` branch.
- Using `--force` or `--force-with-lease` on `dev` or `main`.
- Treating a diff review as a substitute for running the test suite.
- Branching from anything other than up-to-date `dev` for new work.

---

*Read next: [branching-and-sdlc.md](./branching-and-sdlc.md) for the daily working cycle and git commands.*
