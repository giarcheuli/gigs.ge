# UAT Readiness Handoff

> **Agent context:** Machine-readable summary of what is built, what must be built for UAT, and the exact acceptance gate for each session. No narrative. All facts, all tables.  
> **Date:** 2026-05-01 · **Backlog:** [backlog.json](../backlog.json) · **Design:** [SYSTEM_DESIGN.md](../../SYSTEM_DESIGN.md)

---

## Implementation State

| ✅ Done | ❌ Not started |
|---------|---------------|
| 19-table Drizzle schema (`apps/api/src/db/schema/`) | All API routes |
| `packages/shared` — constants, types, Zod schemas | Auth guards (`requireAuth`, `requireVerified`, `requireAdmin`) |
| Fastify factory — CORS, cookie, helmet, rate-limit, `/health` | Geography handlers |
| Geographic seed — 11 regions, ~44 cities (idempotent) | Gig / Application / Contract handlers |
| Architecture docs — `auth-flow`, `database-design`, `monorepo-structure` | Frontend pages (both apps boot, show static heading only) |
| Web + Admin placeholders boot | BullMQ workers, R2 uploads, notification delivery, messaging |

---

## UAT Scope: Two Journeys, Stop at `in_progress`

**Journey A — Poster:** visitor → register → verify (email + phone) → post gig → view applications → accept application → sign contract → `in_progress`

**Journey B — Worker:** visitor → register → verify → browse board → apply → receive accepted notification → view contract draft → sign → `in_progress`

**Explicitly out of scope:** contract completion, disputes, arbitration, billing, invoices, reviews, image uploads, file attachments, gig flagging, messaging, admin tools, half-time rule, BullMQ timers.

---

## Business Rules Gate

| Rule | Enforced at | UAT? |
|------|------------|------|
| Age ≥ 18 | `POST /auth/register` | ✅ required |
| Email + phone verified before post/apply | `requireVerified` guard | ✅ required |
| Duplicate apply → `409` | `POST /gigs/:id/applications` (DB UNIQUE already exists) | ✅ required |
| Gig expiry ≤ 30 days | `POST /gigs` | ✅ required |
| Visibility field filtering | `GET /gigs` + `GET /gigs/:id` | ✅ required |
| Both signatures → `in_progress` | `POST /contracts/:id/sign` | ✅ required |
| 48h auto-complete (BullMQ) | BullMQ worker | ⏳ post-UAT |
| Half-time rule | `POST /contracts/:id/complete` | ⏳ post-UAT |
| 24h grace period (fee waiver) | cancel handler | ⏳ post-UAT |
| 14-day overdue auto-complete | BullMQ worker | ⏳ post-UAT |
| Fee calculation 3%/2% | ledger write | ⏳ post-UAT |
| Dispute / appendix flow | dispute handlers | ⏳ post-UAT |
| Real SMS gateway | OTP handler | ⏳ post-UAT (console-log for UAT) |
| R2 file upload | storage utility | ⏳ post-UAT |
| Notification delivery (email/push) | notification worker | ⏳ post-UAT (DB-write stub sufficient) |
| Admin arbiter tools | admin handlers | ⏳ post-UAT |

---

## Session 1 — Auth API

| M | Path | Guard | Key constraint |
|---|------|-------|----------------|
| POST | `/api/v1/auth/register` | — | bcrypt cost=12; age ≥18; console-log OTP; `201` + refresh cookie |
| POST | `/api/v1/auth/login` | — | `200` + `accessToken` + refresh cookie |
| POST | `/api/v1/auth/refresh` | — | rotate token; new `accessToken` |
| POST | `/api/v1/auth/verify/email` | requireAuth | `email_verified=true`; OTP from console |
| POST | `/api/v1/auth/verify/phone` | requireAuth | `phone_verified=true`; OTP from console |
| GET  | `/api/v1/auth/me` | requireAuth | current user + profile |
| POST | `/api/v1/auth/logout` | requireAuth | invalidate refresh token |

**Guards:** implement `requireAuth` (401 on miss), `requireVerified` (403 if not verified), `requireAdmin`.

**Acceptance gate:** valid register→201+cookie · age<18→400 · dup email→409 · login ok→200+token · wrong pwd→401 · refresh ok→new token · verify email OTP ok→`email_verified=true` · verify phone OTP ok→`phone_verified=true` · unverified on guarded route→403 · unauthenticated on guarded route→401.

---

## Session 2 — Geography + Gig API *(needs Session 1)*

| M | Path | Guard | Key constraint |
|---|------|-------|----------------|
| GET | `/api/v1/regions` | — | 11 Georgian regions |
| GET | `/api/v1/regions/:id/cities` | — | cities for region |
| GET | `/api/v1/gigs` | — | paginated; fields filtered by auth level |
| GET | `/api/v1/gigs/:id` | — | visibility rules applied |
| POST | `/api/v1/gigs` | requireVerified | `draft`; expiry ≤30 days enforced |
| PATCH | `/api/v1/gigs/:id` | requireVerified + poster | update fields |
| PATCH | `/api/v1/gigs/:id/publish` | requireVerified + poster | `draft→active` |
| PATCH | `/api/v1/gigs/:id/cancel` | requireVerified + poster | `→cancelled` |

**Acceptance gate:** GET /regions→11 items · GET /cities→non-empty · GET /gigs visitor→no streetAddress/contact · GET /gigs verified→visibility fields present · POST no auth→401 · POST unverified→403 · POST expiresAt>30d→400 · POST valid→201 draft · publish→active · PATCH by non-poster→403.

---

## Session 3 — Applications + Contracts API *(needs Session 2)*

| M | Path | Guard | Key constraint |
|---|------|-------|----------------|
| POST | `/api/v1/gigs/:id/applications` | requireVerified | unique per worker; 409 on dup |
| GET | `/api/v1/gigs/:id/applications` | requireVerified + poster | list |
| PATCH | `/api/v1/applications/:id` | requireVerified + poster | accept→contract draft created; reject→notified |
| GET | `/api/v1/contracts/:id` | requireAuth + party | view draft |
| PATCH | `/api/v1/contracts/:id` | requireAuth + poster | edit price/dates |
| POST | `/api/v1/contracts/:id/sign` | requireAuth + party | both signed→`in_progress` |
| POST | `/api/v1/contracts/:id/reject` | requireAuth + worker | draft reset; poster notified |

**Acceptance gate:** apply→201 pending · dup apply→409 · non-active gig→400 · accept→contract draft + DB notification row · GET contract by poster→200 draft · PATCH price ok · poster signs→`poster_signed_at` set · worker signs after poster→`in_progress` · third-party sign→403 · worker reject→poster notified, draft revised.

---

## Session 4 — Web Frontend *(needs Session 3)*

| Route | Purpose | Auth gate |
|-------|---------|-----------|
| `/` | Board — paginated gig cards | none |
| `/gigs/[id]` | Gig detail + apply button | apply hidden to visitor/unverified |
| `/register` | Registration form (email, phone, DOB) | none |
| `/login` | Login form | none |
| `/verify` | OTP entry (email + phone) | requireAuth |
| `/gigs/new` | Post-a-gig form (region picker, price, expiry) | requireVerified → redirect /login |
| `/my/gigs` | Poster's gig list | requireAuth |
| `/my/gigs/[id]/applications` | Poster views + accepts applications | requireAuth + poster |
| `/my/applications` | Worker's application list | requireAuth |
| `/contracts/[id]` | Contract view + sign/reject buttons | requireAuth + party |

**Acceptance gate:** visitor sees ≥1 card · register→/verify · OTPs from console→verified user on board · post gig via form→appears on board · apply from detail page→confirmation · poster accepts on applications page · contract page visible to both parties · poster+worker both sign→"In Progress" shown · `/gigs/new` unauthenticated→redirect `/login`.

---

## Blockers

| Item | Blocker | Mitigation for UAT |
|------|---------|-------------------|
| BullMQ timers (48h, 14d) | Redis + Session 3 | Defer entirely — post-UAT |
| File upload (R2) | R2 bucket not configured | Skip images — gigs without images are valid |
| Real SMS | Provider credentials | Console-log OTP — accepted for internal UAT |
| Admin / dispute tools | Session 3 + arbiter flow | Defer — not in UAT journeys |
| Billing / invoices | Session 3 + BullMQ | Defer entirely |
| Reviews | Contract completion | Defer — UAT stops at `in_progress` |

---

**See also:** [backlog.json](../backlog.json) · [auth-flow.md](../architecture/auth-flow.md) · [database-design.md](../architecture/database-design.md)
