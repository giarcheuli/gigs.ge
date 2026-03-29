# gigs.ge — System Design Document

> **Status:** Draft v0.2 — open questions resolved; ready for implementation planning.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [User Roles & Access Levels](#2-user-roles--access-levels)
3. [Feature Requirements](#3-feature-requirements)
   - 3.1 [Unauthenticated Visitors](#31-unauthenticated-visitors)
   - 3.2 [Authenticated but Unverified Users](#32-authenticated-but-unverified-users)
   - 3.3 [Authenticated & Verified Users](#33-authenticated--verified-users)
   - 3.4 [Admin](#34-admin)
4. [Registration & Verification Flow](#4-registration--verification-flow)
5. [Job (Gig) Lifecycle](#5-job-gig-lifecycle)
6. [Visibility & Privacy Model](#6-visibility--privacy-model)
7. [Notifications, Inbox & Messaging](#7-notifications-inbox--messaging)
8. [User Profile](#8-user-profile)
9. [Data Models](#9-data-models)
10. [API Design](#10-api-design)
11. [UI/UX Screens & Flows](#11-uiux-screens--flows)
12. [Tech-Stack Proposal](#12-tech-stack-proposal)
13. [Infrastructure & Deployment](#13-infrastructure--deployment)
14. [Security Considerations](#14-security-considerations)
15. [Decisions Log & Next Steps](#15-decisions-log--next-steps)

---

## 1. Project Overview

**gigs.ge** is a minimalistic, mobile-first gig-board for Georgia where people can post short-term jobs ("gigs") or apply for them.  The platform is intentionally lean: two user roles, no agency complexity, and a privacy-first approach to contact sharing.

### Goals

| # | Goal |
|---|------|
| G1 | Let anyone browse available gigs without registering |
| G2 | Protect personal contact info until both parties trust each other |
| G3 | Keep the posting flow fast (< 2 min from idea to live gig) |
| G4 | Support Georgian regions / cities out of the box |
| G5 | Mobile-first; progressive web app (PWA) is sufficient for v1 |

### Non-Goals (v1)

- Payment processing / escrow
- Real-time chat (async in-app messaging only)
- Company / business accounts
- Rating or review system (deferred to v2)
- Native mobile app — PWA only (deferred to v2)
- Privacy Policy and Terms of Service pages (future deliverable)

---

## 2. User Roles & Access Levels

```
┌─────────────────────────────────────────────────────────┐
│  Visitor (unauthenticated)                              │
│  └─ can: browse board (limited view)                    │
│                                                         │
│  User (authenticated)                                   │
│  ├─ Unverified  → same board view as visitor            │
│  └─ Verified    → full board view, post, apply          │
│                                                         │
│  Admin                                                  │
│  └─ full access + moderation tools                      │
└─────────────────────────────────────────────────────────┘
```

A **user** becomes _verified_ only after both their email address **and** phone number have been confirmed via OTP/OTC.

---

## 3. Feature Requirements

### 3.1 Unauthenticated Visitors

| # | Capability | Notes |
|---|-----------|-------|
| UV-1 | View live job board | Paginated / infinite-scroll list |
| UV-2 | See per-listing preview | Short description, preview image(s), offered price/range, region only |
| UV-3 | Register | See §4 |
| UV-4 | Log in | Email + password or phone + OTP |

**Explicitly hidden from visitors:**
- Contact info (phone, email, WhatsApp, Telegram, Signal)
- Full address / city / street
- Full name of poster
- Long description, full image gallery
- Application button

---

### 3.2 Authenticated but Unverified Users

- Exact same board view as unauthenticated visitors (UV-1 & UV-2).
- Can view own profile and edit it.
- **Cannot** post a gig.
- **Cannot** apply for a gig.
- Prompted on every restricted action to complete verification.

---

### 3.3 Authenticated & Verified Users

| # | Capability | Notes |
|---|-----------|-------|
| AV-1 | View full job listing | Governed by per-field visibility settings of the poster |
| AV-2 | Post a gig | See §5 |
| AV-3 | Apply for a gig | Sends APPLICATION/REQUEST (with optional attachments) to poster |
| AV-4 | Manage own gigs | Edit, close, delete |
| AV-5 | Inbox, Sent & notifications | See §7 |
| AV-6 | Accept / reject applicants | Leads to HANDSHAKE |
| AV-7 | View applicant profile | After receiving an application |
| AV-8 | Message any other user | Via in-app messaging (see §7) |
| AV-9 | Flag a gig | Reports gig to Admin Inbox for review |

---

### 3.4 Admin

> The admin panel is a **separate application** (separate deployment, separate route, separate auth session) but is structurally identical to the user-facing app.  It adds user-management screens on top of the same underlying API.

| # | Capability | Notes |
|---|-----------|-------|
| AD-1 | View all registered users | Full user list with account details |
| AD-2 | View any user's account | Same view the user sees of their own profile — **excludes** Inbox, Sent, and any message/communication folders |
| AD-3 | Restrict a user | Limits posting / applying ability |
| AD-4 | Block / suspend a user | Prevents login |
| AD-5 | Delete specific account data | Can remove any individual piece of PII |
| AD-6 | Mark account for deletion | System auto-deletes the account 1 year after the user's last access date |
| AD-7 | View all gigs (full info) | Including hidden fields |
| AD-8 | Hide / restore a gig | Moderation action |
| AD-9 | Admin Inbox | Receives flag reports from users; can send and receive direct messages to/from any user |
| AD-10 | Manage region / city taxonomy | Add / edit regions and cities |

---

## 4. Registration & Verification Flow

### 4.1 Required Registration Fields

| Field | Validation |
|-------|-----------|
| Email | Valid RFC-5322 email; unique |
| Mobile number | E.164 format; unique; Georgia (+995) default |
| Date of Birth | Must be ≥ 18 years old at submission time |

### 4.2 Optional Registration Fields

| Field | Notes |
|-------|-------|
| First Name | |
| Last Name | |
| WhatsApp number | Defaults to mobile if not set |
| Telegram handle | `@username` or phone |
| Signal number | Phone-based |
| Country | Pre-filled: Georgia (GE) |
| Region | Pre-selected if browser Geolocation API allowed |
| City | Pre-selected if browser Geolocation API allowed |
| Street Address | Free-text |

### 4.3 Verification Steps

```
Register ──► Send verification email (link + 6-digit OTC)
         └─► Send verification SMS  (6-digit OTP)

User confirms email  ──► email_verified = true
User confirms phone  ──► phone_verified = true

email_verified AND phone_verified ──► user status = VERIFIED
```

- OTP/OTC expires after **15 minutes**.
- User can request a resend after **60 seconds** (rate-limited).
- Maximum **5 attempts** per code before generating a new one.
- Link-based email verification is the primary flow; OTC fallback if links cannot be clicked.

> **v1 PoC note:** SMS delivery is **stubbed** — the OTP code is returned directly in the API response (dev mode) or logged server-side so the team can test without a live SMS provider.  A real provider (Twilio Verify or a local Georgian carrier) will be wired up before production launch.

### 4.4 Age Restriction

- Server-side enforcement: reject `date_of_birth` that yields age < 18.
- Client-side: date picker blocks future dates and shows warning for under-18.
- Date stored as `YYYY-MM-DD`; age re-checked server-side on every relevant action.

---

## 5. Job (Gig) Lifecycle

```
DRAFT ──► ACTIVE ──► CLOSED
                └──► CANCELLED (by poster)
                └──► EXPIRED   (poster-defined TTL or admin action)
```

### 5.0 Expiry Policy

- The poster **must** set an expiry date when creating a gig.
- Maximum allowed expiry window: **30 days** from creation date.
- When `expires_at` is reached the system automatically transitions status → `EXPIRED`.
- The poster receives a `GIG_EXPIRED` notification (see §7).
- Expired gigs are hidden from the board but remain readable by the poster and admin.

### 5.1 Gig Fields & Default Visibility

| Field | Always Visible | Default | Configurable? | Notes |
|-------|---------------|---------|---------------|-------|
| Short description | ✅ | visible | ❌ | Max 160 chars; board card preview |
| Long description | ✅ | visible | ❌ | Markdown or plain text |
| Images | — | visible | ✅ | Max 10 images; thumbnail on board |
| Price — fixed or range | — | visible | ✅ | UI nudge to keep visible |
| Price — negotiable | ✅ | visible | ❌ | **Always public, hardcoded; not configurable** |
| Available dates (from / to) | — | visible | ✅ | |
| Region | ✅ | visible | ❌ | Always shown on board card |
| City | — | hidden | ✅ | |
| Street address / location | — | hidden | ✅ | |
| Contact info (from profile) | — | requestable | ✅ | UI strongly discourages making visible upfront |
| Expiry date | — | visible | ❌ | Always shown to poster; shown to board as "Available until" |

**"Requestable"** = the field is hidden by default; an applicant can explicitly request it, which creates an in-app notification to the poster who can then choose to share or deny.

### 5.2 Price / Compensation Options

| Option | UI Label | Visibility |
|--------|----------|-----------|
| Fixed price | "Fixed: ₾ ___" | Configurable (visible by default) |
| Price range | "Between ₾ ___ and ₾ ___" | Configurable (visible by default) |
| Negotiated on site | "💬 Negotiable — discuss in person" | **Always visible; hardcoded** |

UI copy on the posting form: *"Making your offer clear and attractive gets the job done faster."*

### 5.3 Application / REQUEST Flow

```
Applicant clicks [APPLY]
  └─► APPLICATION record created (optional: cover message + attachments)
  └─► Notification sent to poster (see §7)

Poster reviews APPLICATION
  ├─► [ACCEPT] ──► HANDSHAKE created; both parties get notification
  └─► [DECLINE] ──► Applicant notified

After HANDSHAKE:
  - Poster's last name becomes visible to applicant (if profile permits)
  - Agreed price & dates confirmed
```

**Application attachments:** Applicants may upload portfolio images or documents (PDF, JPG, PNG) alongside their application. Max 5 files, 10 MB each. Stored in the same object storage as gig images.

### 5.4 HANDSHAKE

A **HANDSHAKE** is a mutual agreement object linking:
- `poster_id`
- `applicant_id`
- `gig_id`
- `agreed_price` (optional, can differ from posted price)
- `agreed_start_date`
- `status`: `PENDING_CONFIRMATION | ACTIVE | COMPLETED | DISPUTED`

---

## 6. Visibility & Privacy Model

### 6.1 Visibility Levels

| Level | Who can see |
|-------|-------------|
| `PUBLIC` | Anyone (visitor, user, admin) |
| `AUTHENTICATED` | Logged-in users only |
| `VERIFIED` | Verified users only |
| `ON_REQUEST` | Visible only after an explicit request is granted |
| `POST_HANDSHAKE` | Visible only after HANDSHAKE is accepted |
| `PRIVATE` | Owner + admin only |

### 6.2 Default Visibility Matrix

| Data Point | Visitor | Auth Unverified | Auth Verified | Post-Handshake |
|-----------|---------|-----------------|--------------|----------------|
| Short description | ✅ | ✅ | ✅ | ✅ |
| Long description | ❌ | ❌ | ✅ | ✅ |
| Images (preview) | ✅ | ✅ | ✅ | ✅ |
| Images (full gallery) | ❌ | ❌ | ✅* | ✅ |
| Price | ✅ | ✅ | ✅* | ✅ |
| Region | ✅ | ✅ | ✅ | ✅ |
| City | ❌ | ❌ | ✅* | ✅ |
| Full address | ❌ | ❌ | on-request* | ✅ |
| Poster name | ❌ | ❌ | on-request* | ✅ |
| Contact info | ❌ | ❌ | on-request* | ✅ |

\* Poster can change default via per-field toggle when creating/editing the gig.

---

## 7. Notifications, Inbox & Messaging

### 7.1 Notification Types

| Type | Trigger | Recipient | Message Template |
|------|---------|-----------|-----------------|
| `APPLICATION_RECEIVED` | Applicant applies | Poster | `{name} applied for "{gig_short_desc}"` + [SEE APPLICATION] |
| `APPLICATION_ACCEPTED` | Poster accepts | Applicant | `Your application for "{gig_short_desc}" was accepted!` |
| `APPLICATION_DECLINED` | Poster declines | Applicant | `Your application for "{gig_short_desc}" was not accepted.` |
| `INFO_REQUEST_RECEIVED` | Applicant requests hidden info | Poster | `{name} requested your contact info for "{gig_short_desc}"` |
| `INFO_REQUEST_GRANTED` | Poster grants info request | Applicant | `Contact info for "{gig_short_desc}" is now visible.` |
| `HANDSHAKE_COMPLETED` | Both confirm | Both | `Handshake confirmed for "{gig_short_desc}"` |
| `GIG_EXPIRED` | TTL reached | Poster | `Your gig "{gig_short_desc}" has expired.` |
| `GIG_FLAGGED` | User flags a gig | Admin inbox | `{name} flagged gig "{gig_short_desc}" — [REVIEW]` |
| `NEW_MESSAGE` | User or admin sends a direct message | Recipient | `New message from {name}` |

### 7.2 User Account Page — Inbox & Sent

Every registered user (including admin) has two communication folders accessible from their **User Account Page**:

| Folder | Contents |
|--------|---------|
| **Inbox** | Received notifications + direct messages from other users or admin |
| **Sent** | Direct messages sent by this user |

- Notifications (system events) appear in **Inbox** only and are read-only.
- Direct messages appear in both **Inbox** (received) and **Sent** (sent).
- Unread items are indicated by a badge on the Inbox menu item.

> **Admin privacy rule:** Admin can see all users' account data and gigs, but **cannot** access any user's Inbox, Sent folder, or any message content. The messaging feature is strictly user-to-user or admin-to-user (outbound only from admin's own Inbox).

### 7.3 Direct Messaging

- Any verified user can send a direct message to another verified user.
- Admin can send direct messages to any user (e.g., warnings, moderation notices).
- Users can send direct messages to admin (e.g., appeals, questions).
- Messages are plain text only in v1; no rich formatting.
- Messages are stored persistently; no auto-deletion.

### 7.4 Notification Delivery

- **In-app Inbox** (primary): bell icon with unread badge; list view in `/inbox`.
- **Email** (secondary): optional, user can disable per notification type.
- **Push notification** (PWA): deferred to v2.

### 7.5 [SEE APPLICATION] Redirect

Clicking [SEE APPLICATION] opens the **applicant's profile page** (`/profile/{userId}`).  
Profile visibility rules apply (see §8).

---

## 8. User Profile

### 8.1 Profile Fields & Visibility

| Field | Default Visibility | Configurable by User | Notes |
|-------|--------------------|---------------------|-------|
| Avatar image | `VERIFIED` | ✅ | |
| First name | `VERIFIED` | ✅ | Always visible to poster who received your application |
| Last name | `POST_HANDSHAKE` | ✅ | |
| Short bio | `PUBLIC` | ❌ (can't hide) | Max 280 chars |
| Region | `VERIFIED` | ✅ | |
| WhatsApp | `ON_REQUEST` | ✅ | |
| Telegram | `ON_REQUEST` | ✅ | |
| Signal | `ON_REQUEST` | ✅ | |
| Email | `PRIVATE` | ❌ | Never shown on profile |
| Phone | `PRIVATE` | ❌ | Never shown on profile |
| Date of Birth | `PRIVATE` | ❌ | Age range shown optionally (e.g. "25–30") |

Unauthenticated users have **no access** to any other user's profile page.

### 8.2 My Profile Page (`/profile/me`)

Full edit access to all own fields; preview mode to see how others see your profile.

---

## 9. Data Models

> All timestamps in UTC ISO-8601.

### 9.1 `users`

```sql
id                      UUID PRIMARY KEY DEFAULT gen_random_uuid()
email                   TEXT UNIQUE NOT NULL
email_verified          BOOLEAN NOT NULL DEFAULT false
phone                   TEXT UNIQUE NOT NULL           -- E.164
phone_verified          BOOLEAN NOT NULL DEFAULT false
password_hash           TEXT NOT NULL
date_of_birth           DATE NOT NULL
role                    TEXT NOT NULL DEFAULT 'user'   -- 'user' | 'admin'
status                  TEXT NOT NULL DEFAULT 'active' -- 'active' | 'restricted' | 'suspended' | 'banned'
last_accessed_at        TIMESTAMPTZ                    -- updated on every authenticated request
marked_for_deletion_at  TIMESTAMPTZ                    -- set by admin; account auto-deleted 1 year after last_accessed_at
created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Account deletion rule:** When `marked_for_deletion_at` is set, a background job checks daily.  If `now() - last_accessed_at >= 1 year` the account and all its data are permanently deleted.  If the user logs in before that deadline, `marked_for_deletion_at` is cleared automatically.

### 9.2 `user_profiles`

```sql
user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
first_name          TEXT
last_name           TEXT
avatar_url          TEXT
short_bio           TEXT CHECK (char_length(short_bio) <= 280)
country             TEXT NOT NULL DEFAULT 'GE'
region_id           INT  REFERENCES regions(id)
city_id             INT  REFERENCES cities(id)
street_address      TEXT
whatsapp            TEXT
telegram            TEXT
signal              TEXT
-- visibility toggles (stored as JSONB or individual columns)
vis_first_name      TEXT NOT NULL DEFAULT 'verified'    -- visibility level enum
vis_last_name       TEXT NOT NULL DEFAULT 'post_handshake'
vis_avatar          TEXT NOT NULL DEFAULT 'verified'
vis_region          TEXT NOT NULL DEFAULT 'verified'
vis_whatsapp        TEXT NOT NULL DEFAULT 'on_request'
vis_telegram        TEXT NOT NULL DEFAULT 'on_request'
vis_signal          TEXT NOT NULL DEFAULT 'on_request'
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 9.3 `gigs`

```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
poster_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
short_description   TEXT NOT NULL CHECK (char_length(short_description) <= 160)
long_description    TEXT
region_id           INT  NOT NULL REFERENCES regions(id)
city_id             INT  REFERENCES cities(id)
street_address      TEXT
price_type          TEXT NOT NULL                -- 'fixed' | 'range' | 'negotiable'
price_fixed         NUMERIC(10,2)
price_range_min     NUMERIC(10,2)
price_range_max     NUMERIC(10,2)
available_from      DATE
available_to        DATE
status              TEXT NOT NULL DEFAULT 'active' -- 'draft'|'active'|'closed'|'cancelled'|'expired'
-- per-field visibility toggles
-- NOTE: when price_type = 'negotiable', vis_price is ignored and always treated as 'public'
vis_images          TEXT NOT NULL DEFAULT 'verified'
vis_price           TEXT NOT NULL DEFAULT 'public'
vis_city            TEXT NOT NULL DEFAULT 'verified'
vis_address         TEXT NOT NULL DEFAULT 'on_request'
vis_contact         TEXT NOT NULL DEFAULT 'on_request'
vis_dates           TEXT NOT NULL DEFAULT 'verified'
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
expires_at          TIMESTAMPTZ NOT NULL             -- required; max 30 days from created_at
```

### 9.4 `gig_images`

```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
gig_id      UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE
url         TEXT NOT NULL
is_preview  BOOLEAN NOT NULL DEFAULT false  -- first/chosen image shown on board card
sort_order  INT NOT NULL DEFAULT 0
uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 9.5 `applications`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
gig_id          UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE
applicant_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
status          TEXT NOT NULL DEFAULT 'pending' -- 'pending'|'accepted'|'declined'|'withdrawn'
message         TEXT                            -- optional cover note
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (gig_id, applicant_id)
```

### 9.5a `application_attachments`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE
url             TEXT NOT NULL               -- object storage URL
filename        TEXT NOT NULL
mime_type       TEXT NOT NULL               -- 'image/jpeg' | 'image/png' | 'application/pdf'
size_bytes      INT  NOT NULL
uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```

Max 5 attachments per application; max 10 MB each.

### 9.6 `handshakes`

```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
application_id      UUID NOT NULL UNIQUE REFERENCES applications(id)
gig_id              UUID NOT NULL REFERENCES gigs(id)
poster_id           UUID NOT NULL REFERENCES users(id)
applicant_id        UUID NOT NULL REFERENCES users(id)
agreed_price        NUMERIC(10,2)
agreed_start_date   DATE
status              TEXT NOT NULL DEFAULT 'active'
                    -- 'active'|'completed'|'disputed'|'cancelled'
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 9.7 `notifications`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
recipient_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
type            TEXT NOT NULL                    -- see §7.1 type codes
payload         JSONB NOT NULL DEFAULT '{}'      -- gig_id, applicant_id, etc.
read_at         TIMESTAMPTZ                      -- NULL = unread
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 9.8 `otp_codes`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
channel         TEXT NOT NULL                    -- 'email' | 'sms'
code_hash       TEXT NOT NULL                    -- bcrypt hash of 6-digit code
attempts        INT NOT NULL DEFAULT 0
expires_at      TIMESTAMPTZ NOT NULL
used_at         TIMESTAMPTZ
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 9.9 `regions` & `cities`

```sql
-- regions (mkhare/მხარე)
id      SERIAL PRIMARY KEY
name_en TEXT NOT NULL
name_ka TEXT NOT NULL
code    TEXT UNIQUE NOT NULL   -- e.g. 'tbilisi', 'kakheti'

-- cities
id        SERIAL PRIMARY KEY
region_id INT NOT NULL REFERENCES regions(id)
name_en   TEXT NOT NULL
name_ka   TEXT NOT NULL
```

### 9.10 `info_requests`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
gig_id          UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE
requester_id    UUID NOT NULL REFERENCES users(id)
field           TEXT NOT NULL   -- 'contact' | 'address' | 'city' | ...
status          TEXT NOT NULL DEFAULT 'pending' -- 'pending'|'granted'|'denied'
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
resolved_at     TIMESTAMPTZ
UNIQUE (gig_id, requester_id, field)
```

### 9.11 `messages`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
recipient_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
body            TEXT NOT NULL
read_at         TIMESTAMPTZ        -- NULL = unread
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 9.12 `gig_flags`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
gig_id          UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE
reporter_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
reason          TEXT NOT NULL      -- free-text or enum: 'spam'|'offensive'|'misleading'|'other'
status          TEXT NOT NULL DEFAULT 'pending' -- 'pending'|'reviewed'|'dismissed'
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
reviewed_at     TIMESTAMPTZ
reviewed_by     UUID REFERENCES users(id)
UNIQUE (gig_id, reporter_id)       -- one flag per user per gig
```

---

## 10. API Design

> RESTful JSON API; versioned under `/api/v1/`.  
> Authentication: short-lived JWT (access token, 15 min) + httpOnly refresh token cookie (7 days).

### 10.1 Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Email+password or phone+OTP login |
| POST | `/auth/logout` | Revoke refresh token |
| POST | `/auth/refresh` | Issue new access token |
| POST | `/auth/verify/email` | Confirm email OTC |
| POST | `/auth/verify/phone` | Confirm phone OTP |
| POST | `/auth/resend-otp` | Resend OTC/OTP |
| POST | `/auth/forgot-password` | Initiate password reset |
| POST | `/auth/reset-password` | Complete password reset |

### 10.2 Users / Profiles

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/me` | ✅ | Get own account + profile |
| PATCH | `/users/me` | ✅ | Update own account |
| GET | `/users/me/profile` | ✅ | Get own profile |
| PUT | `/users/me/profile` | ✅ | Update own profile |
| POST | `/users/me/avatar` | ✅ | Upload avatar |
| GET | `/users/:id/profile` | ✅ verified | View another user's profile (visibility rules applied) |

### 10.3 Gigs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/gigs` | ❌ | List active gigs (board view; limited fields for unauth) |
| GET | `/gigs/:id` | ❌ | Get single gig (visibility rules applied) |
| POST | `/gigs` | ✅ verified | Create gig |
| PATCH | `/gigs/:id` | ✅ owner | Update gig |
| DELETE | `/gigs/:id` | ✅ owner | Cancel/delete gig |
| POST | `/gigs/:id/images` | ✅ owner | Upload image(s) |
| DELETE | `/gigs/:id/images/:imageId` | ✅ owner | Remove image |
| GET | `/users/me/gigs` | ✅ | List own gigs |

### 10.4 Applications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/gigs/:id/applications` | ✅ verified | Apply for gig (with optional cover message) |
| GET | `/gigs/:id/applications` | ✅ owner | List applications for own gig |
| PATCH | `/gigs/:id/applications/:appId` | ✅ owner | Accept / decline application |
| DELETE | `/gigs/:id/applications/:appId` | ✅ applicant | Withdraw application |
| POST | `/gigs/:id/applications/:appId/attachments` | ✅ applicant | Upload attachment(s) |
| DELETE | `/gigs/:id/applications/:appId/attachments/:attachId` | ✅ applicant | Remove attachment |
| GET | `/users/me/applications` | ✅ | List own applications |

### 10.5 Handshakes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/handshakes/:id` | ✅ party | View handshake details |
| PATCH | `/handshakes/:id` | ✅ party | Update status (complete/dispute) |
| GET | `/users/me/handshakes` | ✅ | List own handshakes |

### 10.6 Info Requests

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/gigs/:id/info-requests` | ✅ verified | Request hidden field |
| GET | `/gigs/:id/info-requests` | ✅ owner | List info requests for own gig |
| PATCH | `/gigs/:id/info-requests/:reqId` | ✅ owner | Grant / deny info request |

### 10.7 Notifications & Messages

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/notifications` | ✅ | List notifications (paginated) |
| PATCH | `/notifications/:id/read` | ✅ | Mark as read |
| POST | `/notifications/read-all` | ✅ | Mark all as read |
| GET | `/messages/inbox` | ✅ | List received direct messages |
| GET | `/messages/sent` | ✅ | List sent direct messages |
| POST | `/messages` | ✅ | Send a direct message to a user |
| GET | `/messages/:id` | ✅ party | Get a single message |
| PATCH | `/messages/:id/read` | ✅ recipient | Mark message as read |

### 10.7a Gig Flags

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/gigs/:id/flags` | ✅ verified | Flag a gig |

### 10.8 Admin

> Admin API is served by the **same backend** but under `/admin/*` routes, protected by an `admin` role check.  The admin front-end is a **separate application** that consumes these routes.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/users` | ✅ admin | List all registered users |
| GET | `/admin/users/:id` | ✅ admin | View user account (profile only — no inbox/messages) |
| PATCH | `/admin/users/:id` | ✅ admin | Restrict / block / unblock user |
| DELETE | `/admin/users/:id/data/:field` | ✅ admin | Delete a specific piece of user data (PII) |
| POST | `/admin/users/:id/mark-deletion` | ✅ admin | Mark account for auto-deletion |
| DELETE | `/admin/users/:id/mark-deletion` | ✅ admin | Unmark account for auto-deletion |
| GET | `/admin/gigs` | ✅ admin | List all gigs (full info, all statuses) |
| PATCH | `/admin/gigs/:id` | ✅ admin | Hide / restore / expire gig |
| GET | `/admin/flags` | ✅ admin | List all gig flag reports |
| PATCH | `/admin/flags/:id` | ✅ admin | Mark flag as reviewed / dismissed |
| GET | `/admin/messages/inbox` | ✅ admin | Admin's own inbox |
| GET | `/admin/messages/sent` | ✅ admin | Admin's own sent messages |
| POST | `/admin/messages` | ✅ admin | Send direct message to a user |
| GET | `/admin/regions` | ✅ admin | List regions |
| POST | `/admin/regions` | ✅ admin | Add region |
| GET | `/admin/cities` | ✅ admin | List cities |
| POST | `/admin/cities` | ✅ admin | Add city |

---

## 11. UI/UX Screens & Flows

### 11.1 Screen Inventory

**User-facing app**

| Screen | Route | Access |
|--------|-------|--------|
| Board (gig list) | `/` | All |
| Gig Detail | `/gigs/:id` | All (visibility rules) |
| Register | `/register` | Unauthenticated |
| Login | `/login` | Unauthenticated |
| Verify Email | `/verify/email` | Auth unverified |
| Verify Phone | `/verify/phone` | Auth unverified |
| Post Gig | `/gigs/new` | Auth verified |
| Edit Gig | `/gigs/:id/edit` | Owner |
| My Gigs | `/my-gigs` | Auth |
| My Applications | `/my-applications` | Auth |
| Inbox | `/inbox` | Auth |
| Sent | `/sent` | Auth |
| Message Thread | `/messages/:id` | Auth (party) |
| My Profile (edit) | `/profile/me` | Auth |
| User Profile (view) | `/profile/:id` | Auth verified |
| Handshake Detail | `/handshakes/:id` | Party |
| 404 | `*` | All |

**Admin app** (separate deployment)

| Screen | Route | Access |
|--------|-------|--------|
| Dashboard | `/` | Admin |
| User List | `/users` | Admin |
| User Detail | `/users/:id` | Admin |
| All Gigs | `/gigs` | Admin |
| Gig Detail (full) | `/gigs/:id` | Admin |
| Flag Reports | `/flags` | Admin |
| Admin Inbox | `/inbox` | Admin |
| Admin Sent | `/sent` | Admin |
| Regions & Cities | `/taxonomy` | Admin |

### 11.2 Board Card (Gig Preview)

```
┌──────────────────────────────────┐
│ [preview image]                  │
│                                  │
│ Short description (≤160 chars)   │
│ Region · Price indicator         │
│ Posted N hours ago               │
└──────────────────────────────────┘
```

Price indicator rules:
- Fixed: `₾ 120`
- Range: `₾ 80 – 200`
- Negotiable: `💬 Negotiable`

### 11.3 Gig Detail Page

```
┌─────────────────────────────────────────────────────┐
│ [Image gallery]                                      │
│ Short description                                    │
│ ─────────────────────────────────────────────────── │
│ Long description                                     │
│ ─────────────────────────────────────────────────── │
│ 💰 Price: ₾ 150 (visible) / [Request price info]   │
│ 📍 Region: Tbilisi                                   │
│ 🏙  City: [Visible / Request city info]              │
│ 📅 Available: Jun 1 – Jun 15                         │
│ 📞 Contact: [Request contact info]                   │
│                                                      │
│              [APPLY FOR THIS GIG]                    │
└─────────────────────────────────────────────────────┘
```

### 11.4 Post Gig Form

Fields rendered in sections with visibility toggles:

```
Section 1 — Always visible
  [Short description *]      Max 160 chars
  [Long description *]       Markdown editor

Section 2 — Images
  [Upload images]            Max 10; toggle: 👁 Visible / 🔒 Request

Section 3 — Compensation  ⚡ "Make this visible to get hired faster!"
  ◉ Fixed price  ₾ [___]       toggle: 👁 Visible / 🔒 Request
  ○ Price range  ₾ [___] to ₾ [___]  toggle: 👁 Visible / 🔒 Request
  ○ Negotiable   💬 "Discuss in person"  (always visible — no toggle)

Section 4 — Location
  [Region *]   (always visible)
  [City]       Toggle: 👁 Visible / 🔒 Request
  [Address]    Toggle: 👁 Visible / 🔒 Request

Section 5 — Availability
  From [date picker]
  To   [date picker]
  Toggle: 👁 Visible / 🔒 Request

  Expires on [date picker *]  (max 30 days from today; required)

Section 6 — Contact info   🔒 "We recommend keeping contact info hidden"
  Pulled from your profile
  Toggle: 👁 Visible / 🔒 Request (default: Request)

[Preview] [Post Gig]
```

### 11.5 Apply for Gig Form

```
┌─────────────────────────────────────────────────────┐
│ Applying for: "Need help moving boxes"               │
│                                                      │
│ Cover message (optional)                             │
│ [____________________________________]               │
│                                                      │
│ Attachments (optional — max 5, 10 MB each)           │
│ [+ Add portfolio image or document (PDF/JPG/PNG)]    │
│                                                      │
│              [SEND APPLICATION]                      │
└─────────────────────────────────────────────────────┘
```

### 11.6 Notification / Inbox Item

```
┌─────────────────────────────────────────────────────┐
│ 👤 Giorgi G. applied for "Need help moving boxes"   │
│ 2 minutes ago                         [SEE APPLICATION] │
└─────────────────────────────────────────────────────┘
```

[SEE APPLICATION] → `/profile/{applicantId}`

### 11.7 Inbox & Sent Tabs

```
Account Page
  ┌─────────────────┐
  │  [Inbox] [Sent] │
  └─────────────────┘
  Inbox:
  ┌──────────────────────────────────────────────────┐
  │ 🔔 Giorgi G. applied for "Moving help"  2m ago  │
  │ 💬 Admin: "Your account has been noted"  1d ago  │
  └──────────────────────────────────────────────────┘
  Sent:
  ┌──────────────────────────────────────────────────┐
  │ → To: Admin — "I'd like to appeal..."   3d ago   │
  └──────────────────────────────────────────────────┘
```

---

## 12. Tech-Stack Proposal

> This is a recommendation, not a constraint. The team can revise before development starts.

### 12.1 Frontend

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | **Next.js 14** (App Router) | SSR for board SEO; PWA support |
| Language | TypeScript | Type safety |
| Styling | Tailwind CSS | Fast mobile-first UI |
| State / data | TanStack Query | Server state, caching |
| Forms | React Hook Form + Zod | Validation mirrors server schema |
| Maps / Geolocation | Browser Geolocation API + Nominatim | Pre-fill region/city; free tier |
| Internationalisation | next-intl | **English only in v1**; architecture supports adding Georgian (ka) and other locales in v2 without structural changes |

> **Admin app:** Separate Next.js application sharing the same component library and design tokens.  Deployed to a separate domain (e.g., `admin.gigs.ge`).

### 12.2 Backend

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Runtime | **Node.js 20 LTS** | |
| Framework | **Fastify** | Fast, low overhead, good plugin ecosystem |
| Language | TypeScript | |
| ORM | **Drizzle ORM** | Type-safe SQL; migrations built-in |
| Database | **PostgreSQL 16** | JSONB for flexible payloads, solid ACID |
| Auth | JWT (access) + httpOnly cookie (refresh) | |
| File storage | **Cloudflare R2** (or S3-compatible) | Low egress cost |
| Email | **Resend** (or AWS SES) | |
| SMS / OTP | **Stubbed for v1 PoC** — code logged server-side / returned in dev API response; real provider (Twilio Verify or local Georgian carrier) wired before production | |
| Queue | **BullMQ** (Redis-backed) | Async notification & message dispatch |

### 12.3 Infrastructure

| Component | Choice |
|-----------|--------|
| Hosting | Railway or Render (v1); VPS/Hetzner for cost control |
| CDN | Cloudflare |
| DNS | Cloudflare DNS (`gigs.ge`) |
| SSL | Automatic via Cloudflare |
| CI/CD | GitHub Actions |

---

## 13. Infrastructure & Deployment

### 13.1 Environments

| Env | Purpose | Domain |
|-----|---------|--------|
| `development` | Local dev | `localhost:3000` |
| `staging` | PR previews / QA | `staging.gigs.ge` |
| `production` | Live | `gigs.ge` |

### 13.2 CI/CD Pipeline

```
Push / PR
  └─► lint + type-check
  └─► unit tests
  └─► build
  └─► (on merge to main) deploy to staging
  └─► (manual promote) deploy to production
```

### 13.3 Database Migrations

- Drizzle Kit for schema migrations; migrations committed to repo.
- Seed script for regions & cities taxonomy.

### 13.4 Monitoring

- Error tracking: **Sentry**
- Uptime: **Better Uptime** (free tier)
- Logs: structured JSON → cloud log aggregator (Logtail / Papertrail)

---

## 14. Security Considerations

| # | Concern | Mitigation |
|---|---------|-----------|
| S1 | Authentication | Short-lived JWT (15 min); httpOnly refresh cookie; refresh token rotation |
| S2 | Password storage | bcrypt (cost factor ≥ 12) |
| S3 | OTP brute force | Max 5 attempts; 15 min expiry; rate-limit resend |
| S4 | Age restriction bypass | Server-side DOB validation on every relevant action |
| S5 | PII exposure | Visibility layer enforced server-side (never trust client) |
| S6 | File upload | Type validation (MIME + magic bytes); max size 10 MB; store on R2 (not public web root) |
| S7 | CORS | Strict origin allowlist |
| S8 | SQL injection | Parameterised queries via ORM |
| S9 | XSS | Escape all user content; CSP headers |
| S10 | CSRF | SameSite=Strict cookie; CSRF token for state-changing endpoints |
| S11 | Rate limiting | Per-IP and per-user limits on auth and OTP endpoints (Fastify rate-limit plugin) |
| S12 | Admin access | Role checked server-side; IP allowlist optional for admin routes |
| S13 | Phone number enumeration | Same error message for "phone already registered" to avoid enumeration |
| S14 | Image EXIF stripping | Strip GPS/personal EXIF data on upload |

---

## 15. Decisions Log & Next Steps

### 15.1 Resolved Decisions

All original open questions have been answered.  The table below is the canonical record.

| # | Question | Decision |
|---|----------|----------|
| OQ-1 | Gig expiry / retention policy? | Poster-defined; **max 30 days** from creation. `expires_at` is required. System auto-expires at TTL. |
| OQ-2 | Applicants attach portfolio files? | **Yes.** Max 5 files (PDF/JPG/PNG), 10 MB each, per application. |
| OQ-3 | Language — Georgian + English from day 1? | **v1 English only.** Architecture is i18n-ready (next-intl); Georgian (ka) added in v2. |
| OQ-4 | Flagging mechanism? | **Yes.** Flag reports are routed to **Admin Inbox**. All users have **Inbox** and **Sent** folders. Admin can message users; users can message admin. |
| OQ-5 | Admin panel — embedded or separate app? | **Separate app** (separate Next.js deployment at `admin.gigs.ge`), structurally identical to user app, adds user list and moderation screens. |
| OQ-5.1 | What can admin see / do on a user account? | Admin sees same profile view the user sees. **Admin cannot access user Inbox, Sent, or any messages.** Admin can: restrict, block, delete any PII field, mark for deletion (auto-deletes 1 year after last login). |
| OQ-6 | SMS provider? | **Stubbed for PoC v1** — OTP code returned in API response (dev) or logged server-side. Real provider integrated before production. |
| OQ-7 | MVP timeline? | **1 week.** |
| OQ-8 | Native mobile app? | **No.** PWA only. Native app deferred indefinitely. |
| OQ-9 | Privacy Policy / Terms of Service? | **Future deliverable.** Skip for v1. |
| OQ-10 | "Negotiated at site" price — configurable visibility? | **No.** Always public, hardcoded. Visibility toggle shown only for fixed price and price-range options. |

### 15.2 Immediate Next Steps (1-week sprint)

| Day | Deliverable |
|-----|-------------|
| 1 | Monorepo scaffold (`apps/web`, `apps/admin`, `apps/api`); Drizzle schema + first migration; seed regions/cities |
| 1–2 | Auth slice: register, email OTC verify, phone OTP stub, login, refresh, logout |
| 2–3 | Gigs board: list (public, limited view) + gig detail (visibility rules) |
| 3–4 | Post Gig form + expiry date picker; gig management (edit / close) |
| 4–5 | Applications: apply (with attachment upload), accept/decline, handshake |
| 5–6 | Inbox + Sent; direct messaging; flag-gig → admin inbox |
| 6–7 | Admin app: user list, user detail, gig list, flag review, messaging |
| 7 | End-to-end smoke test; deploy to staging |

### 15.3 Future Deliverables (v2+)

- Privacy Policy and Terms of Service pages
- Georgian language (ka) localisation
- Real SMS provider integration (Twilio or Georgian carrier)
- Push notifications (PWA service worker)
- Rating / review system
- Real-time messaging (WebSockets or SSE)
- Native mobile app (React Native / Flutter)
- Payment / escrow integration

---

*Last updated: 2026-03-29 — draft v0.2*
