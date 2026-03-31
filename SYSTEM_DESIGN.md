# gigs.ge — System Design Document

> **Status:** Draft v0.5 — All open questions resolved. Complete business logic for Gigs, Contracts, Disputes, Billing, and Reviews.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [User Roles & Access Levels](#2-user-roles--access-levels)
3. [Feature Requirements](#3-feature-requirements)
4. [Registration & Verification Flow](#4-registration--verification-flow)
5. [Gig Lifecycle](#5-gig-lifecycle)
6. [Application Flow](#6-application-flow)
7. [Contract Lifecycle](#7-contract-lifecycle)
8. [Dispute Resolution](#8-dispute-resolution)
9. [Invoicing & Fees](#9-invoicing--fees)
10. [Reviews & Ratings](#10-reviews--ratings)
11. [Visibility & Privacy Model](#11-visibility--privacy-model)
12. [Notifications, Inbox & Messaging](#12-notifications-inbox--messaging)
13. [User Profile](#13-user-profile)
14. [Data Models](#14-data-models)
15. [API Design](#15-api-design)
16. [UI/UX Screens & Flows](#16-uiux-screens--flows)
17. [Tech-Stack Proposal](#17-tech-stack-proposal)
18. [Infrastructure & Deployment](#18-infrastructure--deployment)
19. [Security Considerations](#19-security-considerations)
20. [Decisions Log](#20-decisions-log)

---

## 1. Project Overview

**gigs.ge** is a minimalistic, mobile-first gig-board for Georgia where people can post short-term jobs ("gigs") or apply for them. The platform charges trust-based fees on completed work and provides structured dispute resolution.

### Goals

| # | Goal |
|---|------|
| G1 | Let anyone browse available gigs without registering |
| G2 | Protect personal contact info until both parties trust each other |
| G3 | Keep the posting flow fast (< 2 min from idea to live gig) |
| G4 | Support Georgian regions / cities out of the box |
| G5 | Mobile-first; progressive web app (PWA) is sufficient for v1 |
| G6 | Trust-based fee model: 3% poster / 2% worker on completed contracts |

### Non-Goals (v1)

- Payment processing / escrow
- Real-time chat (async in-app messaging only)
- Company / business accounts
- Native mobile app — PWA only
- Privacy Policy and Terms of Service pages (future)
- Digital signatures (scaffolding only; implementation future)
- LLM-powered review analyzer (scaffolding only)

---

## 2. User Roles & Access Levels

```
Visitor (unauthenticated)
  └─ can: browse board (limited view)

User (authenticated)
  ├─ Unverified  → same board view as visitor
  └─ Verified    → full board view, post, apply, contracts

Admin
  └─ full access + moderation + arbiter tools
```

A **user** becomes _verified_ only after both email **and** phone are confirmed via OTP/OTC.

---

## 3. Feature Requirements

### 3.1 Unauthenticated Visitors

| # | Capability | Notes |
|---|-----------|-------|
| UV-1 | View live job board | Paginated / infinite-scroll list |
| UV-2 | See per-listing preview | Short description, preview image(s), price/range, region |
| UV-3 | Register | See §4 |
| UV-4 | Log in | Email + password or phone + OTP |

**Hidden from visitors:** Contact info, full address, full name, long description, full image gallery, application button.

### 3.2 Authenticated but Unverified Users

- Same board view as visitors.
- Can view and edit own profile.
- **Cannot** post a gig or apply.
- Prompted to complete verification on every restricted action.

### 3.3 Authenticated & Verified Users

| # | Capability |
|---|-----------|
| AV-1 | View full job listing (governed by poster's visibility settings) |
| AV-2 | Post a gig |
| AV-3 | Apply for a gig |
| AV-4 | Manage own gigs (edit, shelve, archive) |
| AV-5 | Accept/reject applications |
| AV-6 | Create, negotiate, and sign contracts |
| AV-7 | Mark contracts as "Job Complete" or "Job Not Done" |
| AV-8 | Submit disputes and evidence for arbiter review |
| AV-9 | Leave reviews (1–5 stars) after contract completion |
| AV-10 | Receive and view monthly invoices |
| AV-11 | Inbox, Sent & notifications |
| AV-12 | Message any other user |
| AV-13 | Flag a gig |

### 3.4 Admin

| # | Capability |
|---|-----------|
| AD-1 | View all users, gigs, contracts, and flags |
| AD-2 | Restrict / block / suspend users |
| AD-3 | Delete specific PII |
| AD-4 | Mark account for deletion (auto-deletes 1 year after last access) |
| AD-5 | Hide / restore gigs |
| AD-6 | Act as Arbiter on disputes |
| AD-7 | Manage region / city taxonomy |
| AD-8 | Admin Inbox (flags, direct messaging) |
| AD-9 | Manually mark invoices as paid |
| AD-10 | Configure "Secured Gigs" section visibility |

---

## 4. Registration & Verification Flow

### 4.1 Required Registration Fields

| Field | Validation |
|-------|-----------|
| Email | Valid RFC-5322; unique |
| Mobile number | E.164 format; unique; Georgia (+995) default |
| Date of Birth | Must be ≥ 18 years old |

### 4.2 Optional Registration Fields

| Field | Notes |
|-------|-------|
| First Name | |
| Last Name | |
| WhatsApp number | Defaults to mobile if not set |
| Telegram handle | `@username` or phone |
| Signal number | Phone-based |
| Country | Pre-filled: Georgia (GE) |
| Region | Pre-selected via Geolocation API |
| City | Pre-selected via Geolocation API |
| Street Address | Free-text |

### 4.3 Verification Steps

```
Register ──► Send verification email (link + 6-digit OTC)
         └─► Send verification SMS  (6-digit OTP)

email_verified AND phone_verified ──► user status = VERIFIED
```

- OTP/OTC expires after **15 minutes**.
- Resend allowed after **60 seconds** (rate-limited).
- Max **5 attempts** per code before new code required.

> **v1 PoC:** SMS delivery is stubbed — OTP returned in API response (dev mode).

### 4.4 Age Restriction

- Server-side enforcement: reject DOB yielding age < 18.
- Date stored as `YYYY-MM-DD`; re-checked server-side on every relevant action.

---

## 5. Gig Lifecycle

### 5.1 Gig Statuses

| Status | Meaning |
|--------|---------|
| `DRAFT` | Created but not published |
| `ACTIVE` | Live on the board, accepting applications |
| `SHELF` | Hidden from board; poster can re-activate later |
| `EXPIRED` | `expires_at` reached; auto-moves to shelf if active contracts exist |
| `ARCHIVED` | Poster archived manually (no active contracts remain) |
| `CANCELLED` | Poster cancelled |

### 5.2 Status Transitions

```
DRAFT ──► ACTIVE (poster publishes)
ACTIVE ──► SHELF (poster shelves, or expires_at reached with active contracts)
ACTIVE ──► EXPIRED (expires_at reached, no active contracts)
ACTIVE ──► CANCELLED (poster cancels)
SHELF ──► ACTIVE (poster re-activates)
SHELF ──► ARCHIVED (poster archives; requires no in-progress/active contracts)
```

### 5.3 Expiry Policy

- Poster **must** set an expiry date when creating a gig.
- Maximum allowed: **30 days** from creation.
- On expiry: if active contracts exist → status moves to `SHELF`; if none → `EXPIRED`.
- Pending applications are **closed** when gig leaves `ACTIVE`.
- Poster receives `GIG_EXPIRED` notification.

### 5.4 Gig Creation

User clicks "Create Gig" → redirected to gig creation page. Gig is created as `DRAFT` with placeholder name "New Gig." User fills in all fields per §5.5 and publishes.

### 5.5 Gig Fields & Default Visibility

| Field | Always Visible | Default | Configurable? | Notes |
|-------|---------------|---------|---------------|-------|
| Short description | ✅ | visible | ❌ | Max 160 chars; board card preview; serves as gig "name" |
| Long description | ✅ | visible | ❌ | Markdown or plain text |
| Images | — | visible | ✅ | Max 10; thumbnail on board |
| Price — fixed or range | — | visible | ✅ | UI nudge to keep visible |
| Price — negotiable | ✅ | visible | ❌ | Always public, hardcoded |
| Available dates (from / to) | — | visible | ✅ | Full datetime (date + time) |
| Region | ✅ | visible | ❌ | Always shown on board card |
| City | — | hidden | ✅ | |
| Street address | — | hidden | ✅ | |
| Contact info | — | requestable | ✅ | UI discourages making visible upfront |
| Expiry date | — | visible | ❌ | Shown as "Available until" |

### 5.6 Price / Compensation Options

| Option | UI Label | Visibility |
|--------|----------|-----------|
| Fixed price | "Fixed: ₾ ___" | Configurable (visible by default) |
| Price range | "Between ₾ ___ and ₾ ___" | Configurable (visible by default) |
| Negotiable | "💬 Negotiable — discuss in person" | Always visible; hardcoded |

### 5.7 "My Gigs" Dashboard

Users with gigs see a filter chip "My Gigs" on the main page. Clicking it shows two tabs:

| Tab | Contents |
|-----|----------|
| **My Jobs** (I'm hiring) | Gigs I posted — all statuses. Sub-filters: Draft, Active, Shelf, Archived |
| **My Work** (I'm working) | All gigs I have applied to or have contracts for |

**My Work** lists each gig with an informative **status label** derived from the application/contract state:

| Label | Condition |
|-------|-----------|
| Application Pending | Application status = `PENDING` |
| Application Rejected | Application status = `REJECTED` |
| Application Closed | Application status = `CLOSED` |
| Contract Draft | Contract status = `DRAFT` |
| Contract Signed | Contract status = `IN_PROGRESS` |
| Work Completed | Contract status = `COMPLETED` |
| Disputed | Contract status = `DISPUTED` or `ARBITRATION` |
| Cancelled | Contract status = `CANCELLED` |
| Quit | Contract status = `QUIT` |

A **dropdown filter** lets users narrow the list to a specific status.

### 5.8 Gig Page — Universal Template

One shared layout component with mode-driven rendering:

| Route | Mode | Viewer |
|-------|------|--------|
| `/gigs/new` | Create | Poster (empty form, all fields editable) |
| `/gigs/:id/edit` | Edit | Poster (pre-populated, editable fields) |
| `/gigs/:id` | View | Adapts: poster sees management tools + contract list + applicant list; applicant/visitor sees visibility-gated fields + "Apply" button |

Contracts have a separate page: `/contracts/:id`.

---

## 6. Application Flow

### 6.1 Applying

```
Worker clicks [APPLY] on gig detail page
  └─► Application form opens:
      - Brief gig info (short desc, payment, dates)
      - Text box: "Add a message to {poster name}..."
      - Attachments: optional, max 5 files, 10 MB each (PDF/JPG/PNG)
  └─► Worker clicks "Apply"
  └─► Application record created (status: PENDING)
  └─► Poster receives APPLICATION_RECEIVED notification
```

### 6.2 Application Statuses

| Status | Meaning |
|--------|---------|
| `PENDING` | Waiting for poster decision |
| `ACCEPTED` | Poster accepted; contract creation begins |
| `REJECTED` | Poster declined |
| `CLOSED` | Gig moved off ACTIVE (shelved/expired); auto-closed |
| `WITHDRAWN` | Applicant withdrew |

### 6.3 Application Rules

- `UNIQUE(gig_id, applicant_id)` — one application per worker per gig.
- Workers receive notification **only** for `ACCEPTED` status.
- Workers receive **no notification** for `REJECTED` or `CLOSED`.
- If a worker views a gig they already applied to, the Apply button is replaced with: *"You've already applied for this job."*
- When a gig leaves `ACTIVE`, all `PENDING` applications transition to `CLOSED`.
- The poster can leave other applications `PENDING` or reject them individually after accepting one.
- **On contract cancellation / quit:** the associated application status is set to `REJECTED`. Because of the UNIQUE constraint, **re-application to the same gig is not allowed**. The worker may still apply to other gigs by the same poster.

---

## 7. Contract Lifecycle

### 7.1 Contract Creation

When the poster accepts an application:
1. Application status → `ACCEPTED`.
2. Worker is notified.
3. Poster is shown the applicant's profile with a hovering pane containing:
   - Worker's application message.
   - Action buttons (see §7.2).

### 7.2 Contact Sharing & Negotiation

| Gig Price Type | Button Label | What Happens |
|----------------|-------------|--------------|
| Fixed / Range | "Share Contact Info" | All non-private contact fields shared between both parties; contract draft created with price from gig |
| Negotiable | "Share Contact Info and Start Negotiation" | Same contact sharing; contract draft created with price blank (required before signing) |

When starting negotiation on a negotiable gig, the poster is prompted:
- **Keep gig open** (ACTIVE) for other applicants, OR
- **Shelve the gig** (move to SHELF)

### 7.3 Contract Draft

A contract is auto-generated from the gig data:
- Gig short description, long description
- Agreed price (copied from gig if fixed/range; blank if negotiable)
- Agreed start datetime (defaulted from gig `available_from`) — **required**
- Due datetime (defaulted from gig `available_to`)
- All gig visibility and field data

**Editing rules:**
- **Poster** creates and edits the draft (can update price, dates, description).
- **Worker** can only **accept** or **reject** the draft (no edit capability).
- `agreed_start_at` is **required** and **editable before signing** but **immutable after signing**. A new start datetime can only be introduced via a Resolution Appendix during a dispute (§8.3).

**Price rules:**
- If gig has a fixed/range price → transferred to contract → poster can edit it.
- If gig is negotiable → price field is blank → **contract cannot be signed until a price is set**.

### 7.4 Contract Signing

Both parties must click "Confirm & Sign":
- `poster_signed_at` TIMESTAMPTZ
- `worker_signed_at` TIMESTAMPTZ

Contract becomes `SIGNED` → immediately transitions to `IN_PROGRESS` when both have signed.

> **Future:** Digital signature integration. v1 scaffolding stores the signing timestamps and user IDs.

### 7.5 Contract Statuses

| Status | Meaning |
|--------|---------|
| `DRAFT` | Created, awaiting edits and signatures |
| `SIGNED` | Both parties signed (transitional — immediately becomes IN_PROGRESS) |
| `IN_PROGRESS` | Work is underway |
| `PENDING_COMPLETION` | One party marked "Job Complete"; waiting on the other |
| `COMPLETED` | Both parties confirmed or 48h auto-complete; fees apply |
| `DISPUTED` | Poster marked "Job Not Done" |
| `ARBITRATION` | Submitted to gigs.ge arbiter |
| `AUTO_RESOLVED` | Dispute auto-resolved after 7 days with no arbiter submission; fees for both |
| `CANCELLED` | Mutual cancel or arbiter dismissal |
| `QUIT` | Worker quit the contract |

### 7.6 Contract State Machine

```
DRAFT
  ├── Worker rejects ──► poster revises & re-sends (unlimited), or rejects application (see §7.7)
  └── Both sign ──► IN_PROGRESS

IN_PROGRESS
  ├── Mutual cancel within 24h of signing ──► CANCELLED (no fee, tracked)
  │
  ├── Worker: "Job Complete" ──► PENDING_COMPLETION
  │     (available: no earlier than halfway through total job duration — see §7.10)
  │
  ├── Poster: "Job Not Done" ──► DISPUTED
  │     (available: no earlier than halfway through total job duration — see §7.10)
  │
  ├── Worker: "Quit Job" ──► (see §7.8)
  │
  └── Both silent past due ──► reminders at +24h, +72h, +7d; auto-complete at +14d (see §7.11)

PENDING_COMPLETION
  ├── Poster: "Job Complete" ──► COMPLETED (fees apply, reviews unlocked)
  ├── Poster silent 48h ──► COMPLETED (auto-complete, fees apply)
  └── Poster: "Job Not Done" ──► DISPUTED

DISPUTED ──► see §8 Dispute Resolution

COMPLETED ──► FINAL (immutable)
CANCELLED ──► FINAL (immutable)
```

### 7.7 Worker Rejects Contract Draft

When the worker rejects a contract draft:
1. Contract record is deleted (or marked `REJECTED`).
2. The poster is notified and can **revise the draft and re-send** as many times as they want.
3. At any point, the poster can **reject the application** entirely, ending negotiation and moving the application to `REJECTED`.
4. Worker may include an optional **rejection reason** (free text), visible **only to the poster**.

No limit on revision rounds — the poster controls when to give up.

### 7.8 Worker Quits

| Timing | Fee | Consequences |
|--------|-----|-------------|
| Within 24h of signing | No fee | Same as mutual cancel; poster can leave negative review |
| After 24h of signing | Worker pays 2% fee on agreed price | Tracked on record; poster can leave negative review |

Contract status → `QUIT`.

### 7.9 Limits

- Maximum **100 contracts** per gig.
- A gig on `SHELF` with no in-progress or active contracts can be **archived** by the poster.

### 7.10 Half-Time Rule ("Complete" / "Not Done" Availability)

Neither party can mark a contract as "Job Complete" or "Job Not Done" until **at least half the total job duration** has elapsed from the agreed start datetime.

**Formula:** `earliest_action_at = agreed_start_at + (due_at − agreed_start_at) / 2`

**Example:** Start = 2027-01-01 12:00, Due = 2027-01-02 20:00 (32h total).
→ Half = 16h → earliest action at 2027-01-02 04:00.

Both "Job Complete" (worker) and "Job Not Done" (poster) buttons are disabled until `now() >= earliest_action_at`.

### 7.11 Both Parties Silent Past Due Date

If a signed contract passes its `due_at` and neither party takes action:

| Offset from `due_at` | Event |
|----------------------|-------|
| +24h | System sends reminder notification to both parties |
| +72h | Second reminder to both parties |
| +7 days | Third and final reminder to both parties |
| +14 days | Contract **auto-completes** with standard fees (3% poster / 2% worker) |

Auto-complete status: `COMPLETED`. Reviews can still be submitted within 14 days of completion.

---

## 8. Dispute Resolution

### 8.1 Trigger

Poster marks "Job Not Done" on an `IN_PROGRESS` or `PENDING_COMPLETION` contract. Contract status → `DISPUTED`.

### 8.2 Timeline

| Offset | Event |
|--------|-------|
| 0h | Dispute created. Both parties notified. |
| 0–24h | Communication window. Poster can propose a **Resolution Appendix**. |
| 24h | "Submit to Arbiter" button unlocks for both parties. |
| 5 days | Reminder notification sent to both parties. |
| 7 days | If neither party submits to Arbiter: **auto-resolved** → `AUTO_RESOLVED` with fees for both. |

### 8.3 Resolution Appendix

During a dispute, the poster can propose updated terms:
- New task description or corrective actions
- Additional compensation (if any)
- Updated due date
- New start datetime (if needed)

**Rules:**
- Worker must **accept** the appendix for the contract to return to `IN_PROGRESS`.
- Worker can **reject** the appendix. Contract stays `DISPUTED`.
- Worker can **ignore** the appendix and escalate to Arbiter.
- Maximum **3 appendices** per contract. After 3 rejected/ignored: "Submit to Arbiter" is the only option.

### 8.4 Arbiter (Admin) Resolution

**Either party** can submit to Arbiter once the 24h window has passed. Both parties then submit evidence:
- Description of the issue (required)
- Images, documents, files (max 10)

Admin sees a split view: poster's claim vs. worker's proof.

| Decision | Contract Status | Fee Impact |
|----------|----------------|------------|
| **Favor Poster** | `COMPLETED` | Winning party (poster) pays nothing; losing party (worker) pays their normal 2% |
| **Favor Worker** | `COMPLETED` | Winning party (worker) pays nothing; losing party (poster) pays their normal 3% |
| **Dismiss Both** | `CANCELLED` | No fees for either party |

### 8.5 Auto-Resolution

If neither party submits to Arbiter within **7 days** of dispute creation:
- Reminder notification sent at day 5.
- Contract auto-resolves → `AUTO_RESOLVED` with **fees incurred for both parties** (standard 3%/2%).
- `AUTO_RESOLVED` is a terminal status, treated the same as `COMPLETED` for billing and review purposes.

### 8.6 Finality Lock

Once a contract reaches `COMPLETED`, `AUTO_RESOLVED`, `CANCELLED`, or `QUIT`, the record is **immutable**. No further status changes.

---

## 9. Invoicing & Fees

### 9.1 Fee Structure

gigs.ge takes a **5% total fee** on every completed contract.

| Party | Share | When Shown |
|-------|-------|-----------|
| **Poster** | 3% of agreed_price | As estimate next to price field during gig creation; finalized at completion |
| **Worker** | 2% of agreed_price | As estimate during application and contract review; finalized at completion |

### 9.2 When Fees Apply

| Scenario | Poster Fee | Worker Fee |
|----------|-----------|------------|
| Both mark "Job Complete" | 3% | 2% |
| Auto-complete (48h silence after one marks done) | 3% | 2% |
| Auto-complete (14 days past due, both silent) | 3% | 2% |
| Auto-resolve dispute (7 days, no arbiter submission) | 3% | 2% |
| Arbiter favors poster | 0% | 2% |
| Arbiter favors worker | 3% | 0% |
| Arbiter dismisses both | 0% | 0% |
| Mutual cancel within 24h | 0% | 0% |
| Worker quits within 24h | 0% | 0% |
| Worker quits after 24h | 0% | 2% |

### 9.3 Billing Ledger

Every fee-triggering event creates ledger entries:
- `poster_fee`: 3% of `agreed_price` (if applicable)
- `worker_fee`: 2% of `agreed_price` (if applicable)

Ledger statuses: `pending` → `invoiced` → `paid`

### 9.4 Monthly Billing Cycle

- **Schedule:** 1st of each month at 00:00 UTC (BullMQ repeatable job).
- **Process:**
  1. Query all `pending` ledger entries (including carry-overs).
  2. Sum per user.
  3. If total ≥ 1.00 GEL → generate invoice, mark entries as `invoiced`.
  4. If total < 1.00 GEL → mark as `carry_over`, skip invoice.

### 9.5 Carry-Over Rule

Fees below **1.00 GEL** are not invoiced. They carry over to the next month's cycle.

### 9.6 Invoice Content

- Invoice number (sequential per user)
- Billing period (month/year)
- Line items: each contract with gig title, agreed price, fee %, fee amount
- Total due
- Footer: QR codes for gigs.ge bank accounts (format TBD)

### 9.7 Invoice Delivery

- PDF stored in Cloudflare R2.
- Notification sent to user Inbox (`INVOICE_GENERATED`).
- Optional email delivery.

### 9.8 Invoice Payment

- **v1:** Admin manually marks invoices as paid after verifying bank statements.
- **v2:** OpenAPI bank integration auto-matches transactions to users.

### 9.9 User Restrictions

- Unpaid invoices older than **30 days** → blocked from posting and applying.
- **2+ arbiter-fault decisions** → blocked from posting and applying.

---

## 10. Reviews & Ratings

- **Scale:** 1–5 stars + optional text comment.
- **Bidirectional:** Both poster and worker can review each other.
- **Trigger:** Review is submitted as part of the "Job Complete" action.
- **Status:** Reviews are held in `PENDING` until both parties confirm completion (or auto-complete fires).
- **Time limit:** Reviews must be submitted within **14 days** of contract completion.
- **Immutable:** Users **cannot** edit or delete their published reviews.
- **Analyzer (Future):** LLM-based profanity/validity check. v1 uses manual report-based moderation.

---

## 11. Visibility & Privacy Model

### 11.1 Visibility Levels

| Level | Who can see |
|-------|-------------|
| `PUBLIC` | Anyone (visitor, user, admin) |
| `AUTHENTICATED` | Logged-in users only |
| `VERIFIED` | Verified users only |
| `ON_REQUEST` | Visible only after an explicit request is granted |
| `POST_CONTRACT` | Visible only while contract is in an active state (not terminal) |
| `PRIVATE` | Owner + admin only |

### 11.2 Default Visibility Matrix

| Data Point | Visitor | Auth Unverified | Auth Verified | Post-Contract |
|-----------|---------|-----------------|--------------|---------------|
| Short description | ✅ | ✅ | ✅ | ✅ |
| Long description | ❌ | ❌ | ✅ | ✅ |
| Images (preview) | ✅ | ✅ | ✅ | ✅ |
| Images (full gallery) | ❌ | ❌ | ✅* | ✅ |
| Price | ✅ | ✅ | ✅* | ✅ |
| Region | ✅ | ✅ | ✅ | ✅ |
| City | ❌ | ❌ | ✅* | ✅ |
| Full address | ❌ | ❌ | on-request* | ✅ |
| Poster name | ❌ | ❌ | on-request* | ✅ |
| Contact info | ❌ | ❌ | on-request* | ✅ (active contracts only) |

\* Poster can change default via per-field toggle.

### 11.3 Contact Info Sharing

When a contract is created, **all non-private contact fields** from both parties' profiles are shared. This includes phone, WhatsApp, Telegram, and Signal (if set).

**Contact info is temporary** — it is visible **only while the contract is active** (statuses: `DRAFT`, `IN_PROGRESS`, `PENDING_COMPLETION`, `DISPUTED`, `ARBITRATION`). Contact info is **hidden** when the contract reaches a terminal state (`COMPLETED`, `AUTO_RESOLVED`, `CANCELLED`, `QUIT`), or when the gig expires and no active contract remains.

If either party noted the info externally, that is their own responsibility — the platform cannot control offline data retention.

---

## 12. Notifications, Inbox & Messaging

### 12.1 Notification Types

| Type | Trigger | Recipient |
|------|---------|-----------|
| `APPLICATION_RECEIVED` | Worker applies | Poster |
| `APPLICATION_ACCEPTED` | Poster accepts | Worker |
| `CONTRACT_DRAFT_READY` | Contract draft created | Worker |
| `CONTRACT_SIGNED` | Both parties signed | Both |
| `JOB_COMPLETE_PENDING` | One party marks complete | Other party |
| `CONTRACT_COMPLETED` | Contract completed | Both |
| `CONTRACT_DISPUTED` | Poster marks "Not Done" | Worker |
| `APPENDIX_PROPOSED` | Poster proposes appendix | Worker |
| `DISPUTE_REMINDER` | Day 5 of 7-day dispute window | Both |
| `DISPUTE_AUTO_RESOLVED` | 7 days passed, no arbiter submission | Both |
| `CONTRACT_OVERDUE_REMINDER` | Due date +24h / +72h / +7d with no action | Both |
| `CONTRACT_AUTO_COMPLETED` | Due date +14d with no action | Both |
| `ARBITER_DECISION` | Admin resolves dispute | Both |
| `INVOICE_GENERATED` | Monthly invoice created | User |
| `GIG_EXPIRED` | Gig expiry reached | Poster |
| `GIG_FLAGGED` | User flags a gig | Admin |
| `NEW_MESSAGE` | Direct message sent | Recipient |
| `WORKER_QUIT` | Worker quits contract | Poster |

### 12.2 Inbox & Sent

Every user has:
- **Inbox:** Notifications (system, read-only) + received direct messages.
- **Sent:** Messages sent by the user.

### 12.3 Direct Messaging

- Verified user → Verified user.
- Admin → any user (warnings, moderation).
- User → Admin (appeals, questions).
- Plain text only in v1.

### 12.4 Admin Privacy Rule

Admin **cannot** access any user's Inbox, Sent, or message content.

---

## 13. User Profile

### 13.1 Profile Fields & Visibility

| Field | Default Visibility | Configurable | Notes |
|-------|--------------------|-------------|-------|
| Avatar | `VERIFIED` | ✅ | |
| First name | `VERIFIED` | ✅ | Always visible to poster who received application |
| Last name | `POST_CONTRACT` | ✅ | |
| Short bio | `PUBLIC` | ❌ | Max 280 chars |
| Region | `VERIFIED` | ✅ | |
| WhatsApp | `ON_REQUEST` | ✅ | |
| Telegram | `ON_REQUEST` | ✅ | |
| Signal | `ON_REQUEST` | ✅ | |
| Email | `PRIVATE` | ❌ | Never shown on profile |
| Phone | `PRIVATE` | ❌ | Never shown on profile |
| DOB | `PRIVATE` | ❌ | Age range shown optionally |
| Star rating | `PUBLIC` | ❌ | Aggregate of all reviews |

---

## 14. Data Models

> All timestamps UTC. All primary keys UUID via `gen_random_uuid()`. All enum-like fields use TEXT.

### 14.1 `users`

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
last_accessed_at        TIMESTAMPTZ
marked_for_deletion_at  TIMESTAMPTZ
created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 14.2 `user_profiles`

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
vis_first_name      TEXT NOT NULL DEFAULT 'verified'
vis_last_name       TEXT NOT NULL DEFAULT 'post_contract'
vis_avatar          TEXT NOT NULL DEFAULT 'verified'
vis_region          TEXT NOT NULL DEFAULT 'verified'
vis_whatsapp        TEXT NOT NULL DEFAULT 'on_request'
vis_telegram        TEXT NOT NULL DEFAULT 'on_request'
vis_signal          TEXT NOT NULL DEFAULT 'on_request'
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 14.3 `gigs`

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
available_from      TIMESTAMPTZ                  -- datetime (not just date)
available_to        TIMESTAMPTZ                  -- datetime (not just date)
status              TEXT NOT NULL DEFAULT 'draft' -- 'draft'|'active'|'shelf'|'expired'|'archived'|'cancelled'
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

### 14.4 `gig_images`

```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
gig_id      UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE
url         TEXT NOT NULL
is_preview  BOOLEAN NOT NULL DEFAULT false
sort_order  INT NOT NULL DEFAULT 0
uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 14.5 `applications`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
gig_id          UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE
applicant_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
status          TEXT NOT NULL DEFAULT 'pending' -- 'pending'|'accepted'|'rejected'|'closed'|'withdrawn'
message         TEXT
rejection_reason TEXT                              -- free text; visible only to poster
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (gig_id, applicant_id)
```

### 14.6 `application_attachments`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE
url             TEXT NOT NULL
filename        TEXT NOT NULL
mime_type       TEXT NOT NULL
size_bytes      INT  NOT NULL
uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 14.7 `contracts`

```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
application_id      UUID NOT NULL REFERENCES applications(id)
gig_id              UUID NOT NULL REFERENCES gigs(id)
poster_id           UUID NOT NULL REFERENCES users(id)
worker_id           UUID NOT NULL REFERENCES users(id)
agreed_price        NUMERIC(10,2)                -- required before signing
agreed_start_at     TIMESTAMPTZ NOT NULL          -- required; datetime; defaulted from gig
due_at              TIMESTAMPTZ                  -- datetime; defaulted from gig
status              TEXT NOT NULL DEFAULT 'draft'
                    -- 'draft'|'in_progress'|'pending_completion'|'completed'
                    -- |'disputed'|'arbitration'|'auto_resolved'|'cancelled'|'quit'
poster_signed_at    TIMESTAMPTZ
worker_signed_at    TIMESTAMPTZ
fee_eligible        BOOLEAN NOT NULL DEFAULT true
completed_at        TIMESTAMPTZ
cancelled_at        TIMESTAMPTZ
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 14.8 `contract_appendices`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
contract_id     UUID NOT NULL REFERENCES contracts(id)
proposed_by     UUID NOT NULL REFERENCES users(id)  -- always the poster
description     TEXT NOT NULL                        -- new terms / corrective actions
additional_compensation NUMERIC(10,2)
new_due_at      TIMESTAMPTZ
new_start_at    TIMESTAMPTZ
status          TEXT NOT NULL DEFAULT 'proposed'     -- 'proposed'|'accepted'|'rejected'
appendix_number INT NOT NULL CHECK (appendix_number BETWEEN 1 AND 3)
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
resolved_at     TIMESTAMPTZ
```

### 14.9 `billing_ledger`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID NOT NULL REFERENCES users(id)
contract_id     UUID NOT NULL REFERENCES contracts(id)
amount          NUMERIC(10,2) NOT NULL
type            TEXT NOT NULL       -- 'poster_fee' | 'worker_fee'
status          TEXT NOT NULL DEFAULT 'pending' -- 'pending'|'invoiced'|'paid'
carry_over      BOOLEAN NOT NULL DEFAULT false
invoice_id      UUID REFERENCES invoices(id)
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 14.10 `invoices`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID NOT NULL REFERENCES users(id)
invoice_number  TEXT NOT NULL UNIQUE
billing_period  TEXT NOT NULL       -- e.g. '2026-03'
total_amount    NUMERIC(10,2) NOT NULL
status          TEXT NOT NULL DEFAULT 'unpaid' -- 'unpaid'|'paid'
pdf_url         TEXT
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
paid_at         TIMESTAMPTZ
marked_paid_by  UUID REFERENCES users(id) -- admin who confirmed payment
```

### 14.11 `reviews`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
contract_id     UUID NOT NULL REFERENCES contracts(id)
reviewer_id     UUID NOT NULL REFERENCES users(id)
target_id       UUID NOT NULL REFERENCES users(id)
rating          INT NOT NULL CHECK (rating >= 1 AND rating <= 5)
comment         TEXT
status          TEXT NOT NULL DEFAULT 'pending' -- 'pending'|'published'|'flagged'|'removed'
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
published_at    TIMESTAMPTZ
UNIQUE (contract_id, reviewer_id)
```

### 14.12 `dispute_evidence`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
contract_id     UUID NOT NULL REFERENCES contracts(id)
user_id         UUID NOT NULL REFERENCES users(id)
description     TEXT NOT NULL
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 14.13 `dispute_evidence_files`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
evidence_id     UUID NOT NULL REFERENCES dispute_evidence(id) ON DELETE CASCADE
url             TEXT NOT NULL
filename        TEXT NOT NULL
mime_type       TEXT NOT NULL
size_bytes      INT NOT NULL
uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 14.14 `notifications`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
recipient_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
type            TEXT NOT NULL
payload         JSONB NOT NULL DEFAULT '{}'
read_at         TIMESTAMPTZ
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 14.15 `messages`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
recipient_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
body            TEXT NOT NULL
read_at         TIMESTAMPTZ
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 14.16 `otp_codes`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
channel         TEXT NOT NULL       -- 'email' | 'sms'
code_hash       TEXT NOT NULL
attempts        INT NOT NULL DEFAULT 0
expires_at      TIMESTAMPTZ NOT NULL
used_at         TIMESTAMPTZ
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### 14.17 `regions` & `cities`

```sql
-- regions
id      SERIAL PRIMARY KEY
name_en TEXT NOT NULL
name_ka TEXT NOT NULL
code    TEXT UNIQUE NOT NULL

-- cities
id        SERIAL PRIMARY KEY
region_id INT NOT NULL REFERENCES regions(id)
name_en   TEXT NOT NULL
name_ka   TEXT NOT NULL
```

### 14.18 `info_requests`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
gig_id          UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE
requester_id    UUID NOT NULL REFERENCES users(id)
field           TEXT NOT NULL
status          TEXT NOT NULL DEFAULT 'pending' -- 'pending'|'granted'|'denied'
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
resolved_at     TIMESTAMPTZ
UNIQUE (gig_id, requester_id, field)
```

### 14.19 `gig_flags`

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
gig_id          UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE
reporter_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
reason          TEXT NOT NULL
status          TEXT NOT NULL DEFAULT 'pending' -- 'pending'|'reviewed'|'dismissed'
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
reviewed_at     TIMESTAMPTZ
reviewed_by     UUID REFERENCES users(id)
UNIQUE (gig_id, reporter_id)
```

---

## 15. API Design

> RESTful JSON API under `/api/v1/`. Auth: JWT access token (15 min) + httpOnly refresh cookie (7 days).

### 15.1 Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Email+password or phone+OTP |
| POST | `/auth/logout` | Revoke refresh token |
| POST | `/auth/refresh` | New access token |
| POST | `/auth/verify/email` | Confirm email OTC |
| POST | `/auth/verify/phone` | Confirm phone OTP |
| POST | `/auth/resend-otp` | Resend OTC/OTP |
| POST | `/auth/forgot-password` | Initiate reset |
| POST | `/auth/reset-password` | Complete reset |

### 15.2 Users / Profiles

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/me` | ✅ | Own account + profile |
| PATCH | `/users/me` | ✅ | Update own account |
| GET | `/users/me/profile` | ✅ | Own profile |
| PUT | `/users/me/profile` | ✅ | Update own profile |
| POST | `/users/me/avatar` | ✅ | Upload avatar |
| GET | `/users/:id/profile` | ✅ verified | View other profile (visibility rules) |

### 15.3 Gigs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/gigs` | ❌ | List active gigs (board view) |
| GET | `/gigs/:id` | ❌ | Single gig (visibility rules) |
| POST | `/gigs` | ✅ verified | Create gig |
| PATCH | `/gigs/:id` | ✅ owner | Update gig |
| POST | `/gigs/:id/publish` | ✅ owner | Publish draft |
| POST | `/gigs/:id/shelve` | ✅ owner | Move to shelf |
| POST | `/gigs/:id/reactivate` | ✅ owner | Re-activate from shelf |
| POST | `/gigs/:id/archive` | ✅ owner | Archive (no active contracts) |
| DELETE | `/gigs/:id` | ✅ owner | Cancel gig |
| POST | `/gigs/:id/images` | ✅ owner | Upload image(s) |
| DELETE | `/gigs/:id/images/:imgId` | ✅ owner | Remove image |
| GET | `/users/me/gigs` | ✅ | My posted gigs |
| GET | `/users/me/work` | ✅ | Gigs I applied to / have contracts for |

### 15.4 Applications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/gigs/:id/applications` | ✅ verified | Apply for gig |
| GET | `/gigs/:id/applications` | ✅ owner | List applications for own gig |
| PATCH | `/gigs/:id/applications/:appId` | ✅ owner | Accept / reject |
| DELETE | `/gigs/:id/applications/:appId` | ✅ applicant | Withdraw |
| POST | `/gigs/:id/applications/:appId/attachments` | ✅ applicant | Upload |
| DELETE | `/gigs/:id/applications/:appId/attachments/:attId` | ✅ applicant | Remove |

### 15.5 Contracts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/contracts` | ✅ poster | Create contract from accepted application |
| GET | `/contracts/:id` | ✅ party | View contract |
| PATCH | `/contracts/:id` | ✅ poster | Update draft (price, dates, description) |
| POST | `/contracts/:id/sign` | ✅ party | Sign contract |
| POST | `/contracts/:id/reject` | ✅ worker | Reject draft |
| POST | `/contracts/:id/complete` | ✅ party | Mark "Job Complete" |
| POST | `/contracts/:id/not-done` | ✅ poster | Mark "Job Not Done" |
| POST | `/contracts/:id/quit` | ✅ worker | Quit contract |
| POST | `/contracts/:id/cancel` | ✅ both | Mutual cancel (within 24h) |
| GET | `/users/me/contracts` | ✅ | List own contracts |

### 15.6 Contract Appendices

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/contracts/:id/appendices` | ✅ poster | Propose appendix |
| PATCH | `/contracts/:id/appendices/:appxId` | ✅ worker | Accept / reject |

### 15.7 Disputes & Evidence

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/contracts/:id/evidence` | ✅ party | Submit evidence |
| POST | `/contracts/:id/escalate` | ✅ party | Submit to arbiter |

### 15.8 Reviews

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/contracts/:id/reviews` | ✅ party | Leave review |
| GET | `/users/:id/reviews` | ✅ verified | View user's reviews |

### 15.9 Invoices

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/me/invoices` | ✅ | List own invoices |
| GET | `/users/me/invoices/:id` | ✅ | View invoice detail |
| GET | `/users/me/invoices/:id/pdf` | ✅ | Download PDF |

### 15.10 Info Requests

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/gigs/:id/info-requests` | ✅ verified | Request hidden field |
| GET | `/gigs/:id/info-requests` | ✅ owner | List info requests |
| PATCH | `/gigs/:id/info-requests/:reqId` | ✅ owner | Grant / deny |

### 15.11 Notifications & Messages

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/notifications` | ✅ | List notifications |
| PATCH | `/notifications/:id/read` | ✅ | Mark read |
| POST | `/notifications/read-all` | ✅ | Mark all read |
| GET | `/messages/inbox` | ✅ | Received messages |
| GET | `/messages/sent` | ✅ | Sent messages |
| POST | `/messages` | ✅ | Send message |
| GET | `/messages/:id` | ✅ party | Single message |
| PATCH | `/messages/:id/read` | ✅ recipient | Mark read |

### 15.12 Gig Flags

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/gigs/:id/flags` | ✅ verified | Flag a gig |

### 15.13 Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/users` | ✅ admin | List users |
| GET | `/admin/users/:id` | ✅ admin | User detail |
| PATCH | `/admin/users/:id` | ✅ admin | Restrict / block |
| DELETE | `/admin/users/:id/data/:field` | ✅ admin | Delete PII |
| POST | `/admin/users/:id/mark-deletion` | ✅ admin | Mark for deletion |
| DELETE | `/admin/users/:id/mark-deletion` | ✅ admin | Unmark |
| GET | `/admin/gigs` | ✅ admin | All gigs |
| PATCH | `/admin/gigs/:id` | ✅ admin | Hide / restore |
| GET | `/admin/contracts` | ✅ admin | All contracts |
| GET | `/admin/disputes` | ✅ admin | Disputed/arbitration contracts |
| PATCH | `/admin/contracts/:id/resolve` | ✅ admin | Arbiter decision |
| GET | `/admin/flags` | ✅ admin | Flag reports |
| PATCH | `/admin/flags/:id` | ✅ admin | Review / dismiss |
| GET | `/admin/invoices` | ✅ admin | All invoices |
| PATCH | `/admin/invoices/:id` | ✅ admin | Mark as paid |
| GET | `/admin/messages/inbox` | ✅ admin | Admin inbox |
| GET | `/admin/messages/sent` | ✅ admin | Admin sent |
| POST | `/admin/messages` | ✅ admin | Send to user |
| GET | `/admin/regions` | ✅ admin | List regions |
| POST | `/admin/regions` | ✅ admin | Add region |
| GET | `/admin/cities` | ✅ admin | List cities |
| POST | `/admin/cities` | ✅ admin | Add city |

---

## 16. UI/UX Screens & Flows

### 16.1 User-Facing App

| Screen | Route | Access |
|--------|-------|--------|
| Board (gig list) | `/` | All |
| Gig Detail | `/gigs/:id` | All (visibility rules) |
| Create Gig | `/gigs/new` | Verified |
| Edit Gig | `/gigs/:id/edit` | Owner |
| Register | `/register` | Unauthenticated |
| Login | `/login` | Unauthenticated |
| Verify Email | `/verify/email` | Unverified |
| Verify Phone | `/verify/phone` | Unverified |
| My Gigs (Jobs/Work) | `/my-gigs` | Auth |
| Contract Detail | `/contracts/:id` | Party |
| Invoices | `/invoices` | Auth |
| Invoice Detail | `/invoices/:id` | Owner |
| Inbox | `/inbox` | Auth |
| Sent | `/sent` | Auth |
| Profile (edit) | `/profile/me` | Auth |
| Profile (view) | `/profile/:id` | Verified |
| 404 | `*` | All |

### 16.2 Admin App

| Screen | Route | Access |
|--------|-------|--------|
| Dashboard | `/` | Admin |
| User List | `/users` | Admin |
| User Detail | `/users/:id` | Admin |
| All Gigs | `/gigs` | Admin |
| Gig Detail | `/gigs/:id` | Admin |
| All Contracts | `/contracts` | Admin |
| Dispute Review | `/contracts/:id/dispute` | Admin |
| Flag Reports | `/flags` | Admin |
| Invoices | `/invoices` | Admin |
| Admin Inbox | `/inbox` | Admin |
| Admin Sent | `/sent` | Admin |
| Taxonomy | `/taxonomy` | Admin |

### 16.3 "Secured Gigs" Section (Main Page)

A promotional section visible to all visitors (configurable by admin):
- **Contracts Signed:** count of contracts with status ≥ `in_progress`
- **Gigs in Progress:** count of contracts in `in_progress` status
- **Gigs Completed:** count of contracts in `completed` status
- **Total Compensation Paid:** sum of `agreed_price` from completed contracts

Displays as aggregate counts (e.g., "47 gigs completed | 55 contracts signed | ₾12,400 compensation paid | this week").

---

## 17. Tech-Stack Proposal

### 17.1 Frontend

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Data | TanStack Query |
| Forms | React Hook Form + Zod |
| i18n | next-intl (English only v1) |

### 17.2 Backend

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20 LTS |
| Framework | Fastify |
| Language | TypeScript |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 |
| Queue | BullMQ (Redis) |
| Storage | Cloudflare R2 |
| Email | Resend (or AWS SES) |
| SMS | Stubbed for v1 |

### 17.3 Infrastructure

| Component | Choice |
|-----------|--------|
| Hosting | Railway or Render (v1) |
| CDN | Cloudflare |
| DNS | Cloudflare DNS |
| CI/CD | GitHub Actions |
| Monitoring | Sentry + Better Uptime |

---

## 18. Infrastructure & Deployment

(To be expanded — environments, CI/CD pipeline, migrations, monitoring.)

---

## 19. Security Considerations

| # | Concern | Mitigation |
|---|---------|-----------|
| S1 | Auth | Short-lived JWT (15 min); httpOnly refresh; rotation |
| S2 | Passwords | bcrypt (cost ≥ 12) |
| S3 | OTP brute force | 5 attempts; 15 min expiry; rate-limit |
| S4 | Age bypass | Server-side DOB check |
| S5 | PII exposure | Visibility enforced server-side |
| S6 | File upload | MIME + magic bytes; max 10 MB; R2 storage |
| S7 | CORS | Strict origin allowlist |
| S8 | SQL injection | Parameterized queries via ORM |
| S9 | XSS | Escape user content; CSP headers |
| S10 | CSRF | SameSite=Strict; CSRF token |
| S11 | Rate limiting | Per-IP and per-user on auth/OTP |
| S12 | Admin | Role checked server-side |
| S13 | Enumeration | Generic error messages |
| S14 | EXIF | Strip GPS/personal data on upload |

---

## 20. Decisions Log

| # | Question | Decision |
|---|----------|----------|
| D-1 | Fee split | 3% poster / 2% worker on `agreed_price` |
| D-2 | Carry-over | Fees < 1.00 GEL carry to next month |
| D-3 | Grace period | 24 hours from contract signing (mutual cancel, no fee) |
| D-4 | Auto-complete | 48h after one party marks "Job Complete" |
| D-5 | Dispute window | 48h total; arbiter unlock at 24h |
| D-6 | Appendix limit | Max 3 per contract |
| D-7 | Worker quit < 24h | No fee; poster can leave negative review |
| D-8 | Worker quit > 24h | 2% fee; tracked; poster can leave negative review |
| D-9 | Arbiter: favor one | Losing party pays their share; winning pays nothing |
| D-10 | Arbiter: dismiss both | Contract cancelled; no fees |
| D-11 | Auto-resolve dispute | 48h no arbiter submission → completed with fees for both |
| D-12 | Contract draft | Poster edits; worker accept/reject only |
| D-13 | Signing | Both click "Confirm & Sign"; digital signature future |
| D-14 | Start/due times | Full datetime (not just date) |
| D-15 | Worker "Complete" timing | No earlier than 8h / 1 working day before due datetime |
| D-16 | Poster "Not Done" timing | After 6h from agreed start datetime |
| D-17 | Gig stays ACTIVE | One gig, many contracts (max 100) |
| D-18 | Gig on expiry | SHELF if active contracts; EXPIRED if none |
| D-19 | Pending apps on shelf/expiry | Auto-closed; no notification to applicant |
| D-20 | Reviews | Bidirectional; pending until completion; 14-day window; immutable |
| D-21 | Contact sharing | All non-private fields; permanent (cannot revoke) |
| D-22 | Invoice payment (v1) | Admin manually marks paid |
| D-23 | Gig categories | "My Jobs" (hiring) / "My Work" (working) |
| D-24 | Storage | Cloudflare R2 |
| D-25 | Analyzer | Future; v1 uses report-based moderation |
| D-26 | QR code format | TBD |
| D-28 | Worker rejects draft | Poster can revise & re-send unlimited times; can reject application to end negotiation |
| D-29 | Rejection reason | Optional free text, visible only to poster |
| D-30 | Complete/Not Done timing | Half-time rule: `agreed_start_at + (due_at − agreed_start_at) / 2` |
| D-31 | Review window after auto-complete | Yes — 14-day review window applies after any completion (manual or auto) |
| D-32 | Re-application after cancel | Application set to `REJECTED`; re-application to same gig blocked (UNIQUE constraint); other gigs by same poster allowed |
| D-33 | My Work UI | Status labels on each gig (Application Pending, Contract Signed, Work Completed, etc.) + dropdown filter |
| D-34 | Dispute auto-resolve timer | 7 days from dispute creation → `AUTO_RESOLVED` with fees for both |
| D-35 | `agreed_start_at` | Required; editable before signing; immutable after; new start only via Resolution Appendix |
| D-36 | Arbiter submission | Both parties can submit to Arbiter |
| D-37 | Worker quits after 24h | Status = `QUIT`; 2% fee for worker |
| D-38 | Both silent past due | Reminders at +24h, +72h, +7d; auto-complete at +14 days with fees |
| D-39 | "Total Compensation Paid" | Sum of `agreed_price` from completed contracts |
| D-40 | Contact info permanence | Temporary — visible only while contract is active; hidden on terminal states |

### Open Questions

All questions (28–40) have been resolved. No pending open questions.

---

*Last updated: 2026-03-30 — draft v0.5*
