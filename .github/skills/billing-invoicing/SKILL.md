---
name: billing-invoicing
description: "Fee calculation, billing ledger, and monthly invoice generation for gigs.ge. Use when: implementing the 3%/2% fee split, the billing ledger, carry-over logic, PDF invoice generation, or the monthly cron job."
---

# Billing & Invoicing

## Fee Structure
| Party | Fee | When Calculated |
|-------|-----|----------------|
| Poster (job creator) | 3% of `agreed_price` | Shown as estimate during gig posting; finalized at COMPLETED |
| Worker (applicant) | 2% of `agreed_price` | Shown as estimate during application; finalized at COMPLETED |

## Contract Price Resolution
- **Fixed price gig**: `agreed_price` from contract (defaults from `price_fixed`)
- **Range price gig**: `agreed_price` from contract (poster sets during draft)
- **Negotiable gig**: `agreed_price` set during contract draft (required before signing)

## When Fees Apply
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

## Billing Ledger
Every fee-triggering event creates ledger entries:
1. Poster fee (3% of `agreed_price`) - if applicable
2. Worker fee (2% of `agreed_price`) - if applicable

Ledger entry statuses: `pending` -> `invoiced` -> `paid`

## Carry-Over Rule
If a user's total pending fees for the month are **less than 1.00 GEL**, the entries are marked `carry_over = true` and roll into the next month's invoice.

## Monthly Invoice Generation
- **Schedule**: 1st of each month at 00:00 UTC (BullMQ repeatable job)
- **Process**:
  1. Query all `pending` ledger entries (including carry-overs from previous months)
  2. Sum per user
  3. If total >= 1.00 GEL: generate invoice, mark entries as `invoiced`
  4. If total < 1.00 GEL: mark as `carry_over`, skip invoice

## Invoice Content
- Invoice number (sequential per user)
- Billing period (month/year)
- Line items: each contract with gig title, agreed price, fee percentage, fee amount
- Total due
- Footer: QR codes for gigs.ge bank accounts (format TBD)

## Invoice Delivery
- PDF stored in Cloudflare R2
- Notification sent to user Inbox (`INVOICE_GENERATED` type)
- Optional email delivery

## Invoice Payment
- **v1**: Admin manually marks invoices as paid after verifying bank statements
- **v2**: OpenAPI bank integration auto-matches transactions to users

## User Restrictions
- Users with unpaid invoices older than 30 days: blocked from posting/applying
- Users with 2+ arbiter-fault decisions: blocked from posting/applying
