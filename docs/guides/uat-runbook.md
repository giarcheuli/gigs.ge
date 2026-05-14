# UAT Runbook — gigs.ge First Slice

This document is the single source of truth for setting up and running the first-slice stakeholder UAT. Follow these steps exactly, in order.

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | ≥ 20 | `node -v` |
| pnpm | ≥ 9 | `pnpm -v` |
| PostgreSQL | 16 | `psql --version` |
| Redis | ≥ 7 | `redis-cli ping` (expect `PONG`) |

> **macOS shortcut**: `brew install postgresql@16 redis` then `brew services start postgresql@16 redis`

---

## 1. Clone and install

```bash
git clone https://github.com/giarcheuli/gigs.ge.git
cd gigs.ge
pnpm install
```

---

## 2. Environment files

### API (`apps/api/.env`)

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` — the **required** values to change:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gigsge
JWT_ACCESS_SECRET=any-random-string-32-chars-minimum
JWT_REFRESH_SECRET=another-random-string-32-chars-min
```

Everything else can stay as the example defaults for local UAT. R2 and Resend keys are optional — the API runs without them (file uploads and real email are skipped; OTP codes appear in the server console log as `_dev.code`).

### Web (`apps/web/.env.local`)

```bash
cp apps/web/.env.example apps/web/.env.local
```

The default `NEXT_PUBLIC_API_URL=http://localhost:3001` is correct for local UAT — no changes needed.

### Cloud Run note (important)

For Cloud Run builds, the web bundle is compiled with `NEXT_PUBLIC_API_URL` from Cloud Build substitution `_API_URL`.

Set trigger substitutions to hosted URLs, not localhost:

- `_API_URL=https://gigsge-api-723467137798.us-central1.run.app`
- `_FRONTEND_URL=https://gigsge-web-723467137798.us-central1.run.app`

The web auth screens (`/login`, `/register`, `/verify`) and shared API helper use a production safeguard: if `_API_URL` is missing or points to localhost, they fall back to the hosted API URL above so authentication does not break in UAT.

---

## 3. Database setup

Create the database, run migrations, and seed UAT accounts:

```bash
# Create the database (if it doesn't exist yet)
createdb gigsge

# Run all migrations
pnpm --filter @gigs/api db:migrate

# Insert 3 pre-verified UAT accounts
pnpm --filter @gigs/api db:seed:uat
```

The seed is idempotent — safe to re-run. It inserts:

| Email | Password | Role |
|-------|----------|------|
| `poster1@uat.gigs.ge` | `Uat-Demo-2026!` | Gig poster |
| `worker1@uat.gigs.ge` | `Uat-Demo-2026!` | Worker (scenario A) |
| `worker2@uat.gigs.ge` | `Uat-Demo-2026!` | Worker (scenario B) |

All three accounts have `emailVerified: true` and `phoneVerified: true` — they are ready to post and apply immediately without going through OTP verification.

---

## 4. Local pre-deploy guard (no cloud)

Before any Cloud Run deployment, run this local guard:

```bash
pnpm check:web-auth-base
```

What it checks:

- Builds `@gigs/web` in production mode locally.
- Fails if compiled auth calls (`/auth/login`, `/auth/register`, `/auth/verify-otp`, `/auth/refresh`, `/auth/resend-otp`, `/auth/me`) are hardwired to `localhost:3001`.

This catches the exact regression class that causes hosted login to show a network error while local dev appears fine.

## 5. Start the stack

Open two terminal windows:

**Terminal 1 — API** (port 3001):
```bash
pnpm --filter @gigs/api dev
```
Expected: `Server listening at http://0.0.0.0:3001`

**Terminal 2 — Web** (port 3000):
```bash
pnpm --filter @gigs/web dev
```
Expected: `Ready on http://localhost:3000`

Verify the API health check: `curl http://localhost:3001/health`  
Expected: `{"status":"ok","timestamp":"..."}`

---

## 5. UAT happy path — step by step

### Scenario A: Post a gig, apply, sign, complete

**Step 1 — Post a gig (poster1)**

1. Open `http://localhost:3000`
2. Click **Sign in** → log in as `poster1@uat.gigs.ge` / `Uat-Demo-2026!`
3. Click **+ Post a gig**
4. Fill in the form:
   - Short description: e.g. `Fix leaking kitchen pipe`
   - Price type: **Fixed** → enter `₾ 150`
   - Region: `Tbilisi`
   - Start / Due dates: today and +5 days
   - Leave visibility toggles at defaults
5. Click **Publish gig** → you are redirected to the gig detail page
6. The gig is now live on the board with status **active**

**Step 2 — Apply (worker1)**

1. Open a **private/incognito window** (or a different browser)
2. Sign in as `worker1@uat.gigs.ge` / `Uat-Demo-2026!`
3. Go to `http://localhost:3000/gigs` → find the gig you just posted
4. Click the gig → click **Apply for this gig**
5. Optionally add a message → click **Submit application**
6. The button changes to "Application pending"

**Step 3 — Accept the application (poster1)**

1. Back in the poster1 window, go to `http://localhost:3000/gigs` → open the gig
2. Scroll to **Applications** → you should see worker1's application
3. Click **Accept** → you are redirected to `/contracts/:id`
4. Contract status: **Awaiting signatures**

**Step 4 — Both parties sign**

1. As poster1 on the contract page → click **Sign contract**
2. As worker1 → open `http://localhost:3000/account` → **My Work** tab → click the contract link → click **Sign contract**
3. Both signed → status changes to **In progress**

**Step 5 — Mark complete**

> UAT accounts bypass the half-time rule — buttons are always available.

1. As worker1 on the contract page → click **Mark job complete** → status: **Pending confirmation**
2. As poster1 on the contract page → click **Confirm job complete** → status: **Completed ✓**

✅ Happy path complete.

---

### Scenario B: Dispute flow

Follow Steps 1–4 of Scenario A to reach **In progress**, then:

1. As poster1, click **Job not done — raise dispute** → status: **Disputed**
2. Both parties can see the dispute banner with the opened timestamp.

---

### Scenario C: Cancel within grace period (no fee)

1. Follow Steps 1–4 to reach **In progress**
2. Within 24 hours of both signing: either party clicks **Cancel contract**
3. Response includes `withinGrace: true` — no platform fees applied

---

### Scenario D: Worker quits

1. Follow Steps 1–4 to reach **In progress**
2. As worker1, click **Quit job**
3. If quit within 24 h of signing: no fee. After 24 h: 2% fee on agreed price.

---

## 6. Key visibility rules to validate

| Field | Who can see it |
|-------|---------------|
| Price (fixed gig) | Verified users only (default) |
| City | Verified users only (default) |
| Street address | On request (hidden unless changed) |
| Dates | Authenticated users only (default) |

To test price locking: open the gig in a private window **without logging in** — the price should show "🔒 Price visible to verified users".

---

## 7. OTP codes in development

Real email delivery requires a Resend API key (not set in local UAT). OTP codes are logged to the API server console:

```
_dev: { code: '123456' }
```

Watch Terminal 1 (API) when triggering register/verify/resend.

---

## 8. Reset between runs

To start fresh:

```bash
# Drop and recreate the database
dropdb gigsge && createdb gigsge
pnpm --filter @gigs/api db:migrate
pnpm --filter @gigs/api db:seed:uat
```

---

## 9. Known scope boundaries for this slice

These are intentional limitations, not bugs:

- Only **fixed-price** gigs support contract acceptance (range/negotiable gigs cannot be accepted yet)
- File uploads (avatars, gig images, dispute evidence) are not implemented — R2 integration is deferred
- Admin dashboard is a placeholder — dispute arbiter UI does not exist yet
- BullMQ background jobs (48h auto-complete, 14-day overdue auto-complete) are not running — timers require Redis workers started separately
- Phone OTP verification is not wired to a real SMS provider — phone is stored but OTP channel is email-only in this slice
