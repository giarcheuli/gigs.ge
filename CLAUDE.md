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
5. [`docs/guides/project-coherence-framework.md`](docs/guides/project-coherence-framework.md) — coherence checks and validation gates before every commit.
6. [`docs/specs/agent-operating-contract.md`](docs/specs/agent-operating-contract.md) — the full per-ticket loop with model tiering and sub-agent dispatch rules.

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

1. **Plan.** Spec lives at `docs/specs/<ticket>.md`. If missing, stop and ask for it. Read the coherence framework checklist.
2. **Coherence pre-check.** Before coding: Does the spec contradict any rules in SYSTEM_DESIGN.md? Any auth assumptions? Any database atomicity needs? Use the checklist at [`docs/guides/project-coherence-framework.md`](docs/guides/project-coherence-framework.md).
3. **Preflight.** `bash scripts/preflight.sh <task-branch>`.
4. **Implement.** One slice. Match existing patterns. Atomic commits. Conventional commit messages (`feat(api): ...`, `fix(web): ...`, `docs(specs): ...`).
5. **Local checks before pushing.** `pnpm --filter <package> lint && pnpm --filter <package> test` (or the narrowest meaningful executable validation for the change).
6. **Self-review.** Diff against the spec. Run the coherence checklist on your code. Flag any scope drift or rule violations.
7. **Security & coherence gate.** Push your branch, then invoke `/security-coherence approve <branch>`. Wait for PASS or VETO. If VETO, fix the issues and re-run.
8. **Open PR.** Target `uat/first-slice`. Title in conventional commit format. Description must list what changed, why, and how to verify. Link the spec. Include your coherence & security checks in PR description.
9. **Opus review.** Run `/engineering:code-review` against the PR diff. Address findings on the same task branch.
10. **Merge.** Squash-merge into `uat/first-slice`. Delete the source branch.

## Sub-agent dispatch

When delegating work to a sub-agent defined under `.github/agents/`, pass:

1. The slice spec (`docs/specs/<ticket>.md`).
2. The relevant `.github/skills/<area>/SKILL.md` path.
3. The task constraints (out-of-scope list, deadline, target branch).

Do not duplicate product context into the sub-agent prompt. Agents pull product knowledge from repository documents — that is the rule established in [`docs/guides/agent-skills-map.md`](docs/guides/agent-skills-map.md).

## When you are unsure

Stop and ask. A blocked task is cheaper than a slop-merged PR.
