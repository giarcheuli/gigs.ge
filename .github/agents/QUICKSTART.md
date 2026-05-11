# Agent Session Quick Start

This guide helps you start working with custom AI agents in the gigs.ge repository.

## Prerequisites

Before using agents, ensure:
1. You have access to GitHub Copilot with custom agent support
2. The repository is cloned locally or you're working in a GitHub Codespace
3. Key documentation is up to date:
   - `SYSTEM_DESIGN.md`
   - `docs/backlog.json`
   - `docs/guides/uat-readiness-handoff.md`

## Quick Reference

| Need | Agent | Example Command |
|------|-------|----------------|
| **Plan next sprint** | delivery-orchestrator | `@delivery-orchestrator prioritize backlog for UAT` |
| **Build API endpoint** | backend-workflow-builder | `@backend-workflow-builder implement gigs listing route` |
| **Add test coverage** | test-strategy-agent | `@test-strategy-agent test auth refresh token rotation` |
| **Update docs** | documentation-handoff-agent | `@documentation-handoff-agent sync auth-flow.md with implementation` |

## Your First Agent Session

### 1. Start with Planning

```
@delivery-orchestrator 

I need to understand the current project status and what we should work on next 
to get to UAT readiness. Please analyze the backlog and implementation state.
```

**What happens:**
- Agent reads `SYSTEM_DESIGN.md`, `backlog.json`, and code
- Compares what's planned vs. implemented
- Returns critical path with ordered next actions
- Identifies blockers

**Expected output:**
```
Current state:
  ✓ Implemented: Auth routes, database schema, basic tests
  ✗ Missing: Gig CRUD, application flow, contract state machine
  ⚠ Blocked: Frontend flows depend on missing API routes

Critical path:
  1. Implement gigs route group (2-3 days)
  2. Add application and contract happy path (3-4 days)
  3. Build minimal frontend flows (4-5 days)

Next actions:
  - [ ] Backend: Mount /gigs routes with POST, GET list, GET by ID
  - [ ] Tests: Integration tests for gig creation and filtering
  - [ ] Docs: Update backlog.json to reflect current priorities
```

### 2. Implement Backend Work

Once you know what to build:

```
@backend-workflow-builder

Based on the delivery plan, implement the gigs listing endpoint:
- GET /api/v1/gigs with filters for region, category, status
- Include pagination (limit/offset)
- Return gigs with poster info (privacy-safe)
- Add validation and auth guards
```

**What happens:**
- Agent reads system design for gig requirements
- Implements route in `apps/api/src/routes/gigs/`
- Adds Zod validation schemas
- Creates integration test skeleton
- Reports what's done and what's next

### 3. Add Test Coverage

After implementation:

```
@test-strategy-agent

The gigs listing route is implemented. Add integration tests covering:
- Successful listing with no filters
- Filtering by region and category
- Pagination behavior
- Auth requirement (must be logged in)
- Empty state when no gigs exist
```

**What happens:**
- Agent identifies integration level is appropriate
- Adds tests to `apps/api/src/routes/gigs/gigs.test.ts`
- Runs tests and reports results
- Notes any coverage gaps

### 4. Update Documentation

Finally:

```
@documentation-handoff-agent

Update docs to reflect the new gigs listing implementation:
- API documentation for the new endpoint
- Update UAT readiness handoff
- Mark relevant backlog items as complete
```

**What happens:**
- Agent creates or updates API docs
- Updates `uat-readiness-handoff.md` with new capabilities
- Adjusts `backlog.json` status
- Cross-links related docs

## Common Workflows

### Feature Development Cycle

```
1. @delivery-orchestrator scope the feature and dependencies
2. @backend-workflow-builder implement API layer
3. @test-strategy-agent add test coverage
4. @documentation-handoff-agent update docs
```

### Bug Fix Workflow

```
1. @test-strategy-agent add regression test that fails
2. @backend-workflow-builder fix the bug
3. @test-strategy-agent verify test now passes
4. @documentation-handoff-agent note the fix if behavior changed
```

### Documentation Audit

```
1. @delivery-orchestrator identify implemented vs. documented gaps
2. @documentation-handoff-agent fix all doc gaps
3. @delivery-orchestrator verify docs match reality
```

### Pre-Release Check

```
1. @delivery-orchestrator review milestone readiness
2. @test-strategy-agent audit test coverage for critical paths
3. @documentation-handoff-agent ensure handoff docs current
```

## Agent Invocation Patterns

### Be Specific

❌ **Too vague:**
```
@backend-workflow-builder add some gig stuff
```

✅ **Clear objective:**
```
@backend-workflow-builder implement POST /api/v1/gigs endpoint for creating gigs with title, description, price, region, category, due date
```

### Provide Context

❌ **Missing context:**
```
@test-strategy-agent add tests
```

✅ **Clear scope:**
```
@test-strategy-agent add integration tests for the contract state machine, focusing on the draft->active transition when both parties sign
```

### Set Boundaries

❌ **Open-ended:**
```
@backend-workflow-builder improve the API
```

✅ **Bounded scope:**
```
@backend-workflow-builder implement only the happy path for gig creation (POST /gigs). Skip edge cases for now; those come in the next iteration.
```

## Understanding Agent Responses

Each agent provides structured output:

### Delivery Orchestrator
```
Current state: [what exists]
Critical path: [minimum viable path]
Next actions: [ordered checklist]
Risks: [assumptions and blockers]
```

### Backend Workflow Builder
```
Scope implemented: [what was built]
Files changed: [list]
Validation: [test results]
Remaining work: [dependencies]
```

### Test Strategy Agent
```
Behavior covered: [what's tested]
Test level: [unit/integration/e2e and why]
Validation: [pass/fail]
Gaps: [what's not covered yet]
```

### Documentation Handoff Agent
```
Audience: [who this doc is for]
Docs updated: [list]
Key state: [what's captured]
Next actions: [follow-up needed]
```

## Session Best Practices

### Do's
- ✅ Start with delivery-orchestrator when unsure what to do next
- ✅ Provide clear, specific objectives
- ✅ Keep docs updated so agents have good context
- ✅ Use one agent per concern (don't mix planning with implementation)
- ✅ Trust agent skepticism—if they flag a blocker, it's real

### Don'ts
- ❌ Don't ask test-strategy-agent to implement features
- ❌ Don't expect agents to remember previous conversations
- ❌ Don't ignore agent output—they read the actual code
- ❌ Don't skip documentation—agents rely on it
- ❌ Don't invoke multiple agents simultaneously for dependent work

## Troubleshooting

### "Agent seems confused about project goals"
**Fix:** Update `SYSTEM_DESIGN.md` and ensure backlog.json has current priorities

### "Agent suggests work that's already done"
**Fix:** Update `docs/guides/uat-readiness-handoff.md` with current state

### "Agent output too generic"
**Fix:** Be more specific in your request; reference exact files or features

### "Agent misses important context"
**Fix:** Check that the agent's `priority_docs` in `sessions.yml` include the right files

### "Need multiple agents for one task"
**Fix:** Start with delivery-orchestrator to break down the task, then invoke specialized agents in sequence

## Advanced Usage

### Chaining Agents

```bash
# Session 1: Plan
@delivery-orchestrator what's the smallest path to contract MVP?

# Session 2: Implement (using output from session 1)
@backend-workflow-builder implement the contract signing endpoint as specified in the delivery plan

# Session 3: Test (using output from session 2)
@test-strategy-agent add integration tests for contract signing flow

# Session 4: Document (using all previous outputs)
@documentation-handoff-agent update architecture docs to reflect contract signing implementation
```

### Iterative Refinement

```
# First pass
@backend-workflow-builder implement gigs route

[Agent delivers basic implementation]

# Refinement
@backend-workflow-builder add input validation and error handling to the gigs POST endpoint

[Agent improves the implementation]

# Validation
@test-strategy-agent add edge case tests for gigs validation errors
```

## Next Steps

1. Read [Agent Skills Map](../../docs/guides/agent-skills-map.md) to understand which docs each agent prioritizes
2. Review [Custom AI Agents Guide](../../docs/guides/custom-ai-agents.md) for design principles
3. Check `sessions.yml` for detailed agent configurations
4. Start with a simple request to delivery-orchestrator to get oriented

## Getting Help

If agents aren't working as expected:
1. Verify your request is specific and actionable
2. Check that priority docs are up to date
3. Review the constraints in each agent's definition
4. Ask delivery-orchestrator for guidance on which agent to use
