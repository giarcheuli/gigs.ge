# UAT Readiness Handoff

This note closes the current session with a grounded view of what the repo can do today, what blocks stakeholder UAT, and what should happen next if the goal is UAT as soon as possible.

## Current State

The backend is no longer just design work. `apps/api` has a real Fastify app, a broad Drizzle schema, auth endpoints, and a working Jest harness with unit and request-level integration coverage.

The frontend is still far behind the backend. Both `apps/web` and `apps/admin` are placeholder landing pages, so the product does not yet expose the main user journeys that stakeholders would expect in UAT.

## Verified Implemented Surface

1. API route groups are mounted for auth, gigs, applications, and contracts. The current happy-path coverage includes:
   - auth: register/login/verify/resend/refresh/logout/forgot-password/reset-password/`me`
   - gigs: create draft, update draft, publish, list visible gigs, fetch visible gig
   - applications: apply to active gig, poster list by gig, poster accept
   - contracts: party fetch, party sign (draft → in_progress once both sign)
2. The applications → contracts UAT slice intentionally accepts only fixed-price gigs for now, so `agreedPrice` stays explicit while richer negotiation is deferred.
3. The database schema already covers users, profiles, gigs, applications, contracts, billing, reviews, messaging, and moderation-related tables.
4. Automated tests now exist for auth helper logic and request-level auth/application/gig/contract flows.
5. Regions and cities have a seed path, which helps with realistic Georgia-specific fixtures later.

## Reality Check

The biggest blocker to UAT is not test count. It is missing product breadth on the frontend and later-stage contract/billing flows.

Right now, auth + gigs + applications + contracts (minimum signing flow) are mounted in the API, but the two frontend apps still do not implement the full browse/post/apply/contract journey. That means stakeholder UAT still needs UI delivery to exercise this backend slice end-to-end.

Because of that, calling the project "pre-development" is no longer accurate, but calling it "UAT-ready" would also be misleading. The honest state is early implementation with a strong schema and auth foundation.

## What UAT ASAP Should Mean

For this repo, the fastest credible path is not "build every planned feature." It is to deliver one narrow but believable happy path:

1. A verified user can register, log in, and view their account state.
2. A poster can create and publish a gig.
3. A worker can browse that gig and apply.
4. The poster can accept an application and create a contract draft.
5. Both sides can sign into `in_progress` so stakeholders can see the core hiring handoff.

If that slice works in both API and UI, stakeholder UAT can begin even while deeper features stay behind it.

## Recommended Next Work

1. Replace placeholder web/admin pages with minimal task-focused screens for browse, register/login, post gig, apply, accept, and sign.
2. Add first contract progression beyond `in_progress` (pending completion + completion/not-done entry points) without opening full dispute/billing automation scope.
3. Add stakeholder-facing documentation: quickstart, UAT script, and FAQ for the trust model.

## Work That Can Wait Until After First UAT

1. Load testing and heavier optimization.
2. Full analytics rollout.
3. Rich admin dashboard and community features.
4. Marketing assets beyond the minimum needed to frame the demo.

## Session Output (Latest)

The latest backend session mounted the first believable UAT API chain across auth, gigs, applications, and contracts (up to `in_progress`) with focused request-level integration tests. This keeps scope honest while unblocking frontend UAT stitching.

Related notes:

1. See `docs/jest-setup.md` for the backend test harness decision.
2. See `docs/backlog.json` for the UAT-prioritized backlog state.
