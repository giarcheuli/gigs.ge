# gigs.ge

A minimalistic, mobile-first gig board for Georgia — post short-term jobs or apply for them.

## Documentation

- [**System Design Document**](./SYSTEM_DESIGN.md) — architecture, data models, API design, feature requirements, security model and next steps. Start here before building anything.
- [**UAT Readiness Handoff**](./docs/guides/uat-readiness-handoff.md) — current implementation state, UAT blockers, and the fastest credible path forward.
- [**Custom AI Agents**](./docs/guides/custom-ai-agents.md) — proposed workspace agents for UAT orchestration, backend delivery, testing, frontend slices, documentation, and release risk review.
- [**Agent Skills Map**](./docs/guides/agent-skills-map.md) — which project documents each active agent should consult first.

## Overview

- Two user roles: **admin** and **user**
- Privacy-first: contact info is never exposed until both parties trust each other
- Full verification required (email + phone OTP) before posting or applying
- Georgian regions & cities built-in; mobile-first PWA

## Status

Early implementation — backend auth and schema foundations exist, but the core stakeholder user journeys are not yet wired end-to-end. See [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) for the target design and [docs/guides/uat-readiness-handoff.md](./docs/guides/uat-readiness-handoff.md) for the current delivery state.
