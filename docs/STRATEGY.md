# Documentation Strategy: Docs-as-Code

This project follows a "Documentation-in-Parallel" approach. Every major technical artifact must have a corresponding markdown file that explains the **What**, **Why**, and **How** with an educational yet professional tone.

## Organization
- `/docs/architecture/`: High-level system design, state machines, and data flow.
- `/docs/guides/`: Onboarding and "How-to" for specific features (e.g., Auth, Disputes).
- `README.md` (local to apps): Brief, technical "Quick Start" for each sub-application.

## Principles
1. **Brief & Atomic**: Avoid "Mega-docs". If a file exceeds 200 lines, split it.
2. **Educational Overtone**: Don't just show code; explain the *reasoning* (e.g., "We use BullMQ here because...").
3. **Synchronous**: Documentation is updated in the same step as the code it describes.
4. **Markdown First**: Use Mermaid diagrams for logic flow.
