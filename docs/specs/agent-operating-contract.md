# Spec — Agent Operating Contract

## Why this exists

AI sessions (Claude Code, Cowork orchestrators, dispatched sub-agents) can do real product work in this repo, but they fail in two predictable ways: they generate code that doesn't match local conventions ("AI slop"), and they cause merge pain when multiple sessions accumulate parallel work on stale branches. This document defines the loop that prevents both.

It is the engineering counterpart to the strategic guides at [`docs/guides/branching-and-sdlc.md`](../guides/branching-and-sdlc.md) and [`docs/guides/sdlc-and-cicd.md`](../guides/sdlc-and-cicd.md). The CLAUDE.md at the repo root is the per-session entry point and points back here.

## Goal

One ticket. One spec. One branch. One PR. One Opus review. One squash-merge into `uat/first-slice`.

## Model tiering

Route work by *decision density*, not by capability. Each tier has a clear job.

| Model | Use for |
|---|---|
| **Opus 4.7** | Spec/PRD writing, architecture decisions (ADRs), system design, PR review, hard debugging, security review |
| **Sonnet 4.6** | Ticket implementation, tests against a clear spec, scoped refactors, mechanical changes that still need judgment |
| **Haiku 4.5** | Formatting, lint fixes, dependency bumps, file moves, doc-string updates, bulk renames |

Rule of thumb: if the work has one obvious correct answer, use the cheaper model. Reserve Opus for steps where a wrong decision costs you a lot of follow-up work.

## Per-ticket loop

```
┌─ 1. PLAN   (Cowork chat, Opus)
│    • Read the backlog item from docs/backlog.json
│    • Run /product-management:write-spec
│    • Save spec at docs/specs/<ticket>.md
│    • Commit on a docs/ task branch, PR → uat/first-slice, merge
│
├─ 2. PREFLIGHT   (Claude Code CLI)
│    • bash scripts/preflight.sh feat/<ticket>
│      (asserts clean tree, FFs uat/first-slice, creates task branch)
│
├─ 3. IMPLEMENT   (Claude Code, Sonnet)
│    • Read spec, then read matching .github/skills/<area>/SKILL.md
│    • Match existing code patterns (grep neighboring files first)
│    • Atomic commits, conventional commit messages
│    • Run pnpm --filter <package> lint && test after meaningful changes
│
├─ 4. SELF-REVIEW   (Claude Code, Sonnet, same session)
│    • Diff own changes against the spec
│    • Flag any scope drift, fix it or note as a follow-up ticket
│
├─ 5. OPEN PR
│    • Target: uat/first-slice
│    • Title: conventional commit format
│    • Description: what / why / how to verify
│    • Link the spec at docs/specs/<ticket>.md
│
├─ 6. OPUS REVIEW   (Cowork chat, Opus)
│    • Run /engineering:code-review against the PR diff
│    • Address findings on the same task branch
│    • Re-review if changes are non-trivial
│
└─ 7. MERGE   (squash) → delete branch
     • main is updated only at UAT milestones, never per-ticket
```

## Sub-agent dispatch

The repo already defines reusable agent specs at `.github/agents/`. Dispatch them when the work is large enough that a fresh, focused context is cheaper than continuing in the orchestrator's already-loaded session.

| Agent | When to dispatch |
|---|---|
| `delivery-orchestrator` | "What should happen next and why?" — backlog reprioritization, milestone calls, go/no-go assessments |
| `backend-workflow-builder` | API / service / persistence implementation against a clear spec |
| `test-strategy-agent` | Test plan, coverage assessment, acceptance criteria translation |
| `documentation-handoff-agent` | Stakeholder-facing summaries, doc reorganizations, readiness handoffs |

A dispatched sub-agent receives, at minimum:

1. The slice spec (`docs/specs/<ticket>.md`).
2. The relevant `.github/skills/<area>/SKILL.md` path.
3. The task constraints (explicit out-of-scope list, target branch, deadline).

Sub-agents do **not** receive duplicated product context inside their prompt. They read product knowledge from repo documents, per the rule in [`docs/guides/agent-skills-map.md`](../guides/agent-skills-map.md).

## Anti-slop guards

1. **Pattern match before generating.** Grep neighboring files in the same package. New code must look like the code around it.
2. **Verify imports.** Every new dependency must already exist in `package.json` or `pnpm-workspace.yaml`. If it doesn't, the dep gets added in its own commit with a one-line justification.
3. **One branch, one task, one PR.** No bundled changes. Out-of-scope findings → follow-up ticket, never silent fixes.
4. **Preflight every session.** No exceptions. The script (`scripts/preflight.sh`) is the gate.
5. **Opus review is non-optional** before merge into `uat/first-slice`. Even one-line fixes go through it.
6. **CLAUDE.md is the entry point.** Every new AI session reads it before touching files. The file points to the docs that carry product memory.
7. **No commits to `main` or `uat/first-slice` directly.** Task branches only.

## Human touchpoints

The product owner has exactly three points of involvement per ticket:

1. **Product input** — "Here's what to build / fix / change."
2. **Spec approval** — "Yes, the spec captures it" or "no, change X."
3. **PR approval** — "Yes, merge it" or "no, this looks wrong."

Everything between those touchpoints is the AI's responsibility: branching, commits, tests, lint, CI, conventions, rebases, squash merges. If the product owner is making git decisions, the workflow is broken.

## Open questions for future iteration

- Should the Opus review step become an automated CI step (e.g., a GitHub Action that posts the review as a PR comment) rather than a manual chat invocation?
- Do we want per-area Cowork session templates that pre-load the relevant SKILL.md?
- When does `uat/first-slice` graduate to `main`? Currently defined as "milestone boundary reached, UAT accepted" — what is the explicit checklist?
- Should sub-agent dispatch be logged somewhere durable (e.g., a `docs/agent-runs/` ledger) for traceability?
