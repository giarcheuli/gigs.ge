---
name: docs-writer
description: "Documentation conventions for gigs.ge. Use when: writing or updating any markdown documentation, README files, architecture docs, or guides. Enforces the educational-yet-professional tone and atomic file structure."
---

# Documentation Writing

## Principles
1. **Brief & Atomic**: No file should exceed ~200 lines. Split by topic.
2. **Educational Tone**: Explain the *why*, not just the *what*. Write as if teaching a capable junior developer.
3. **Synchronous**: Documentation is updated in the **same commit** as the code it describes.
4. **Cross-Linked**: Always link to related docs. Never leave a concept orphaned.

## Directory Structure
```
docs/
├── STRATEGY.md                 # This file — documentation meta-rules
├── architecture/               # System-level design decisions
│   ├── monorepo-structure.md
│   ├── database-design.md
│   ├── auth-flow.md
│   ├── deal-lifecycle.md
│   ├── billing-model.md
│   └── visibility-model.md
└── guides/                     # Feature-specific how-tos
    ├── getting-started.md
    ├── posting-a-gig.md
    ├── applying-for-a-gig.md
    ├── dispute-resolution.md
    └── invoice-management.md
```

## Formatting Rules
- Use Mermaid diagrams for state machines and data flows
- Use tables for comparisons and field inventories
- Use code blocks with language tags for SQL, TypeScript, shell commands
- Prefer numbered lists for sequential steps, bullets for unordered items

## README Files
Each app (`apps/api`, `apps/web`, `apps/admin`) gets its own `README.md`:
- 1-paragraph purpose statement
- Quick start commands (install, dev, build)
- Link to relevant architecture docs

## Tone Examples
- **Good**: "We use BullMQ here because the 48-hour auto-complete timer needs to survive server restarts. An in-memory `setTimeout` would lose the job."
- **Bad**: "BullMQ is used for job scheduling."
