---
name: database-schema
description: "Drizzle ORM schema design and PostgreSQL migrations for gigs.ge. Use when: creating or modifying database tables, writing migrations, seeding data, or working with the Georgian regions/cities taxonomy."
---

# Database & Schema Development

## Stack
- **ORM**: Drizzle ORM (type-safe SQL)
- **Database**: PostgreSQL 16
- **Migrations**: Drizzle Kit (`drizzle-kit generate` / `drizzle-kit migrate`)

## Schema Location
- All table definitions: `apps/api/src/db/schema/`
- One file per domain: `users.ts`, `gigs.ts`, `applications.ts`, `contracts.ts`, `billing.ts`, `messages.ts`, `reviews.ts`
- Barrel export: `apps/api/src/db/schema/index.ts`

## Conventions
- All primary keys: `UUID` via `gen_random_uuid()`
- All timestamps: `TIMESTAMPTZ`, stored in UTC
- Enum-like fields: use `TEXT` with check constraints (not Postgres enums — easier to migrate)
- Soft patterns: use `status` columns rather than soft-delete flags
- Every table has `created_at` and `updated_at`

## Key Tables (from SYSTEM_DESIGN.md)
| Table | Purpose |
|-------|---------|
| `users` | Auth credentials, role, account status |
| `user_profiles` | PII, visibility toggles, contact info |
| `gigs` | Job listings with per-field visibility |
| `gig_images` | Uploaded images with sort order |
| `applications` | User applies for a gig (has rejection_reason field) |
| `application_attachments` | Portfolio files on applications |
| `contracts` | Agreement between poster & worker (replaces old handshakes) |
| `contract_appendices` | Resolution appendices during disputes (max 3) |
| `billing_ledger` | Fee tracking (3% poster / 2% worker) |
| `invoices` | Monthly generated invoices |
| `reviews` | 1-5 star ratings post-completion |
| `dispute_evidence` | Proof descriptions for arbitration |
| `dispute_evidence_files` | Proof files for arbitration |
| `notifications` | System event notifications |
| `messages` | Direct user-to-user messages |
| `info_requests` | Requests for hidden gig fields |
| `gig_flags` | User-reported gig issues |
| `otp_codes` | Email/SMS verification codes |
| `regions` / `cities` | Georgian geographic taxonomy |

## Seeding
- `apps/api/src/db/seed.ts` — Populates regions and cities
- Georgian regions (მხარე): Tbilisi, Adjara, Guria, Imereti, Kakheti, etc.
- Each region has associated cities
