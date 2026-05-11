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
| **UAT / Staging** | `uat/first-slice` | Stakeholder review and acceptance | merge to `uat/first-slice` |
| **Production** | `main` | Live users | manual release approval after tag |

No environment is ever deployed from a `copilot/*` branch or a task branch.
Only the two canonical branches (`uat/first-slice`, `main`) feed real environments.

---

## Branch Lifecycle

```
uat/first-slice            ← source of truth
  └── feat/my-feature      ← short-lived task branch
        ↓  PR opened, CI passes, reviewed
        └── squash-merged back into uat/first-slice
              ↓  milestone boundary reached, UAT accepted
              └── PR → main    ← merge commit, tagged release
```

### 1. Create

- Always branch from `uat/first-slice`. Never branch from `main` or a stale branch.
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

- **Target**: `uat/first-slice` for feature work; `main` only for milestone releases.
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
| task branch → `uat/first-slice` | **Squash merge** | Keeps integration history readable; one logical commit per slice |
| `uat/first-slice` → `main` | **Merge commit** | Preserves the integration history as a visible milestone |

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

### `uat/first-slice`
- Require pull request before merging (no direct pushes)
- Require status checks to pass: `lint`, `test`
- Block force pushes

---

## CI Pipeline

CI runs automatically on every PR targeting `uat/first-slice` or `main`.
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

Automated deployments are not yet wired. This section describes the target state.

| Stage | Trigger | Target |
|---|---|---|
| UAT / Staging | Merge to `uat/first-slice` | Staging environment |
| Production | Manual approval after version tag | Production environment |

Until automation is in place, follow the release steps below and deploy manually.

---

## Release Process

A release is a promotion of `uat/first-slice` into `main` at a milestone boundary
(e.g., end of UAT first-slice, post-hardening sprint).

```
1. Confirm all CI checks pass on uat/first-slice.
2. Confirm docs/guides/uat-readiness-handoff.md reflects current state.
3. Open a PR: uat/first-slice → main. Title: "Release: <milestone name>"
4. Require ≥ 1 human review and all CI status gates.
5. Merge with merge commit (not squash — milestone history is valuable).
6. Tag main immediately after merge:
     git tag v<major>.<minor>.<patch>
     git push origin --tags
7. Update uat-readiness-handoff.md with the release note and date.
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

- Direct commits to `main` or `uat/first-slice` without a PR.
- Merging a PR while CI is failing.
- Leaving merged branches alive on `origin`.
- Deploying to any environment from a task branch or `copilot/*` branch.
- Using `--force` or `--force-with-lease` on `main` or `uat/first-slice`.
- Treating a diff review as a substitute for running the test suite.
- Branching from `main` for feature work (always start from `uat/first-slice`).

---

*Read next: [branching-and-sdlc.md](./branching-and-sdlc.md) for the daily working cycle and git commands.*
