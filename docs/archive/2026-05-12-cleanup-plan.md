# Documentation Cleanup Plan — gigs.ge

**Date:** 2026-05-12  
**Scope:** Full audit of 19 markdown docs + 1 JSON backlog  
**Total lines:** 2,950  
**Goal:** Eliminate redundancy, clarify navigation, enforce 200-line atomic principle

---

## Executive Summary

**Status:** ~60% Well-Organized, ~40% Needs Cleanup

| Issue | Count | Severity |
|-------|-------|----------|
| Overlapping/redundant content | 5 pairs | 🟡 Medium |
| Docs exceeding 200-line atomic limit | 5 docs | 🟡 Medium |
| Poor navigation (missing cross-refs) | 3 docs | 🟡 Medium |
| Stale or unclear purpose | 2 docs | 🟠 Low-Medium |
| Missing index/roadmap | 1 gap | 🟡 Medium |

**Cleanup effort:** ~3–4 hours (refactoring + consolidation)  
**Benefit:** Faster onboarding, clearer doc discovery, reduced reader confusion

---

## Current State Analysis

### Good News ✅

- Clear naming (files are self-documenting: `uat-runbook.md`, `auth-flow.md`, etc.)
- Mostly follows "Docs-as-Code" principle (written in parallel with code)
- Architecture docs are well-structured (3 small, focused docs)
- STRATEGY.md is concise (14 lines, defines principles)
- Specs are detailed and acceptance-criteria-focused
- All docs have titles (no orphans)
- No marked TODOs/FIXMEs (good discipline)

### Issues Found 🔴

#### **Issue 1: Redundancy Between Multiple SDLC/Workflow Docs**

**Problem:** SDLC guidance is split across 4 docs with overlapping content.

| Doc | Lines | Purpose | Content |
|-----|-------|---------|---------|
| `branching-and-sdlc.md` | 174 | Branch strategy | When to use main, uat/first-slice, task branches |
| `sdlc-and-cicd.md` | 190 | PR rules + CI | PR format, merge strategy, environments |
| `custom-ai-agents.md` | 210 | Agent usage | Agent invocation, memory patterns, dispatch |
| `agent-skills-map.md` | 102 | Agent doc selection | Which docs agents read first |

**Overlap:** All 4 touch "how agents and humans coordinate" but from different angles.  
**Reader confusion:** A developer asks "what's the PR format?" and has to check both `branching-and-sdlc.md` and `sdlc-and-cicd.md`.

**Redundancy examples:**
- `branching-and-sdlc.md:30–40` explains task branches
- `sdlc-and-cicd.md:10–20` also explains branches (slightly differently)
- Both mention "one branch = one PR" but with different emphasis

---

#### **Issue 2: Docs Exceeding 200-Line Atomic Limit**

**STRATEGY.md principle:** "If a file exceeds 200 lines, split it."

**Violators:**
- `custom-ai-agents.md` — 210 lines (agent templates embedded as code blocks)
- `sdlc-and-cicd.md` — 190 lines (close; contains PR rules + environments + merge strategy)
- `security-coherence-quickstart.md` — 302 lines (NEW: too long for "quickstart")
- `strategic-optimization-summary.md` — 312 lines (NEW: too long for "summary")
- `OPTIMIZATION_COMPLETE.md` — 344 lines (NEW: too long; more of a full guide)

**Why this matters:** Docs over 200 lines are harder to scan, harder to update, and break the atomic principle.

---

#### **Issue 3: Unclear Purpose / Audience Confusion**

**Problem:** Two docs have overlapping scope.

| Doc | Purpose | Audience | Problem |
|-----|---------|----------|---------|
| `custom-ai-agents.md` | Agent design principles | Architects designing agents | Contains raw agent templates (should be in `.github/agents/`) |
| `agent-skills-map.md` | Which docs agents read | Developers + agents | Very short (102 lines); should be consolidated with `custom-ai-agents.md` |

**Reader confusion:** Developer asks "how do agents work?" → finds both docs → has to read both.

---

#### **Issue 4: Navigation & Discoverability**

**Problem:** No clear entry point or roadmap.

Currently, a new developer has to:
1. Read `getting-started.md` (local setup)
2. Guess which other docs matter
3. Jump between `docs/guides/`, `docs/architecture/`, `docs/specs/` without clear hierarchy

**What's missing:**
- A `docs/README.md` or `docs/INDEX.md` that maps all 19 docs by audience and purpose
- Clear "start here" guidance for different roles (developer, reviewer, architect)
- Linked "next step" sections (getting-started.md ends with suggestions, but no navigation sidebar)

---

#### **Issue 5: New Optimization Docs Are Too Long**

The three docs I just created (to implement 200% optimization) violate the 200-line principle:
- `security-coherence-quickstart.md` — 302 lines (should be ~150)
- `strategic-optimization-summary.md` — 312 lines (should be ~200)
- `OPTIMIZATION_COMPLETE.md` — 344 lines (should be ~150, with links to specifics)

**Why this matters:** They're **new** docs that set a bad example. Need to split them immediately.

---

#### **Issue 6: Spec vs. Guide Boundary is Fuzzy**

**Problem:** `feat-uat-auth-screens.md` is a spec (137 lines) but lives in `docs/specs/`.  
`agent-operating-contract.md` is also a spec but mixes:
- Spec of the per-ticket loop (belongs in spec)
- Agent dispatch rules (belongs in guide)

**Result:** Reader looking for "how do I implement this feature?" bounces between spec and guide.

---

#### **Issue 7: Test Docs Scattered**

**Current state:**
- `jest-setup.md` — Backend test harness decisions (52 lines)
- `docs/guides/` — No test strategy guide
- `.github/agents/test-strategy-agent.agent.md` — Agent for test work

**Problem:** A developer looking for "test patterns" has to find these in different places.

**Should be:** Single `test-strategy-guide.md` (or section in a testing guide).

---

#### **Issue 8: UAT Docs Have Overlapping Scope**

| Doc | Lines | Purpose | Audience |
|-----|-------|---------|----------|
| `uat-readiness-handoff.md` | 63 | What's implemented, what blocks UAT | Tech Lead |
| `uat-runbook.md` | 228 | Step-by-step UAT walkthrough script | QA / Stakeholders |
| `uat-test-accounts.md` | 59 | Credentials for seeded accounts | QA / Stakeholders |

**Boundary:** `uat-readiness-handoff.md` says "here's what works"; `uat-runbook.md` says "here's how to test it."  
**Issue:** A stakeholder reads `uat-readiness-handoff.md` expecting the walkthrough script, but has to read `uat-runbook.md` instead.

**Better:** Consolidate into a single "UAT Guide" (readiness state + runbook script + test accounts).

---

#### **Issue 9: Architecture Docs Could Be Consolidated**

| Doc | Lines | Scope |
|-----|-------|-------|
| `auth-flow.md` | 128 | JWT, refresh token, guards |
| `database-design.md` | 117 | Schema conventions, table map |
| `monorepo-structure.md` | 65 | Why monorepo, Turborepo, pnpm |

**Status:** These are good individually, but a reader new to the project might want a single "architecture overview" that links to all three.

**Solution:** Add `docs/architecture/README.md` or `ARCHITECTURE_OVERVIEW.md` that frames all three.

---

#### **Issue 10: Missing "Quick Reference" Cards**

**Problem:** A lot of operational info is buried in prose.

Examples:
- "What commands do I run?" — spread across `getting-started.md` and skill files
- "What are the branch names?" — in `branching-and-sdlc.md` but not tabular
- "What does my PR description need?" — in `sdlc-and-cicd.md` as prose, hard to scan

**Solution:** Add a `docs/QUICK_REFERENCE.md` with condensed command tables and checklists.

---

## Cleanup Plan (Prioritized)

### Phase 1: Immediate (High Impact, Low Effort) 🟢

#### 1.1 Create `docs/README.md` (Navigation Hub)

**Purpose:** Single entry point for all docs, organized by audience and purpose.

**Content outline:**
```markdown
# Documentation

## 🏃 Quick Start
- For local setup → getting-started.md
- For first feature → CLAUDE.md + project-coherence-framework.md
- For security review → security-coherence-quickstart.md

## 👨‍💻 For Developers
- [Local Setup](guides/getting-started.md)
- [Branch & SDLC](guides/branching-and-sdlc.md)
- [Security & Coherence](guides/security-coherence-quickstart.md)
- [Test Strategy](guides/test-strategy-guide.md)
- [Domain Skills](.github/skills/)

## 🏗️ Architecture
- [Overview](#architecture-overview) ← NEW
- [Monorepo](architecture/monorepo-structure.md)
- [Auth Flow](architecture/auth-flow.md)
- [Database](architecture/database-design.md)

## 🤖 AI Agents & Automation
- [Agent Skills Map](guides/agent-skills-map.md)
- [Custom Agents](guides/custom-ai-agents.md)
- [Available Agents](.github/agents/README.md)

## 📋 Specs & Delivery
- [System Design](SYSTEM_DESIGN.md)
- [Backlog](backlog.json)
- [Specs](specs/)

## 🎯 UAT
- [UAT Guide](guides/uat-guide.md)
```

**Size:** ~80 lines (small, scannable)  
**Effort:** 30 min

---

#### 1.2 Create `docs/QUICK_REFERENCE.md`

**Purpose:** Condensed command checklists, branch names, PR format.

**Content:**
```markdown
# Quick Reference

## 🔧 Common Commands
| Task | Command |
|------|---------|
| Local setup | `pnpm install && createdb gigsge && pnpm db:push` |
| Start all apps | `pnpm dev` |
| Run tests | `pnpm --filter @gigs/api test` |
| Lint | `pnpm --filter @gigs/api lint` |
| Security check | `/security-coherence approve <branch>` |

## 🌳 Branch Names
- `main` — stable baseline
- `uat/first-slice` — current UAT integration
- `feat/your-feature` — task branch from uat/first-slice
- `fix/bug-name` — bug fix branch

## 📝 PR Checklist
- [ ] Title: `feat(api): ...` or `fix(web): ...`
- [ ] Link spec and backlog item
- [ ] Include coherence + security checks
- [ ] Add test plan
- [ ] Screenshots/Loom for UI changes

## 🔒 Security Gate
Before opening PR:
```bash
git push origin <branch>
/security-coherence approve <branch>
# wait for PASS ✓
gh pr create ...
```

## 📂 Doc Map
- Getting started? → docs/guides/getting-started.md
- Auth architecture? → docs/architecture/auth-flow.md
- Writing a feature? → docs/guides/project-coherence-framework.md
- Deploying? → docs/guides/sdlc-and-cicd.md
```

**Size:** ~100 lines  
**Effort:** 45 min

---

#### 1.3 Split `security-coherence-quickstart.md` (302 lines → 150 + 2 linked docs)

**Current:** One monolithic quickstart  
**Problem:** Too long, mixes multiple concerns (theory + practice + reference)

**Split into:**

**A. `docs/guides/security-coherence-workflow.md` (150 lines)**
- Title: "Security & Coherence Workflow"
- Content: The 5-step developer workflow (code → push → check → PASS/VETO → PR)
- Audience: Daily reference for developers

**B. `docs/guides/security-coherence-scenarios.md` (150 lines)**
- Title: "Security & Coherence: Common Scenarios"
- Content: Real examples (agent disagrees, code is urgent, need extra checks)
- Audience: Troubleshooting

**C. Keep:** `CLAUDE.md` references → updated to point to new workflow doc

**Effort:** 1 hour

---

#### 1.4 Split `strategic-optimization-summary.md` (312 lines → 150 + 200 reference)

**Current:** One summary trying to cover everything  
**Problem:** Too long for a "summary"

**Split into:**

**A. `docs/guides/optimization-summary.md` (150 lines)**
- Title: "200% Optimization: Why & What"
- Content: Gaps identified, solutions, benefits
- Audience: Stakeholders, Tech Lead (why this matters)

**B. Keep:** `OPTIMIZATION_COMPLETE.md` as implementation reference (detailed, long, reference doc)

**Effort:** 1 hour

---

### Phase 2: Medium (Reduce Redundancy) 🟡

#### 2.1 Consolidate `custom-ai-agents.md` + `agent-skills-map.md`

**Current state:**
- `custom-ai-agents.md` (210 lines) — Agent design patterns + raw templates
- `agent-skills-map.md` (102 lines) — Doc consultation rules

**Problem:**
- Overlapping scope (both about how agents work)
- `custom-ai-agents.md` contains raw templates (should be in `.github/agents/` only)
- Reader confusion: "where do I learn about agents?"

**Solution:**

**A. Move:** Raw agent templates from `custom-ai-agents.md` → `.github/agents/AGENT_TEMPLATES.md`

**B. Consolidate:** `custom-ai-agents.md` + `agent-skills-map.md` → `docs/guides/ai-agents-guide.md` (150 lines)
- Section 1: Agent architecture (principles)
- Section 2: Skills map (doc consultation rules)
- Section 3: How to invoke agents
- Links to: `.github/agents/AGENT_TEMPLATES.md` for raw templates

**C. Create:** `.github/agents/AGENT_TEMPLATES.md` (100 lines)
- Raw Markdown templates for new agents
- Each agent as a copy-paste block

**Effort:** 1.5 hours

---

#### 2.2 Deduplicate SDLC Guidance

**Current:** SDLC split across 3 docs (branching-and-sdlc, sdlc-and-cicd, custom-ai-agents)

**Problem:** Reader asks "what's my PR format?" → has to check 2 docs

**Solution:**

**A. `docs/guides/branching-and-sdlc.md` (174 lines) — Keep as-is**
- Scope: Branch strategy, task branches, delivery order
- Audience: All developers

**B. `docs/guides/sdlc-and-cicd.md` (190 lines) → SPLIT**
- Move "PR rules" section → `docs/guides/pr-checklist-and-merge.md` (80 lines)
- Move "CI/CD" section → Keep in `sdlc-and-cicd.md`, retitle to "CI/CD Policy" (80 lines)
- Result: Two focused docs instead of one long one

**C. Link:** All three docs cross-reference each other in "Related" section

**Effort:** 1 hour

---

#### 2.3 Consolidate UAT Docs

**Current:**
- `uat-readiness-handoff.md` (63 lines) — What's done, what blocks
- `uat-runbook.md` (228 lines) — Step-by-step walkthrough
- `uat-test-accounts.md` (59 lines) — Credentials

**Problem:** Reader looking for "how to UAT?" bounces between 3 docs

**Solution:**

**Create:** `docs/guides/uat-guide.md` (200 lines total)
- Section 1: Readiness state (from handoff doc) — 40 lines
- Section 2: Test accounts (from test-accounts doc) — 20 lines
- Section 3: UAT walkthrough script (from runbook doc) — 130 lines
- Section 4: Troubleshooting — 10 lines

**Keep:** `uat-test-accounts.md` as standalone if devs frequently reference it for seeding. Otherwise, move to uat-guide.md appendix.

**Mark:** Old `uat-runbook.md` and `uat-readiness-handoff.md` with deprecation notice:
```markdown
> **Deprecated (2026-05-12):** This content has been consolidated into 
> [UAT Guide](uat-guide.md). See that document for current info.
```

**Effort:** 1.5 hours

---

### Phase 3: Polish (Better Organization) 🔵

#### 3.1 Create `docs/architecture/README.md`

**Purpose:** Frame the 3 architecture docs as a coherent whole.

**Content:**
```markdown
# Architecture Overview

gigs.ge is organized as a monorepo with clear separation between the API, 
the user-facing web app, and shared domain logic.

## Architecture Layers

### Application Layer
- **User app** (`apps/web`): Next.js 14, fetches from API
- **Admin app** (`apps/admin`): Next.js 14, admin functions
- **API** (`apps/api`): Fastify + Drizzle ORM

### Shared Layer
- **Schema** (`packages/shared`): Zod schemas, TypeScript types, constants
- All apps consume from shared; one source of truth

### Infrastructure Layer
- **Database**: PostgreSQL 16 with Drizzle ORM
- **Cache**: Redis (BullMQ for job queue)
- **Storage**: Cloudflare R2 (S3-compatible)

## Design Principles

1. **Type-Safe Monorepo**: Schema changes break the build everywhere
2. **Shared Validation**: Zod schemas shared between API and frontend
3. **Atomic Transactions**: Multi-table writes wrapped in `db.transaction()`
4. **JWT + HttpOnly Cookies**: Access token in memory, refresh in cookie

## Detailed Guides

- [Monorepo Structure](monorepo-structure.md) — Why Turborepo + pnpm, folder layout
- [Auth Flow](auth-flow.md) — JWT, refresh token, guards, session model
- [Database Design](database-design.md) — Schema conventions, enums, relations

## Key Files

- `SYSTEM_DESIGN.md` — Full product spec
- `packages/shared/src/schemas/` — All Zod validation schemas
- `apps/api/src/db/schema/` — All database table definitions
- `apps/api/src/routes/` — API route groups by domain

**Read this first if:** You're new to the project and want to understand the big picture.
```

**Size:** ~80 lines  
**Effort:** 45 min

---

#### 3.2 Create `docs/guides/test-strategy-guide.md`

**Purpose:** Consolidate test guidance (currently scattered).

**Content:**
```markdown
# Test Strategy Guide

## Backend Test Harness

_See also: `docs/jest-setup.md` for implementation details._

### Test Levels

1. **Unit**: Pure functions (password hashing, fee calc)
2. **Integration**: Request-level (route + validation + guards, no real DB)
3. **E2E**: Full stack (may hit real DB in CI)

### When to Write What

| Test Type | When to Use | Coverage |
|-----------|------------|----------|
| Unit | Pure helpers, validation logic | 100% of pure functions |
| Integration | Route behavior, guards, error handling | Happy path + major error cases |
| E2E | Cross-domain flows, real DB | Critical user journeys after UAT |

### Running Tests

```bash
pnpm --filter @gigs/api test              # All tests
pnpm --filter @gigs/api test -- --watch   # Watch mode
pnpm --filter @gigs/api test:coverage     # Coverage report
```

### Frontend Test Strategy

_Status: To be defined. See backlog._

## Test Fixtures & Mocks

- Auth: Mock user tokens
- DB: Mock Drizzle queries
- API: Mock fetch for client tests

## Deprecation: jest-setup.md

_This guide supersedes `docs/jest-setup.md`. That doc documents 
implementation details; this doc covers strategy._
```

**Size:** ~100 lines  
**Effort:** 45 min

---

#### 3.3 Add Navigation Sidebar to Key Docs

**Current:** Docs have "Related" sections but no visual navigation.

**Solution:** Add consistent navigation header + footer to all guides:

```markdown
# [Doc Title]

> **In this guide:**  
> [Section 1](#section-1) · [Section 2](#section-2) · [Troubleshooting](#faq)

---

[content]

---

## Related Guides

- [Branching & SDLC](branching-and-sdlc.md)
- [Security & Coherence](security-coherence-workflow.md)
- [Project Coherence Framework](project-coherence-framework.md)

**Previous:** [Getting Started](getting-started.md) · **Next:** [Feature Development](project-coherence-framework.md)
```

**Docs to update:** All 15 guide docs  
**Effort:** 2 hours (mechanical)

---

### Phase 4: Enforce Standards (Going Forward) 🟢

#### 4.1 Update STRATEGY.md

**Add section:**
```markdown
## Doc Structure & Navigation

1. **Title**: `# Descriptive Title` at the top
2. **Quick nav**: "In this guide: [links to sections]"
3. **Body**: Sections, subsections, examples
4. **Related**: Links to related docs
5. **Navigation footer**: "Previous / Next" links
6. **Atomic size**: Keep under 200 lines; split if needed

Example structure:
- Intro (5 lines)
- Quick start or overview (20 lines)
- Main content (100 lines, split into 2–4 subsections)
- FAQ or troubleshooting (20 lines)
- Related & navigation (10 lines)
```

**Effort:** 15 min

---

#### 4.2 Create `docs/CONTRIBUTING.md`

**Purpose:** Guide for keeping docs in sync with code.

**Content:**
```markdown
# Documentation Contributing Guide

Every code change should have a corresponding doc update.

## Rule 1: Atomic Size (≤ 200 lines)

If a doc exceeds 200 lines, split it:
- Create a new focused doc
- Keep the original as a hub with links
- Example: `security-coherence-workflow.md` (150 lines) + `security-coherence-scenarios.md` (100 lines)

## Rule 2: Synchronous Updates

1. Code change → Spec update (same PR)
2. Spec implemented → Guide update (same PR)
3. Discovery → Backlog → Doc note (same sprint)

## Rule 3: Clear Purpose

Every doc should answer:
- "Who is the audience?"
- "What decision/action will they take after reading?"
- "What's the 'next step'?"

## Rule 4: Navigation

Every guide must link:
- **To:** Related guides
- **From:** Previous/next in learning path

## Checklist Before Committing

- [ ] Title is descriptive
- [ ] Intro explains "why" + "for whom"
- [ ] All sections are scannable (short, bold headers)
- [ ] Code examples are correct + tested
- [ ] Links to architecture/specs are accurate
- [ ] Doc does not exceed 200 lines (or is intentionally long + split)
- [ ] Related guides are linked at bottom

## Finding the Right Home

| Content | Location |
|---------|----------|
| Product spec | `docs/specs/feat-*.md` |
| Architecture decision | `docs/architecture/` |
| How-to guide | `docs/guides/` |
| Dev tooling decision | `docs/jest-setup.md` or similar |
| Onboarding | `docs/guides/getting-started.md` or `README.md` |
| Quick checklist | `docs/QUICK_REFERENCE.md` |
```

**Size:** ~80 lines  
**Effort:** 30 min

---

## Summary Table: Cleanup Actions

| Action | Type | Effort | Impact | Priority |
|--------|------|--------|--------|----------|
| Create `docs/README.md` (navigation hub) | Add | 30 min | 🔴 High | P0 |
| Create `docs/QUICK_REFERENCE.md` | Add | 45 min | 🟡 Medium | P0 |
| Split `security-coherence-quickstart.md` | Refactor | 1 hr | 🟡 Medium | P0 |
| Split `strategic-optimization-summary.md` | Refactor | 1 hr | 🟠 Low | P1 |
| Consolidate SDLC guidance | Refactor | 1.5 hr | 🟡 Medium | P1 |
| Consolidate UAT docs | Refactor | 1.5 hr | 🟡 Medium | P1 |
| Consolidate agent docs | Refactor | 1.5 hr | 🟡 Medium | P1 |
| Create `docs/architecture/README.md` | Add | 45 min | 🟡 Medium | P1 |
| Create `test-strategy-guide.md` | Add | 45 min | 🟠 Low | P2 |
| Add navigation to all guides | Polish | 2 hr | 🟠 Low | P2 |
| Update `STRATEGY.md` with standards | Update | 15 min | 🔴 High | P1 |
| Create `docs/CONTRIBUTING.md` | Add | 30 min | 🔴 High | P1 |
| **Total** | — | **~12 hrs** | — | — |

---

## Recommended Rollout

### Week 1: Foundation (P0 — 3 hours)

1. Create `docs/README.md` (30 min) + `docs/QUICK_REFERENCE.md` (45 min) → **New developers get clear entry point**
2. Split `security-coherence-quickstart.md` (1 hr) → **Follows atomic principle**
3. Update CLAUDE.md to link to new `security-coherence-workflow.md` (15 min)

**Benefit:** Immediate improvement in onboarding friction. New devs spend less time searching.

---

### Week 2: Organization (P1 — 5 hours)

4. Split `strategic-optimization-summary.md` (1 hr)
5. Consolidate SDLC docs (1.5 hr)
6. Consolidate UAT docs (1.5 hr)
7. Update `STRATEGY.md` with doc standards (15 min)
8. Create `docs/CONTRIBUTING.md` (30 min)

**Benefit:** Reduced duplication, clearer standards for future docs.

---

### Week 3: Polish (P2 — 4 hours)

9. Consolidate agent docs (1.5 hr)
10. Create `docs/architecture/README.md` (45 min)
11. Create `test-strategy-guide.md` (45 min)
12. Add navigation to all guides (2 hr)
13. Deprecate old UAT docs with pointers

**Benefit:** Better navigation, clearer architecture learning path.

---

## File-by-File Action Plan

### 🟢 Keep As-Is (No Changes)

- `SYSTEM_DESIGN.md` (root) — Product spec, source of truth
- `docs/STRATEGY.md` — Define doc principles (will add standards section)
- `docs/architecture/auth-flow.md` — Focused, 128 lines ✓
- `docs/architecture/database-design.md` — Focused, 117 lines ✓
- `docs/architecture/monorepo-structure.md` — Focused, 65 lines ✓
- `docs/guides/getting-started.md` — Focused, 122 lines ✓
- `docs/guides/branching-and-sdlc.md` — Focused, 174 lines ✓
- `docs/guides/project-coherence-framework.md` — Focused, 224 lines ✓
- `docs/guides/agent-skills-map.md` — Will merge into consolidated agent guide
- `docs/jest-setup.md` — Will create `test-strategy-guide.md` that references this

### 🟡 Refactor (Split/Consolidate)

- `docs/guides/security-coherence-quickstart.md` (302 lines) → **Split into:**
  - `security-coherence-workflow.md` (150 lines) — The 5-step workflow
  - `security-coherence-scenarios.md` (100 lines) — Common questions
  
- `docs/guides/strategic-optimization-summary.md` (312 lines) → **Split into:**
  - `optimization-summary.md` (150 lines) — Why & what
  - Keep `OPTIMIZATION_COMPLETE.md` (344 lines) as detailed reference

- `docs/guides/custom-ai-agents.md` (210 lines) + `agent-skills-map.md` (102 lines) → **Consolidate into:**
  - `ai-agents-guide.md` (150 lines) — Architecture + skills map + how to invoke
  - Create `.github/agents/AGENT_TEMPLATES.md` (100 lines) — Raw templates

- `docs/guides/sdlc-and-cicd.md` (190 lines) → **Split into:**
  - `pr-checklist-and-merge.md` (80 lines) — PR format, merge strategy
  - `ci-cd-policy.md` (80 lines) — Environments, deploy rules

- `docs/guides/uat-readiness-handoff.md` (63 lines) + `uat-runbook.md` (228 lines) + `uat-test-accounts.md` (59 lines) → **Consolidate into:**
  - `uat-guide.md` (200 lines) — Readiness + accounts + script
  - Mark old docs deprecated

### 🟢 Create (New)

- `docs/README.md` (80 lines) — **Navigation hub, entry point**
- `docs/QUICK_REFERENCE.md` (100 lines) — **Commands, branches, PR format**
- `docs/CONTRIBUTING.md` (80 lines) — **How to keep docs in sync**
- `docs/architecture/README.md` (80 lines) — **Frame the 3 architecture docs**
- `docs/guides/test-strategy-guide.md` (100 lines) — **Test strategy consolidated**
- `docs/guides/security-coherence-workflow.md` (150 lines) — **From split of quickstart**
- `docs/guides/security-coherence-scenarios.md` (100 lines) — **From split of quickstart**
- `docs/guides/optimization-summary.md` (150 lines) — **From split of strategic summary**
- `docs/guides/ai-agents-guide.md` (150 lines) — **From consolidation of agent docs**
- `docs/guides/pr-checklist-and-merge.md` (80 lines) — **From split of sdlc-and-cicd**
- `docs/guides/uat-guide.md` (200 lines) — **From consolidation of UAT docs**
- `.github/agents/AGENT_TEMPLATES.md` (100 lines) — **Raw templates from custom-ai-agents.md**

### 🟡 Update (Cross-Refs, Headers)

- Update `docs/STRATEGY.md` → Add doc standards section
- Update `CLAUDE.md` → Point to `security-coherence-workflow.md`
- Update `.github/agents/README.md` → Link to consolidated agent guide
- Add navigation headers to all `docs/guides/*.md` files

---

## Expected Outcomes

### Before Cleanup

```
New developer looks for "how do I run tests?"
→ Checks getting-started.md (doesn't have it)
→ Checks jest-setup.md (too technical)
→ Checks custom-ai-agents.md? (wrong doc)
→ Gives up, asks in Slack
```

### After Cleanup

```
New developer checks docs/README.md
→ Finds link to QUICK_REFERENCE.md
→ Finds exact command: pnpm --filter @gigs/api test
→ Done in 2 minutes
```

---

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Avg doc size | 155 lines | <120 lines (90% < 200) |
| Docs exceeding 200 lines | 5 | 1 (intentional reference doc) |
| New dev time to "write first feature" | ~2 hrs | ~45 min |
| Doc redundancy pairs | 5 | 0 |
| Navigation clarity score (1–5) | 2 | 5 |
| Time to find "how do I X?" | ~10 min | ~2 min |

---

## Not In Scope (Future Work)

- [ ] Migrating docs to a wiki (GitHub Pages, Confluence, etc.)
- [ ] Adding automated doc linting
- [ ] Generating API docs from code
- [ ] Building a searchable docs portal
- [ ] Multi-language translation

---

## Timeline

**Start:** 2026-05-13 (after optimization review)  
**Finish:** 2026-05-24 (2 weeks, part-time)  
**By UAT:** All docs clean + navigation working

This cleanup happens **in parallel** with feature work. It's not blocking UAT, but it enables faster onboarding for new team members joining for UAT support.
