# Spec — feat/uat-auth-screens

> **Ticket type:** Frontend slice
> **Target branch:** `feat/uat-auth-screens` off `uat/first-slice`
> **Epic:** Frontend UAT journey (Epic 3)
> **Skill file:** [`.github/skills/frontend-web/SKILL.md`](../../.github/skills/frontend-web/SKILL.md)

## Why

`apps/web` is currently a placeholder. Stakeholder UAT requires that a real person can register, verify themselves, log in, and see their account state in the browser. This slice delivers the smallest UI that exercises the already-shipped backend auth endpoints (`/auth/register`, `/auth/login`, `/auth/verify-otp`, `/auth/resend-otp`, `/auth/logout`, `/auth/me`). It is the foundation every other UAT screen depends on — you cannot post a gig or sign a contract without being logged in.

This is also the first ticket to run end-to-end through the AI operating contract defined at [`docs/specs/agent-operating-contract.md`](./agent-operating-contract.md). Treat it as the workflow's pilot run as well as a product deliverable.

## Goal

A verified user can:

1. Open `apps/web`, choose to register or log in.
2. Complete registration (email, phone, password, date of birth).
3. Verify their email via OTP. (Phone verification is deferred — see Out of scope.)
4. Land on a "My Account" view that confirms email verification and shows their basic profile state.
5. Log out and log back in.

Done = a stakeholder can complete the loop above in a browser pointed at a running local dev environment, without touching the API directly or seeing a placeholder page.

## Out of scope (do not build in this ticket)

1. Password reset flow (`/auth/forgot-password`, `/auth/reset-password`) — defer to a follow-up ticket.
2. Visual branding beyond plain, readable defaults (logos, custom palette, illustration).
3. Internationalization. English-only for this slice; Georgian-language version is a separate ticket.
4. Profile editing. The "My Account" view is read-only here.
5. Social login or any third-party identity provider.
6. Refresh-token UX. Use a sensible default (access token in memory, refresh handled silently); a deliberate session-expiry UX comes later.
7. Email/SMS delivery infrastructure. See **Dependencies → OTP delivery** below.
8. Phone OTP verification UI. The backend still generates a phone OTP on registration; the frontend simply does not surface it this slice. Picked up in a follow-up ticket once SMS delivery is wired.

## User stories

1. **Register.** As a new visitor, I can submit my email, phone, password, and date of birth, and receive feedback if any field is invalid (server-side validation surfaced clearly). After successful submission, I am directed to the OTP-verification screen.
2. **Verify email.** As a newly registered user, I can enter the OTP code sent to my email and see my email transition from "unverified" to "verified". I can request a resend if the code expires or never arrives. Phone verification is deferred for this UAT slice.
3. **Log in.** As a returning user, I can submit my email and password, and on success arrive at "My Account".
4. **View account.** As a logged-in user, I can see my email, phone, email verification status, and account creation date. (Phone verification status is intentionally not surfaced in this slice.)
5. **Log out.** As a logged-in user, I can log out from any authenticated screen and return to a public landing.

## Acceptance criteria

1. Register form rejects under-18 DOB on the client before submission, mirroring the server rule (`isAtLeast18` in `apps/api/src/lib/auth.ts`).
2. Register form surfaces server errors verbatim for: duplicate email, duplicate phone, weak password, malformed payload. Error messages render near the offending field where field-level errors are returned, and at the form top otherwise.
3. OTP-verification screen shows a single input for the email OTP, with a submit action and a separate resend action. The channel renders a clear "verified ✓" state once accepted. The phone OTP issued by the backend is intentionally ignored by this slice.
4. "My Account" page is unreachable without a valid access token. Direct navigation to `/account` while logged out redirects to `/login` with a `?next=/account` query parameter so the user lands back after sign-in.
5. Logout invalidates the session client-side and server-side (`POST /auth/logout`), then redirects to `/`.
6. All authenticated requests carry the access token. The token-refresh path runs silently on 401, retries the original request once, and falls back to `/login` if refresh fails.
7. The flow works on mobile-width viewports (≤ 414px) without horizontal scroll.
8. No console errors in the browser during the happy path.
9. Running the seed script populates the three UAT accounts (1 poster, 2 workers), all email-verified. All three can sign in directly via `/login` without going through registration or OTP entry.

## Screens

1. **`/`** — Public landing with two clear CTAs: "Create account" → `/register`, "Sign in" → `/login`. May reuse the existing `apps/web/src/app/page.tsx` shell.
2. **`/register`** — Fields: email, phone, password, confirm password, date of birth. Submit calls `POST /auth/register`. On success, redirect to `/verify`.
3. **`/verify`** — Single OTP entry form for the email channel, with a resend button. Calls `POST /auth/verify-otp` with `channel: 'email'` and `POST /auth/resend-otp` with the same channel. On verification success, redirect to `/account`.
4. **`/login`** — Fields: email, password. Submit calls `POST /auth/login`. On success, redirect to `/account` or to `?next=` if present.
5. **`/account`** — Authenticated. Shows email, phone (unmasked), email verification state, and account creation date from `GET /auth/me`. Phone verification state is intentionally not displayed in this slice. Includes a "Log out" action.

## Dependencies

### Backend routes (already shipped on `uat/first-slice`)

All endpoints live at `/auth/*` under `apps/api`. Authoritative request/response shapes are defined by the Zod schemas in `packages/shared/src/schemas` and the route handlers in `apps/api/src/routes/auth/index.ts`. The implementer **must** read those before coding the client — do not reverse-engineer from this doc.

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/verify-otp` (requires auth — caller is the just-registered user)
- `POST /auth/resend-otp` (requires auth)
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me` (requires auth)

### OTP delivery

The backend generates and hashes OTPs but real email/SMS delivery infrastructure is not yet wired. For this UAT slice, the implementer should add a minimal dev-mode mechanism to surface the OTP — e.g., a `GET /dev/last-otp/:userId` route gated behind `NODE_ENV !== 'production'`, or printing the OTP to the API log on generation. The exact mechanism is an implementation choice but **must be flagged as a dev-only seam in code comments** and tracked as a follow-up ticket for real delivery before the public UAT demo.

### Shared types

Use Zod schemas from `@gigs/shared/schemas` for client-side validation where possible. Keep one source of truth.

## Seeded UAT accounts

For stakeholder UAT walkthroughs, the database must be seeded with three pre-verified accounts so reviewers can sign in without going through registration. The implementer extends the existing seed mechanism (currently `apps/api/src/db/seed.ts`) — or adds a new seed file alongside it — to insert these accounts. The seed must be:

1. **Idempotent.** Running it twice does not error and does not duplicate accounts.
2. **Dev/UAT only.** Refuses to run when `NODE_ENV === 'production'`.
3. **Documented.** A new `docs/guides/uat-test-accounts.md` lists the credentials and the role each account plays so stakeholders can sign in for the walkthrough.

### The three accounts

| # | Role | Email | Purpose in the walkthrough |
|---|---|---|---|
| 1 | Poster | `poster1@uat.gigs.ge` | Creates and publishes gigs; receives applications; accepts one |
| 2 | Worker | `worker1@uat.gigs.ge` | Browses the published gig and applies |
| 3 | Worker | `worker2@uat.gigs.ge` | Second applicant — so reviewers can see what the poster sees with multiple applications |

A single shared password (e.g., `Uat-Demo-2026!`) is acceptable for this UAT slice. The implementer picks a value that satisfies the registration password rules and documents the final choice in `docs/guides/uat-test-accounts.md`. All three accounts are seeded as **email-verified**. Phone verification stays unset for each, matching the UI scope.

Phone numbers and date-of-birth values for the seeds should be plausible Georgian-format values; the implementer picks specific values and records them in the test-accounts doc.

## Technical notes for the implementer

1. `apps/web` is a Next.js 14+ App Router project. Place new routes under `apps/web/src/app/<segment>/page.tsx`. Match the existing file layout (`layout.tsx`, `page.tsx`, `providers.tsx`).
2. Use `fetch` against `process.env.NEXT_PUBLIC_API_URL` (add to `apps/web/.env.example` if missing). Do not introduce a new HTTP client library — keep deps minimal.
3. Form handling: prefer React server actions or a minimal client component with controlled inputs. No new form library this slice.
4. Styling: use whatever Tailwind/CSS approach is already in `apps/web`. If nothing is set up, plain CSS modules are acceptable. Brand polish is explicitly deferred.
5. Token storage: access token in memory (React state or a small in-memory store). Refresh token in an `HttpOnly` cookie set by the API. Confirm the API behavior before assuming.

## Verification — how to know the slice is done

1. `pnpm --filter @gigs/api lint && pnpm --filter @gigs/api test` passes.
2. `pnpm --filter @gigs/web build` passes.
3. `pnpm --filter @gigs/web lint` passes (if configured) or has no new warnings.
4. A manual run-through of the five user stories above succeeds against a local dev stack (`pnpm dev`).
5. At least one Playwright or comparable smoke test covers register → verify → me end-to-end (this can be a thin first test; full e2e coverage is a separate ticket).
6. No console errors during the happy path.
7. PR description includes a short Loom or screenshot of each of the five screens for the reviewer.
8. The seed script runs cleanly twice in a row against a fresh dev database (idempotency check) and the three documented accounts can sign in via the new UI.

## Product decisions — resolved

These were the open questions raised during spec drafting. The product owner's answers are locked into the spec above:

1. **OTP form layout** — Email-only for this UAT slice, single form. Phone OTP UI is in Out of scope.
2. **Mid-verification logout** — A user registered but not yet email-verified **can** log out and resume verification on next login.
3. **Phone display on My Account** — Show the full phone number for now. Masking is a post-UAT polish item.
4. **Seeded UAT test accounts** — Included in this slice. Three accounts: one poster (`poster1`), two workers (`worker1`, `worker2`). All pre-verified for email so reviewers can sign in without going through OTP entry. Credentials documented in a new `docs/guides/uat-test-accounts.md`. See **Seeded UAT accounts** section above for details.

## Estimate

One Claude Code session on Sonnet should be enough to land the happy path and the manual verification. Add a second session if Playwright smoke coverage proves non-trivial against the dev-mode OTP seam. Budget Opus review at the end against the diff.
