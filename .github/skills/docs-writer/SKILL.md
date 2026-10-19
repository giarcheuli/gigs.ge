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
The live index is [docs/README.md](../../../docs/README.md). Folders:
```
docs/
├── README.md        # Index: where every doc lives and where new ones go
├── STRATEGY.md      # Documentation meta-rules
├── backlog.json     # Backlog of record
├── architecture/    # Design decisions and how parts fit together
├── guides/          # How to do a task (setup, branching, UAT, agents)
├── operations/      # Live cloud resources and operating procedures
├── specs/           # One spec per feature slice: feat-<name>.md
├── planning/        # Ordered next steps (improvement-plan.md)
├── status/          # Dated snapshots: YYYY-MM-DD-<topic>.md
└── archive/         # No longer current; kept for context: YYYY-MM-DD-<name>.md
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
