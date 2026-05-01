# Agent Skills Map

This map defines which kinds of project documents each active workspace agent should consult first.

The purpose is to keep product knowledge in repository documents and keep agents focused on durable execution skills.

## Core Rule

Agents should not carry product memory inside their instructions.

Agents should pull context from the project documents that already describe:

1. What the product is supposed to do.
2. What the codebase currently implements.
3. What work is prioritized next.
4. What constraints or decisions already exist.

## Active Agents

### Delivery Orchestrator

Primary docs to consult first:

1. Product or system overview documents.
2. Backlog, roadmap, milestone, or release-planning documents.
3. Current-state, handoff, or readiness documents.
4. README files that describe workspace structure or app responsibilities.

Repo examples:

1. `SYSTEM_DESIGN.md`
2. `docs/backlog.json`
3. `docs/guides/uat-readiness-handoff.md`
4. `README.md`

Use this agent when the main question is "what should happen next and why?"

### Backend Workflow Builder

Primary docs to consult first:

1. System design and API behavior documents.
2. Architecture docs that explain data flow, state models, or persistence rules.
3. Backlog or milestone docs that define the current delivery slice.
4. Existing backend READMEs or implementation notes.

Repo examples:

1. `SYSTEM_DESIGN.md`
2. `docs/architecture/auth-flow.md`
3. `docs/architecture/database-design.md`
4. `docs/backlog.json`

Use this agent when the main question is "what backend behavior should be implemented now?"

### Test Strategy Agent

Primary docs to consult first:

1. Acceptance criteria, workflow, or lifecycle documents.
2. Backlog items that define the current behavior target.
3. Existing test harness notes and verification docs.
4. Current-state docs that explain what is and is not implemented.

Repo examples:

1. `SYSTEM_DESIGN.md`
2. `docs/backlog.json`
3. `docs/jest-setup.md`
4. `docs/guides/uat-readiness-handoff.md`

Use this agent when the main question is "what is the cheapest credible way to validate this behavior?"

### Documentation and Handoff Agent

Primary docs to consult first:

1. The documents most directly affected by the change.
2. Current-state and readiness notes.
3. Backlog or planning docs that need status alignment.
4. Top-level navigation docs such as READMEs.

Repo examples:

1. `docs/guides/uat-readiness-handoff.md`
2. `docs/backlog.json`
3. `README.md`
4. `docs/jest-setup.md`

Use this agent when the main question is "what needs to be written down so the repo stays truthful and useful?"

## Document Categories To Maintain

To make these agents work well across any project, keep the repository's knowledge organized into categories like these:

1. Product definition: system design, PRD, workflows, lifecycle rules.
2. Architecture: data model, integrations, security, deployment, app boundaries.
3. Delivery state: backlog, milestone status, release readiness, handoff notes.
4. Implementation notes: test harness docs, setup guides, feature-specific guides.
5. Entry points: README files that tell new sessions where to start.

If these categories are present and maintained, the agents stay reusable and the project stays self-describing.
