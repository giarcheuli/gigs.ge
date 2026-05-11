# Custom Agent Sessions

This directory contains specialized AI agents for the gigs.ge project. Each agent has a specific role and can be invoked to handle domain-specific tasks.

## Available Agents

### 1. Delivery Orchestrator
**File:** `delivery-orchestrator.agent.md`  
**When to invoke:** Planning, backlog prioritization, milestone review, scope control

Use this agent when you need to:
- Analyze project readiness against stated goals
- Reorder backlog items by impact and dependency
- Identify blockers across engineering, product, or documentation
- Get a reality check on current project status
- Turn broad goals into concrete next actions

**Example invocation:**
```
@delivery-orchestrator analyze the current backlog and identify the critical path to UAT readiness
```

### 2. Backend Workflow Builder
**File:** `backend-workflow-builder.agent.md`  
**When to invoke:** API implementation, service layer work, backend validation

Use this agent when you need to:
- Implement or refine routes, handlers, and services
- Wire new backend flows into the application
- Add persistence logic or database operations
- Create behavior-scoped tests for backend code

**Example invocation:**
```
@backend-workflow-builder implement the gigs listing endpoint with filtering by region and category
```

### 3. Test Strategy Agent
**File:** `test-strategy-agent.agent.md`  
**When to invoke:** Adding test coverage, validation, regression testing

Use this agent when you need to:
- Add unit, integration, or system tests
- Build the cheapest verification for important behavior
- Improve test fixtures and helpers
- Validate workflow or regression fixes

**Example invocation:**
```
@test-strategy-agent add integration tests for the contract state machine transitions
```

### 4. Documentation Handoff Agent
**File:** `documentation-handoff-agent.agent.md`  
**When to invoke:** Writing or updating documentation, status reports

Use this agent when you need to:
- Keep docs synchronized with implementation
- Write guides, handoffs, or readiness notes
- Update backlog and planning docs
- Translate implementation progress into business language

**Example invocation:**
```
@documentation-handoff-agent update the architecture docs to reflect the new billing ledger implementation
```

## Session Management

### Starting a Session

Each agent can be invoked by referencing it in your request. The agent will:
1. Read relevant project documents (see [Agent Skills Map](../../docs/guides/agent-skills-map.md))
2. Analyze the current codebase state
3. Execute the requested task
4. Provide a structured output with next actions

### Agent Memory

**Important:** Agents do NOT carry product memory in their definitions. Instead, they pull context from:
- `SYSTEM_DESIGN.md` - Product requirements and architecture
- `docs/backlog.json` - Current priorities and work items
- `docs/guides/uat-readiness-handoff.md` - Implementation status
- Architecture docs in `docs/architecture/`
- Existing code and tests

This design keeps agents reusable while maintaining a single source of truth in documentation.

### Session Context

Agents work best when given:
1. **Clear objective** - What specific outcome do you need?
2. **Scope boundaries** - What should and shouldn't be changed?
3. **Relevant context** - Which feature area, user journey, or technical component?
4. **Success criteria** - How will you know the task is complete?

### Example Session Flow

```
User: @test-strategy-agent We need test coverage for the email verification workflow

Agent reads:
- apps/api/src/routes/auth/index.ts
- docs/architecture/auth-flow.md
- SYSTEM_DESIGN.md (auth section)
- existing test files

Agent delivers:
- Identifies the narrowest effective test level (integration tests)
- Implements focused tests for OTP generation, verification, and expiry
- Runs tests to validate
- Reports: "Behavior covered: email OTP full cycle. Test level: integration. 
  Validation: All 4 new tests passing. Gap: SMS OTP stubbed for v1."
```

## Output Format

Each agent provides structured output:

**Delivery Orchestrator:**
- Current state (implemented vs missing vs blocked)
- Critical path to milestone
- Ordered next actions
- Key risks and assumptions

**Backend Workflow Builder:**
- Scope implemented
- Files changed
- Validation results
- Remaining dependencies

**Test Strategy Agent:**
- Behavior covered
- Test level chosen and rationale
- Validation results
- Coverage gaps

**Documentation Handoff Agent:**
- Audience and purpose
- Docs created or updated
- Key state captured
- Unresolved assumptions

## Best Practices

1. **One agent per concern** - Don't ask the test agent to implement features
2. **Read the skills map** - Each agent knows which docs to consult first
3. **Trust the output** - Agents are skeptical by design and surface real blockers
4. **Iterate** - Use agent output to inform your next step or agent invocation
5. **Keep docs current** - Agents are only as good as the documentation they read

## Related Documentation

- [Custom AI Agents Guide](../../docs/guides/custom-ai-agents.md) - Design principles
- [Agent Skills Map](../../docs/guides/agent-skills-map.md) - Document consultation rules
- [UAT Readiness Handoff](../../docs/guides/uat-readiness-handoff.md) - Current status
- [System Design](../../SYSTEM_DESIGN.md) - Product specification

## Troubleshooting

**Agent gives generic advice:**
- Ensure relevant docs are up to date
- Provide more specific context in your request
- Reference specific files or features

**Agent seems to miss context:**
- Check that the skills map points to the right docs
- Verify that architecture docs exist for the area
- Update backlog.json with current priorities

**Multiple agents needed:**
- Start with delivery-orchestrator to plan the work
- Then invoke specialized agents (backend, test, docs) in sequence
- Each agent builds on the previous output
