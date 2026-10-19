# UAT Runbook — gigs.ge

Setup history and step-by-step checks for the dev and UAT environments. The current cloud layout (names, identities, secrets) is summarized in [operations/cloud-inventory.md](../operations/cloud-inventory.md); this runbook records how it was built and how to verify it.

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

Everything else can stay as the example defaults for local development. Without `RESEND_API_KEY`, local development uses the explicitly development-only `_dev` code/token response. Real email delivery requires a verified Resend domain and API key. Never use `_dev` codes in a deployed environment.

### Web (`apps/web/.env.local`)

```bash
cp apps/web/.env.example apps/web/.env.local
```

The default `NEXT_PUBLIC_API_URL=http://localhost:3001` is correct for local UAT — no changes needed.

### Cloud Run note (important)

For Cloud Run builds, the web bundle is compiled with `NEXT_PUBLIC_API_URL` from Cloud Build substitution `_API_URL`.

Set trigger substitutions to hosted URLs, not localhost (fixed 2026-10-07):

- `_API_URL=https://api.uat.gigs.ge`
- `_FRONTEND_URL=https://uat.gigs.ge`

Custom domains are live as of 2026-10-07: **https://uat.gigs.ge** (web, the URL to give testers)
and **https://api.uat.gigs.ge** (API). DNS is hosted on Cloudflare (records must stay “DNS only”);
the underlying Cloud Run URLs (gigsge-web/gigsge-api …run.app) keep working as fallbacks.

The web auth screens (`/login`, `/register`, `/verify`) and shared API helper use a production safeguard: if `_API_URL` is missing or points to localhost, they fall back to the hosted API URL above so authentication does not break in UAT.

For deployed email delivery, create separate service accounts `gigsge-api-dev-runtime` and `gigsge-api-uat-runtime`, and configure each Cloud Run API service to use its matching identity. Grant each identity Cloud SQL Client on the project, Secret Manager Secret Accessor only on its environment's Resend secret, and Cloud Tasks Enqueuer only on its environment's queue. Grant the Cloud Build service account Service Account User on both identities. Create Secret Manager secrets `resend-api-key-dev` and `resend-api-key-uat` and store the matching Resend key in each. Set `_RESEND_API_SECRET`, `_AUTH_EMAIL_QUEUE`, and `_API_RUNTIME_SERVICE_ACCOUNT` explicitly in each trigger. The substitutions default to empty to prevent UAT from silently using dev resources. Cloud Run receives the key as `RESEND_API_KEY`; never put the key value in trigger substitutions, source files, or build arguments.

Email jobs use Cloud Tasks. Enable the Cloud Tasks API and create `auth-email-dev` and `auth-email-uat` queues in `us-central1`. Set each trigger's `_AUTH_EMAIL_QUEUE` to its matching queue. The API sends only encrypted, signed task payloads; the task handler rejects invalid signatures and expired or used credentials.

---

**Environment isolation update:** Dev and UAT run on separate Cloud SQL instances (`gigsge-dev-db` and `gigsge-uat-db`), so a dev login cannot reach UAT data. Each instance has its own login (`gigsge_dev_app` on dev, `postgres` on UAT) whose password lives in `db-password-dev` or `db-password-uat`. Use separate `jwt-access-secret-*`, `jwt-refresh-secret-*`, and `resend-api-key-*` secrets, plus separate runtime service accounts, queues, and trigger substitutions for dev and UAT. The earlier Resend-only deployment note does not cover these required isolation settings.

## 3. Database setup

**Secret access correction:** The API runtime service account needs Secret Manager Secret Accessor on its matching `db-password-*`, `jwt-access-secret-*`, `jwt-refresh-secret-*`, and `resend-api-key-*` secrets. Scope access to those individual secrets; do not grant project-wide secret access. This supersedes the earlier Resend-only permission note.

### Isolate dev and UAT with separate SQL instances

We first tried to isolate dev and UAT inside one shared instance by changing database owners and revoking `CONNECT`. Cloud SQL blocks that: its `postgres` user is not a true superuser, so it cannot reliably reassign or drop databases owned by `cloudsqlsuperuser` or undo grants it did not make. A separate instance per environment gives a hard boundary instead.

- **Dev:** instance `gigsge-dev-db` (PostgreSQL 16, Enterprise, `db-f1-micro`, 10 GB HDD, zonal, no backups, deletion protection on). Database `gigsge_dev`, login `gigsge_dev_app`.
- **UAT:** instance `gigsge-uat-db`, database `gigsge`, login `postgres`. The existing UAT tables are owned by `postgres`, and a new login could not alter them without an interactive SQL session to transfer ownership. Because the instance now holds only UAT data, the API keeps `postgres` with a rotated password stored in `db-password-uat`. Moving UAT to a dedicated `gigsge_uat_app` owner is a follow-up.

Create each login with `gcloud sql users create` and a generated password. Write the password straight into Secret Manager (`db-password-dev` / `db-password-uat`) without printing it, and never put it in Cloud Build substitutions. Cloud SQL gives new logins the `cloudsqlsuperuser` role by default. That is acceptable because each instance holds only one environment's data. The API's schema push and UAT seed run as that login when the container starts.

**One-time cutover per environment:** Older API revisions stored `DB_PASSWORD`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` as plain-text Cloud Run variables. Cloud Run refuses to switch a plain-text variable to a secret reference in one update. Run `gcloud run services update <api-service> --region=us-central1 --container=api --remove-env-vars=DB_PASSWORD,JWT_ACCESS_SECRET,JWT_REFRESH_SECRET` once before the first secret-based deploy.

### Environment substitutions and secrets

Create the dedicated API runtime accounts `gigsge-api-dev-runtime@gigsge.iam.gserviceaccount.com` and `gigsge-api-uat-runtime@gigsge.iam.gserviceaccount.com`. Grant each Cloud SQL Client on the project, Secret Manager Secret Accessor only on its four secrets (`db-password-*`, `jwt-access-secret-*`, `jwt-refresh-secret-*`, and `resend-api-key-*`), and Cloud Tasks Enqueuer only on its queue. Both deploy triggers run as the default compute account `723467137798-compute@developer.gserviceaccount.com`, not the Cloud Build account, so grant that account Service Account User on both runtime accounts.

**Temporary shared Resend key:** `resend-api-key-uat` currently holds a copy of the dev key, because the dev key is send-only and cannot create new keys. To separate them, create a sending-access key for `gigs.ge` in Resend and add it as a new version of `resend-api-key-uat`. The next UAT deploy picks it up (`:latest`).

Set trigger substitutions independently. Dev uses `_DB_INSTANCE=gigsge-dev-db`, `_DB_NAME=gigsge_dev`, `_DB_USER=gigsge_dev_app`, `_DB_PASSWORD_SECRET=db-password-dev`, `_JWT_ACCESS_SECRET_NAME=jwt-access-secret-dev`, `_JWT_REFRESH_SECRET_NAME=jwt-refresh-secret-dev`, `_RESEND_API_SECRET=resend-api-key-dev`, `_AUTH_EMAIL_QUEUE=auth-email-dev`, `_MEDIA_BUCKET=gigsge-dev-media`, and `_API_RUNTIME_SERVICE_ACCOUNT=gigsge-api-dev-runtime@gigsge.iam.gserviceaccount.com`. UAT uses `_DB_INSTANCE=gigsge-uat-db`, `_DB_NAME=gigsge`, `_DB_USER=postgres`, and the `-uat` secrets, `auth-email-uat` queue, `gigsge-uat-media` bucket, and `gigsge-api-uat-runtime@gigsge.iam.gserviceaccount.com` identity. Keep the existing API/frontend URL substitutions for each environment.

Remove the old `_DB_PASSWORD`, `_JWT_ACCESS_SECRET`, and `_JWT_REFRESH_SECRET` substitutions after the new Secret Manager versions are configured. Their values are no longer used and should not remain in the trigger.

### Required Cloud Build service and database values

Set these values explicitly in each trigger; Cloud Build now rejects missing values.

| Trigger | API service | Web service | Database | Database user | SQL instance |
|---------|-------------|-------------|----------|---------------|--------------|
| Dev | `gigsge-api-dev` | `gigsge-web-dev` | `gigsge_dev` | `gigsge_dev_app` | `gigsge-dev-db` |
| UAT | `gigsge-api` | `gigsge-web` | `gigsge` | `postgres` | `gigsge-uat-db` |

Also set `_API_RUNTIME_SERVICE_ACCOUNT`, `_DB_PASSWORD_SECRET`, `_JWT_ACCESS_SECRET_NAME`, `_JWT_REFRESH_SECRET_NAME`, `_RESEND_API_SECRET`, `_AUTH_EMAIL_QUEUE`, `_MEDIA_BUCKET`, `_API_URL`, and `_FRONTEND_URL` to the matching environment values. Dev and UAT use separate SQL instances, DB users, and credentials.

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

## 7. Email verification and password reset

In local development without a Resend key, registration and resend responses include development-only codes. The web screens log those codes to the browser console. Password-reset responses similarly include a development-only token. These values are never returned by a deployed production-mode API.

With the dev Secret Manager key and Cloud Tasks queue configured, register a new account and confirm the verification message arrives from `noreply@gigs.ge`. Test resend cooldown and forgot-password rate limits, then use **Forgot your password?** on the sign-in page to request a reset link and complete the reset.

Resend acceptance means the provider queued the message; check the destination mailbox's spam folder if it does not appear.

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
- Phone verification is optional and SMS delivery is not configured
