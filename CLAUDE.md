# CLAUDE.md — AI Operating Contract for gigs.ge

> If you are an AI session working in this repository (Claude Code, Cowork orchestrator, or a dispatched sub-agent), read this file **first**, then read the documents it points to. Do not invent conventions. Match what is already here.

## Hard rules

1. **Never commit directly to `main` or `uat/first-slice`.** Always work on a task branch.
2. **One branch = one task = one PR.** No bundled changes. Out-of-scope findings become follow-up tickets, not silent fixes.
3. **Preflight every session.** Run `bash scripts/preflight.sh <task-branch>` before writing any code. The script is the gate.
4. **No dirty state across sessions.** End by committing, pushing as draft, or stashing with a label.
5. **Opus PR review is mandatory** before any squash-merge into `uat/first-slice`.
6. **Verify imports before adding them.** Every new dependency must exist in `package.json` / `pnpm-workspace.yaml`.

## Read these, in this order, before any change

1. [`docs/guides/branching-and-sdlc.md`](docs/guides/branching-and-sdlc.md) — how work moves through branches and the required working cycle.
2. [`docs/guides/sdlc-and-cicd.md`](docs/guides/sdlc-and-cicd.md) — PR rules, merge strategy, environments.
3. [`docs/STRATEGY.md`](docs/STRATEGY.md) — docs-as-code principles. Documentation lands in the same PR as code.
4. [`SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md) — the product surface you are touching.
5. [`docs/specs/agent-operating-contract.md`](docs/specs/agent-operating-contract.md) — the full per-ticket loop with model tiering and sub-agent dispatch rules.

## Domain skills

For domain-specific work, read the matching skill file under `.github/skills/<area>/SKILL.md` before generating code:

- Backend / API → `.github/skills/backend-api/SKILL.md`
- Database schema → `.github/skills/database-schema/SKILL.md`
- Billing / invoicing → `.github/skills/billing-invoicing/SKILL.md`
- Deal lifecycle → `.github/skills/deal-lifecycle/SKILL.md`
- Frontend (web) → `.github/skills/frontend-web/SKILL.md`
- Storage / uploads → `.github/skills/storage-upload/SKILL.md`
- Documentation → `.github/skills/docs-writer/SKILL.md`

## Per-ticket loop (summary)

1. **Plan.** Spec lives at `docs/specs/<ticket>.md`. If missing, stop and ask for it.
2. **Preflight.** `bash scripts/preflight.sh <task-branch>`.
3. **Implement.** One slice. Match existing patterns. Atomic commits. Conventional commit messages (`feat(api): ...`, `fix(web): ...`, `docs(specs): ...`).
4. **Local checks before pushing.** `pnpm --filter <package> lint && pnpm --filter <package> test` (or the narrowest meaningful executable validation for the change).
5. **Self-review.** Diff against the spec. Flag any scope drift.
6. **Open PR.** Target `uat/first-slice`. Title in conventional commit format. Description must list what changed, why, and how to verify. Link the spec.
7. **Opus review.** Run `/engineering:code-review` against the PR diff. Address findings on the same task branch.
8. **Merge.** Squash-merge into `uat/first-slice`. Delete the source branch.

## Sub-agent dispatch

When delegating work to a sub-agent defined under `.github/agents/`, pass:

1. The slice spec (`docs/specs/<ticket>.md`).
2. The relevant `.github/skills/<area>/SKILL.md` path.
3. The task constraints (out-of-scope list, deadline, target branch).

Do not duplicate product context into the sub-agent prompt. Agents pull product knowledge from repository documents — that is the rule established in [`docs/guides/agent-skills-map.md`](docs/guides/agent-skills-map.md).

## When you are unsure

Stop and ask. A blocked task is cheaper than a slop-merged PR.
