# First-UAT Readiness Handoff

> **Purpose:** Define the minimum credible slice for the first User-Acceptance Test (UAT) based on what is *actually* implemented today. Nothing here is forward-dated or aspirational.
>
> **Authored:** 2026-05-01  
> **Owner:** Delivery orchestrator  
> **Related:** [backlog.json](../backlog.json) · [auth-flow.md](../architecture/auth-flow.md) · [database-design.md](../architecture/database-design.md) · [SYSTEM_DESIGN.md](../../SYSTEM_DESIGN.md)

---

## 1. Honest Implementation Snapshot

Before defining the UAT slice, here is the exact state of the repo today.

### Done (truly usable code)

| Area | What Exists |
|------|-------------|
| **Database schema** | All 19 Drizzle tables defined (`apps/api/src/db/schema/`). Full type coverage. |
| **Shared package** | `packages/shared` — constants, TypeScript interfaces, Zod schemas for every domain. Build-safe. |
| **Fastify app factory** | `apps/api/src/app.ts` — CORS, cookie, helmet, rate-limit, error handler, `/health` endpoint. No routes registered. |
| **Geographic seed** | `apps/api/src/db/seed.ts` — 11 Georgian regions, ~44 cities. Idempotent. |
| **Architecture docs** | `auth-flow.md`, `database-design.md`, `monorepo-structure.md`, `getting-started.md` |
| **Web placeholder** | `apps/web` — Next.js app boots; renders a static heading. No pages. |
| **Admin placeholder** | `apps/admin` — Next.js app boots; renders a static heading. No pages. |

### Not Implemented (zero application code exists)

| Area | Why It Blocks UAT |
|------|------------------|
| Auth API routes | Cannot register or log in |
| OTP verification handlers | Cannot reach `verified` status → cannot post or apply |
| Auth guards (`requireAuth`, `requireVerified`) | No access control on any route |
| Geography API (`GET /regions`, `GET /cities`) | Gig creation form needs region list |
| Gig API (CRUD + board listing) | Core entity — board can't be shown |
| Application API | Workers can't apply; posters can't accept |
| Contract API | Negotiation and signing can't happen |
| Frontend pages | All pages beyond the placeholder are empty |
| Admin panel pages | All pages beyond the placeholder are empty |
| BullMQ workers / timers | Auto-complete, overdue reminders — not started |
| File upload (R2) | Gig images and attachments — not started |
| Notifications | No delivery; table exists but nothing writes to it |
| Messaging | Table exists; no routes or handlers |

---

## 2. First-UAT Actor Journeys

The minimum UAT tests exactly two end-to-end journeys, stopping at **contract signed → in_progress**. Everything after that (completion, disputes, billing, reviews) is deferred.

### Journey A — Poster

```
1. Browse board as visitor → see gig cards (public fields only)
2. Register (email, phone, date of birth)
3. Verify email OTP → email_verified = true
4. Verify phone OTP → phone_verified = true  [status now: verified]
5. Post a gig (short description, region, price, expiry ≤ 30 days)
6. View applications received on own gig
7. Accept one application → contract draft auto-created
8. Review and sign the contract draft
9. Observe contract status = in_progress after worker also signs
```

### Journey B — Worker

```
1. Browse board as visitor → see gig cards (public fields only)
2. Register → verify email + phone → status: verified
3. Browse board as verified user → see additional fields per visibility rules
4. Open a gig detail page
5. Apply for the gig (optional message)
6. Receive notification: application accepted
7. View the contract draft the poster created
8. Sign the contract draft
9. Observe contract status = in_progress
```

### Scope Boundary

These journeys are the **only** scope for first UAT. The following are **explicitly out of scope** for this UAT round:

- Marking a contract complete / not done
- Disputes and arbitration
- Fee calculation and billing ledger
- Monthly invoices
- Reviews
- Gig image uploads
- Application file attachments
- Gig flagging and info requests
- Admin moderation tools
- Messaging between users
- Half-time rule enforcement
- Automatic timers (48h auto-complete, 14-day overdue)

---

## 3. Business Rules: Required vs. Deferrable

### Required before first UAT

| Rule | Where enforced | Why it cannot wait |
|------|---------------|-------------------|
| Age ≥ 18 on registration | `POST /auth/register` handler | Legal requirement; trivial to implement |
| Email + phone verification before post/apply | `requireVerified` guard | Core trust model; unverified users should never post |
| One application per worker per gig | DB `UNIQUE(gig_id, applicant_id)` already exists; route must return `409` | Prevents duplicate spam |
| Gig expiry ≤ 30 days from creation | `POST /gigs` handler | Board quality; prevents stale forever-gigs |
| Visibility field filtering on board listing | `GET /gigs` handler | Privacy-first is a core product promise |
| Both signatures → `in_progress` | `PATCH /contracts/:id/sign` handler | End of UAT journey depends on this |

### Safe to defer past first UAT

| Rule | Reason it can wait |
|------|-------------------|
| 48h auto-complete (BullMQ) | Requires queue infrastructure; can be manually tested later |
| Half-time rule (mark complete/not done gate) | No completion flow in UAT scope |
| 24h grace period (no fee on early cancel) | No billing in UAT scope |
| 14-day overdue auto-complete | No overdue flow in UAT scope |
| Fee calculation (3%/2%) | No contract completion in UAT scope |
| Dispute resolution flow | Post-UAT |
| Maximum 3 appendices per contract | Post-UAT |
| SMS gateway (real provider) | OTP printed to console is sufficient for internal UAT |
| File upload (R2 integration) | Images are a visual enhancement, not a flow blocker |
| Notification delivery (email/push) | DB-write stubs are enough to test notification data model |
| Admin arbiter tools | Not in UAT actor journeys |

---

## 4. Four-Session Implementation Brief

Sessions are ordered by dependency. Each must be complete (routes tested, no stubs for required rules) before the next session begins.

---

### Session 1 — Auth API

**Deliverable:** A user can register, verify, and log in via the API.

**Routes to implement:**

| Method | Path | Guard | Notes |
|--------|------|-------|-------|
| `POST` | `/api/v1/auth/register` | — | Hash password (bcrypt cost=12); send email OTC to console; return 201 + set refresh cookie |
| `POST` | `/api/v1/auth/login` | — | Return `accessToken` + set refresh cookie |
| `POST` | `/api/v1/auth/refresh` | — | Rotate refresh token; return new `accessToken` |
| `POST` | `/api/v1/auth/verify/email` | `requireAuth` | Mark `email_verified = true`; OTC from console |
| `POST` | `/api/v1/auth/verify/phone` | `requireAuth` | Mark `phone_verified = true`; OTP logged to console |
| `GET`  | `/api/v1/auth/me` | `requireAuth` | Return current user + profile |
| `POST` | `/api/v1/auth/logout` | `requireAuth` | Invalidate refresh token |

**Auth guards to implement:** `requireAuth`, `requireVerified`, `requireAdmin`

**Acceptance criteria:**

- `POST /auth/register` with valid body → `201`, user in DB, refresh cookie set
- `POST /auth/register` with DOB yielding age < 18 → `400`
- `POST /auth/register` with duplicate email → `409`
- `POST /auth/login` with correct credentials → `200` with `accessToken`
- `POST /auth/login` with wrong password → `401`
- `POST /auth/refresh` with valid cookie → `200` with new `accessToken`, cookie rotated
- `POST /auth/verify/email` with correct OTC → `email_verified = true` in DB
- `POST /auth/verify/phone` with correct OTP → `phone_verified = true` in DB
- Route protected by `requireVerified` returns `403` for unverified users
- Route protected by `requireAuth` returns `401` for unauthenticated requests

---

### Session 2 — Geography + Gig API

**Deliverable:** The board can be browsed; verified users can post and manage gigs.

**Routes to implement:**

| Method | Path | Guard | Notes |
|--------|------|-------|-------|
| `GET` | `/api/v1/regions` | — | List all regions |
| `GET` | `/api/v1/regions/:id/cities` | — | Cities for a region |
| `GET` | `/api/v1/gigs` | — | Paginated board; fields filtered by caller's auth level |
| `GET` | `/api/v1/gigs/:id` | — | Full gig; visibility rules applied |
| `POST` | `/api/v1/gigs` | `requireVerified` | Create gig as `draft`; enforce expiry ≤ 30 days |
| `PATCH` | `/api/v1/gigs/:id` | `requireVerified` + poster-only | Update gig fields |
| `PATCH` | `/api/v1/gigs/:id/publish` | `requireVerified` + poster-only | Move `draft → active` |
| `PATCH` | `/api/v1/gigs/:id/cancel` | `requireVerified` + poster-only | Move to `cancelled` |

**Acceptance criteria:**

- `GET /regions` → `200` with 11 Georgian regions
- `GET /regions/1/cities` → `200` with cities for that region
- `GET /gigs` (visitor) → public fields only; no `streetAddress`, no contact info
- `GET /gigs` (verified) → fields per visibility defaults
- `POST /gigs` without auth → `401`
- `POST /gigs` with unverified user → `403`
- `POST /gigs` with `expiresAt` > 30 days from now → `400`
- `POST /gigs` valid → `201`, status = `draft`
- `PATCH /gigs/:id/publish` → status = `active`
- `PATCH /gigs/:id` by non-poster → `403`

---

### Session 3 — Applications + Contracts API

**Deliverable:** Worker can apply; poster can accept and create a contract; both parties can sign.

**Routes to implement:**

| Method | Path | Guard | Notes |
|--------|------|-------|-------|
| `POST` | `/api/v1/gigs/:id/applications` | `requireVerified` | Apply to active gig; enforce uniqueness → `409` on duplicate |
| `GET` | `/api/v1/gigs/:id/applications` | `requireVerified` + poster-only | List applications |
| `PATCH` | `/api/v1/applications/:id` | `requireVerified` + poster-only | Accept or reject; accepted triggers contract draft creation |
| `GET` | `/api/v1/contracts/:id` | `requireAuth` + party-only | View contract |
| `PATCH` | `/api/v1/contracts/:id` | `requireAuth` + poster-only | Edit draft (price, dates) |
| `POST` | `/api/v1/contracts/:id/sign` | `requireAuth` + party-only | Record signature; when both signed → `in_progress` |
| `POST` | `/api/v1/contracts/:id/reject` | `requireAuth` + worker-only | Worker rejects draft; poster notified |

**Acceptance criteria:**

- `POST /gigs/:id/applications` → `201` (status = `pending`)
- Same worker applies twice to same gig → `409`
- Worker applies to non-active gig → `400`
- `PATCH /applications/:id {status: "accepted"}` by poster → `200`, worker notified (DB notification row), contract draft auto-created
- `GET /contracts/:id` by poster → `200` with draft
- `PATCH /contracts/:id` by poster updates price/dates
- `POST /contracts/:id/sign` by poster → `poster_signed_at` set
- `POST /contracts/:id/sign` by worker (after poster) → `worker_signed_at` set, status = `in_progress`
- `POST /contracts/:id/sign` by uninvolved user → `403`
- `POST /contracts/:id/reject` by worker → poster notified (DB row), draft reset for revision

---

### Session 4 — Web Frontend (Minimum Viable)

**Deliverable:** Both actor journeys completeable through a browser, not just `curl`.

**Pages to implement:**

| Route | Description |
|-------|-------------|
| `/` | Board — paginated gig cards; public fields |
| `/gigs/[id]` | Gig detail with apply button (hidden to visitors/unverified) |
| `/register` | Registration form (email, phone, DOB) |
| `/login` | Login form |
| `/verify` | OTP entry for email + phone |
| `/gigs/new` | Post-a-gig form (region picker, price type, expiry date) |
| `/my/gigs` | "My Gigs" — poster view of own gigs |
| `/my/gigs/[id]/applications` | Application list for a poster's gig |
| `/my/applications` | Worker's application list |
| `/contracts/[id]` | Contract detail + sign/reject buttons |

**Acceptance criteria:**

- Visitor lands on `/` and sees at least one gig card (seeded or manually created)
- Visitor clicks "Register" and completes registration form → redirected to `/verify`
- User enters OTPs from console logs → redirected to board as verified user
- Verified user posts a gig via `/gigs/new` form → gig appears on board
- Verified user applies for another gig from `/gigs/[id]` → confirmation shown
- Poster sees application on `/my/gigs/[id]/applications` and accepts it
- Contract draft appears at `/contracts/[id]` for both parties
- Poster signs; worker signs → page shows "In Progress" status
- Unauthenticated access to `/gigs/new` → redirect to `/login`

---

## 5. What Is Blocked and Why

| Item | Blocked by | Mitigation |
|------|-----------|-----------|
| BullMQ timers (48h, 14d) | Redis infrastructure + Session 3 complete | Defer entirely; timers are post-UAT |
| File upload (R2) | R2 bucket + credentials not configured | Skip images in UAT; gigs without images are valid |
| Real SMS gateway | External SMS provider credentials | Console-logged OTP is explicitly accepted for internal UAT |
| Admin dispute tools | Session 3 + arbiter workflow | Defer; no dispute flow in UAT scope |
| Billing/invoices | Session 3 + BullMQ | Defer entirely |
| Reviews | Contract completion flow | Defer; UAT stops at `in_progress` |

---

**Related:** [backlog.json](../backlog.json) · [auth-flow.md](../architecture/auth-flow.md) · [SYSTEM_DESIGN.md](../../SYSTEM_DESIGN.md)
