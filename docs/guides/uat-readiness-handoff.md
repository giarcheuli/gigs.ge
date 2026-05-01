# UAT Readiness Handoff

This note closes the current session with a grounded view of what the repo can do today, what blocks stakeholder UAT, and what should happen next if the goal is UAT as soon as possible.

## Current State

The backend is no longer just design work. `apps/api` has a real Fastify app, a broad Drizzle schema, auth endpoints, and a working Jest harness with unit and request-level integration coverage.

The frontend is still far behind the backend. Both `apps/web` and `apps/admin` are placeholder landing pages, so the product does not yet expose the main user journeys that stakeholders would expect in UAT.

## Verified Implemented Surface

1. API auth routes exist for register, login, OTP verification and resend, refresh, logout, forgot-password, reset-password, and `me`.
2. The database schema already covers users, profiles, gigs, applications, contracts, billing, reviews, messaging, and moderation-related tables.
3. Automated tests now exist for auth helper logic and request-level auth flows.
4. Regions and cities have a seed path, which helps with realistic Georgia-specific fixtures later.

## Reality Check

The biggest blocker to UAT is not test count. It is missing product breadth.

Right now, only auth is mounted in the API, and the two frontend apps do not yet implement browse, post, apply, contract, dispute, or admin moderation flows. That means a stakeholder cannot perform the end-to-end scenarios that define the business.

Because of that, calling the project "pre-development" is no longer accurate, but calling it "UAT-ready" would also be misleading. The honest state is early implementation with a strong schema and auth foundation.

## What UAT ASAP Should Mean

For this repo, the fastest credible path is not "build every planned feature." It is to deliver one narrow but believable happy path:

1. A verified user can register, log in, and view their account state.
2. A poster can create and publish a gig.
3. A worker can browse that gig and apply.
4. The poster can move the relationship into a simple contract flow.
5. Both sides can reach a visible terminal state that demonstrates the trust-based platform concept.

If that slice works in both API and UI, stakeholder UAT can begin even while deeper features stay behind it.

## Recommended Next Work

1. Finish auth workflow test coverage for `refresh`, `logout`, `verify-otp`, `forgot-password`, `reset-password`, and `me`.
2. Implement and mount the first non-auth route group: gigs.
3. Implement the smallest application and contract happy path needed to demonstrate hiring, acceptance, and completion.
4. Replace placeholder web pages with minimal task-focused screens for browse, register/login, post gig, apply, and view contract status.
5. Add stakeholder-facing documentation: quickstart, UAT script, and FAQ for the trust model.

## Work That Can Wait Until After First UAT

1. Load testing and heavier optimization.
2. Full analytics rollout.
3. Rich admin dashboard and community features.
4. Marketing assets beyond the minimum needed to frame the demo.

## Session Output

This session established a backend test harness that respects the repo's runtime-correct ESM import style and added the first auth integration tests. That matters because it gives the next session a stable base for shipping workflow tests instead of arguing with tooling.

Related notes:

1. See `docs/jest-setup.md` for the backend test harness decision.
2. See `docs/backlog.json` for the UAT-prioritized backlog state.