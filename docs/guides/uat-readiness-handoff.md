# UAT Readiness Handoff

**Last updated: 2026-10-19.** The current state of what stakeholders can test, what is missing, and where to look next. Agents and the session validator read this file, so keep its path stable and update it at each promotion to UAT.

## What a tester can do today (https://uat.gigs.ge)

1. **Register and verify by email.** A real 6-digit code arrives from `noreply@gigs.ge` (valid 15 minutes; resend after 60 seconds). Phone is collected but its verification is optional.
2. **Reset a forgotten password** through an emailed single-use link.
3. **Browse gigs** without an account. Contact details and restricted fields are hidden by the API, not just by the UI.
4. **Post, edit, and publish a gig** (fixed price only in this release).
5. **Apply to a gig; the poster accepts**, and a contract draft is created.
6. **Sign the contract** (both parties) and see it move to `in_progress`.
7. **Complete or dispute** within the documented rules (half-time rule enforced).
8. **Cancel only by mutual agreement**: one party requests, the other accepts or declines. Mutual cancellation is fee-free. A worker may quit; a quit within the grace window carries no fee.

Demo accounts: [uat-test-accounts.md](./uat-test-accounts.md). Walkthrough: [uat-runbook.md](./uat-runbook.md).

## On dev only (next UAT promotion)

- **Configurable platform settings (PR #26):** admins can read and change fee percentages and lifecycle timers through `GET/PATCH /api/v1/admin/settings`. Each contract stores the settings that applied when both parties signed. There is no admin screen yet.

## Not built yet

| Area | Gap | Plan item |
|------|-----|-----------|
| Contract timers | 48h auto-complete, 14-day overdue, 7-day dispute auto-resolve do not run yet | [Plan](../planning/improvement-plan.md) #7 |
| Disputes | Evidence submission and arbiter decision | #8 |
| Admin app | `apps/admin` is a placeholder page | #9 |
| Billing | Ledger, monthly invoices, carry-over | #11–12 |
| Uploads | Images and evidence files (R2) | #13 |
| SMS | Stubbed; optional for launch | #19 |

## Known limitations for testers

- UAT data is for testing only. The UAT database has **no backups yet** (plan item #2).
- Logging in on UAT after a secret rotation may require signing in again.
- The admin app is not deployed, so testers cannot see admin features.

## Where to look next

- Full status and audit: [status/2026-10-19-project-status.md](../status/2026-10-19-project-status.md)
- Ordered next steps: [planning/improvement-plan.md](../planning/improvement-plan.md)
- Backlog of record: [backlog.json](../backlog.json)
- Test harness decision: [jest-setup.md](../jest-setup.md)
