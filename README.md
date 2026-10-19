# gigs.ge

A minimalistic, mobile-first gig board for Georgia — post short-term jobs or apply for them.

## Documentation

- [**Documentation Index**](./docs/README.md): where every doc lives and where new ones go. Start here.
- [**System Design Document**](./SYSTEM_DESIGN.md): architecture, data models, API design, feature requirements, and the security model.
- [**UAT Readiness Handoff**](./docs/guides/uat-readiness-handoff.md): what testers can do today and what is not built yet.
- [**Improvement Plan**](./docs/planning/improvement-plan.md): ordered next steps.
- [**Branching and SDLC Guide**](./docs/guides/branching-and-sdlc.md): branch roles (`dev` → `main`), the delivery workflow, and agent-safe rules.
- [**Cloud Inventory**](./docs/operations/cloud-inventory.md): what runs where in Google Cloud.
- [**Custom AI Agents**](./docs/guides/custom-ai-agents.md) and [**Agent Skills Map**](./docs/guides/agent-skills-map.md): how the workspace agents are designed and what they read.
- [**Agent Sessions Quick Start**](./.github/agents/QUICKSTART.md): how to invoke the custom agents.

## Overview

- Two user roles: **admin** and **user**
- Privacy-first: contact info is never exposed until both parties trust each other
- Email verification required before posting or applying; phone is collected but its verification is optional
- Georgian regions & cities built-in; mobile-first PWA

## Status

Live on two environments: **dev** (https://dev.gigs.ge, from branch `dev`) and **UAT** (https://uat.gigs.ge, from branch `main`). Testers can register with real email verification, post and apply to gigs, sign contracts, and cancel by mutual agreement. Contract timers, disputes/arbitration, billing, uploads, and the admin app are not built yet. See the [UAT Readiness Handoff](./docs/guides/uat-readiness-handoff.md) for details and the [Improvement Plan](./docs/planning/improvement-plan.md) for what comes next.

Workflow: branch from `dev`, merge back to `dev` by PR, verify on dev.gigs.ge, then promote `dev` → `main`. See [docs/guides/branching-and-sdlc.md](./docs/guides/branching-and-sdlc.md).
