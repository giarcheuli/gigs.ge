# Project Coherence Framework — gigs.ge

**Purpose:** Establish a repeatable validation system to ensure every work unit (PR, spec, feature) remains logically coherent with the project's overall architecture, business rules, and constraints.

---

## The Core Challenge

As `gigs.ge` grows, the risk increases that:

- A spec conflicts with existing business rules (e.g., fee splits, auto-complete timers)
- A backend feature violates the access-control model (auth/verification flows)
- A frontend page breaks the visibility rules matrix
- A database change cascades silently into inconsistent state
- Integration points between domains (billing ↔ contracts ↔ disputes) fall out of sync

This framework prevents those failures by baking a **coherence check** into every task unit.

---

## High-Level Project Map

### Artifacts & Rationale

| Layer | Artifact | Purpose | Owner |
|-------|----------|---------|-------|
| **Product** | `SYSTEM_DESIGN.md` | Source of truth for user-facing behavior, workflows, business rules | Product Owner |
| **Architecture** | `docs/architecture/` | Data flows, state machines, integration points | Tech Lead |
| **Delivery** | `docs/guides/uat-readiness-handoff.md`, `docs/backlog.json` | Current milestone status, blockers, priorities | Delivery Owner |
| **Domain Skills** | `.github/skills/*/SKILL.md` (backend-api, database-schema, etc.) | Technical patterns, conventions, constraints per domain | Domain Experts |
| **Agents & Ops** | `.github/agents/*.md`, `CLAUDE.md` | How AI and humans coordinate, agent dispatch rules | Tech Lead |
| **Implementation** | Code + tests + specs | The realized product | Team |

### Key Rules Maintained Here

**Business logic** (lives in SYSTEM_DESIGN.md, enforced in code):

- Fee calculation: 3% poster, 2% worker on `agreed_price`
- 48h auto-complete (one party marks done → 48h silence → auto-complete)
- 24h grace period (cancel within 24h of signing = no fees)
- Half-time rule, 14-day overdue auto-complete, carry-over, disputes, contact-info visibility

**Auth model** (lives in architecture docs + backend skill):

- Access token: 15m JWT in memory
- Refresh token: 7d httpOnly cookie at `/api/v1/auth`
- Protected routes: require auth + optional verification state checks
- Seeded UAT accounts: pre-verified for walkthrough

**Data model** (lives in architecture docs + database skill):

- All timestamps: UTC, all UUIDs: `gen_random_uuid()`
- Enums: TEXT columns, not Postgres ENUM types
- Relations: user ↔ profile (1:1), user ↔ gigs (1:N), gig ↔ applications (1:N), etc.
- Transactions: used for atomicity on multi-table writes (user + profile creation, contract + ledger)

**Visibility model** (frontend skill + system design):

- Hidden fields: show "🔒 Request access" button
- Requestable fields: "📩 Request sent" state
- Contact info: only visible while contract is active
- Unverified users: cannot access certain actions

---

## Per-Task Coherence Checklist

**Before writing code, run this checklist:**

### 1. Spec ↔ System Design Coherence

- [ ] Spec's happy-path workflows exist in SYSTEM_DESIGN.md (or are explicitly new)
- [ ] Any new business rule (fee, timer, state transition) is listed in SYSTEM_DESIGN or product docs
- [ ] Spec does NOT contradict existing rules (e.g., doesn't bypass fee calculation)
- [ ] Access control assumptions match the auth model (who can see what, who can act)

**Failure mode:** Feature shipped that contradicts core rules, breaking downstream features.

### 2. Spec ↔ Architecture Coherence

- [ ] API endpoint shapes align with existing schema definitions in `packages/shared/schemas`
- [ ] Database writes are placed in transactions where atomicity matters (e.g., user + profile)
- [ ] New tables/columns align with existing naming (timestamps UTC, IDs UUID, enums TEXT)
- [ ] Data flow respects existing integration boundaries (e.g., billing ledger is written by contract handlers, not arbitrary sources)

**Failure mode:** Type mismatches at API boundaries, stale data in derived tables, hidden bugs in integration.

### 3. Code ↔ Spec Coherence

- [ ] Implementation covers 100% of acceptance criteria (not partial)
- [ ] Error handling surfaces server errors as specified (field-level vs form-level)
- [ ] Protected routes check the right auth/verification state
- [ ] Tests validate the full happy path, not just happy-path skeleton

**Failure mode:** Partial features, UAT walks stumble on edge cases, integration issues discovered late.

### 4. Code ↔ Domain Skill Coherence

- [ ] Backend routes follow patterns in `.github/skills/backend-api/SKILL.md`
- [ ] Database changes follow patterns in `.github/skills/database-schema/SKILL.md`
- [ ] Frontend components follow patterns in `.github/skills/frontend-web/SKILL.md`
- [ ] Billing logic uses ledger patterns from `.github/skills/billing-invoicing/SKILL.md`
- [ ] Disputes use state machine patterns from `.github/skills/deal-lifecycle/SKILL.md`

**Failure mode:** Ad-hoc code that diverges from established patterns, harder to maintain, harder to reason about.

### 5. PR ↔ Backlog Coherence

- [ ] PR implements exactly one backlog item (no bundled, out-of-scope fixes)
- [ ] PR scope matches the spec (no silent scope creep)
- [ ] Blockers and dependencies are flagged in PR description
- [ ] Follow-up work is tracked as new backlog items, not silent debt

**Failure mode:** Merged PRs that partially fix issues, leaving downstream teams confused.

---

## Running the Coherence Check

### Manual (for humans reviewing code)

1. Open the spec at `docs/specs/<ticket>.md`
2. Run the checklist above for each artifact layer
3. If any box fails, call out the specific misalignment
4. Use this template in PR review:

```

## Coherence Check ✓

- [x] Spec ↔ System Design: no rule conflicts, all new behavior documented
- [x] Spec ↔ Architecture: schema shapes match, DB atomicity respected
- [x] Code ↔ Spec: 100% acceptance criteria, error handling matches spec
- [x] Code ↔ Skill: follows backend-api patterns for route structure
- [x] PR ↔ Backlog: single backlog item, no scope creep

Ready for security review.
```

### Automated (via agents)

Invoke **Security & Coherence Agent** after every code push:

```bash
/security-coherence check feat/uat-auth-screens against architecture docs
```

The agent will:

1. Read the current branch's changes
2. Load the relevant spec (`docs/specs/feat-uat-auth-screens.md`)
3. Compare against SYSTEM_DESIGN.md, architecture docs, skill files
4. Flag misalignments, contradictions, pattern violations
5. Output a structured report: PASS / VETO with specific reasoning

---

## Domain Integration Points

These are the seams where correctness often breaks. Extra care needed:

### Auth ↔ Access Control

- All protected routes must verify `request.user` (backend)
- Sensitive pages must redirect to `/login?next=/requested` if not authenticated (frontend)
- Unverified users must be blocked from certain actions (spec defines which)

### Contracts ↔ Billing
- Every contract state transition must trigger ledger writes (atomicity in same transaction)
- Fee calculation uses `agreed_price` from contract, not original `priceFixed`
- Carry-over logic runs nightly, not on every invoice generation

### Gigs ↔ Applications ↔ Contracts
- Application rejection cannot happen after contract signing
- Gig deletion is only allowed if no applications exist OR all are rejected
- Contract creation consumes an application atomically

### Disputes ↔ Evidence ↔ Arbitration
- Evidence submission auto-advances dispute state
- 7-day auto-resolve timer only starts after first evidence
- Admin resolution decision cascades to contract, then to ledger

---

## How to Use This Framework

### When you start a task:

1. Read the spec at `docs/specs/<ticket>.md`
2. Read the relevant architecture doc
3. Run the coherence checklist before writing code
4. If any layer is unclear, ask delivery-orchestrator or domain expert

### When you finish:

1. Self-review your PR against the checklist
2. Invoke security-coherence agent: `/security-coherence approve <branch>`
3. Agent outputs PASS or VETO (with reasoning)
4. On VETO: fix the misalignment, re-check, re-submit
5. On PASS: proceed to human review

### When you review someone else's PR:

1. Verify their coherence-check box is ticked
2. Spot-check their code against domain skill patterns
3. If unsure, ask security-coherence agent
4. Approve once coherence is verified + functionality is correct

---

## Keeping Artifacts Current

| Artifact | Review Cycle | Owner | Trigger |
|----------|--------------|-------|---------|
| SYSTEM_DESIGN.md | Quarterly or post-UAT | Product | New business rules, scope changes |
| Architecture docs | Per-feature | Tech Lead | New integration points, schema changes |
| Domain skills | Per-feature | Domain expert | Pattern innovations, convention clarifications |
| Backlog | Weekly | Delivery | Completed work, new discoveries |
| Agent instructions | Per-major-change | Tech Lead | New domains, new roles, new dispatch rules |

---

## Success Criteria

You know this is working when:

- ✅ Specs clearly map to SYSTEM_DESIGN.md rules (no invented behavior)
- ✅ PRs rarely need coherence fixes post-merge
- ✅ Cross-team integration works on first try (billing + contracts, disputes + arbitration)
- ✅ New team members can onboard by reading SYSTEM_DESIGN + a skill file
- ✅ Security-coherence agent catches 90%+ of pattern violations before human review
- ✅ Backlog items are clearly sequenced (no hidden dependencies surface during coding)
