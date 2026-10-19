# Documentation Index

Start here. Each folder has one job, so you can tell from the path whether a file is a rule, a how-to, a decision record, or a historical note.

| Folder | What lives here | Start with |
|--------|-----------------|------------|
| [architecture/](./architecture/) | How the system is built and why: auth, database, monorepo, environments | [environments-and-integrations.md](./architecture/environments-and-integrations.md) |
| [guides/](./guides/) | How to work on the project: setup, branching, PRs, UAT, agents | [getting-started.md](./guides/getting-started.md) |
| [operations/](./operations/) | What runs in the cloud and how to operate it | [cloud-inventory.md](./operations/cloud-inventory.md) |
| [specs/](./specs/) | One spec per feature slice; the contract for a PR | [agent-operating-contract.md](./specs/agent-operating-contract.md) |
| [planning/](./planning/) | What we will do next and in what order | [improvement-plan.md](./planning/improvement-plan.md) |
| [status/](./status/) | Dated snapshots of project state (one per review or promotion) | [2026-10-19-project-status.md](./status/2026-10-19-project-status.md) |
| [archive/](./archive/) | Historical documents kept for context, not for instructions | [README.md](./archive/README.md) |

Top-level files:

- [backlog.json](./backlog.json): the backlog of record (milestones, tasks, status).
- [STRATEGY.md](./STRATEGY.md): documentation principles (docs ship in the same PR as code).
- [jest-setup.md](./jest-setup.md): why the API test harness is set up the way it is.

The product specification is [SYSTEM_DESIGN.md](../SYSTEM_DESIGN.md) at the repo root. AI sessions should read [CLAUDE.md](../CLAUDE.md) first.

## Where does a new document go?

- Describes a design decision or how parts fit together → `architecture/`
- Tells someone how to do a task → `guides/`
- Describes live cloud resources or an operating procedure → `operations/`
- Defines a feature before it is built → `specs/feat-<name>.md`
- Records state at a point in time → `status/YYYY-MM-DD-<topic>.md`
- No longer current but worth keeping → `archive/YYYY-MM-DD-<name>.md`

Keep files under ~200 lines and link related documents to each other.
