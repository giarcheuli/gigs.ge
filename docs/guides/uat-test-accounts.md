# UAT Test Accounts

Pre-seeded accounts for stakeholder UAT walkthroughs. All accounts are email-verified
so reviewers can sign in directly at `/login` without going through registration or OTP entry.

Run the seed before a demo session:

```bash
# First time (or to reset): ensure the API database is migrated, then:
pnpm --filter @gigs/api db:seed:uat
```

The seed is idempotent — running it twice is safe and produces no duplicates.
It refuses to run when `NODE_ENV=production`.

---

## Accounts

| # | Role | Email | Password | Purpose |
|---|---|---|---|---|
| 1 | Poster | `poster1@uat.gigs.ge` | `Uat-Demo-2026!` | Creates and publishes gigs; receives applications; accepts one |
| 2 | Worker | `worker1@uat.gigs.ge` | `Uat-Demo-2026!` | Browses the published gig and submits an application |
| 3 | Worker | `worker2@uat.gigs.ge` | `Uat-Demo-2026!` | Second applicant — shows the poster-side multi-applicant view |

### Additional profile details

| Email | Phone | Date of birth |
|---|---|---|
| `poster1@uat.gigs.ge` | `+995555001001` | 15 Jan 1990 |
| `worker1@uat.gigs.ge` | `+995555001002` | 20 Mar 1992 |
| `worker2@uat.gigs.ge` | `+995555001003` | 22 Jul 1988 |

All accounts:
- Status: `active`
- Role: `user`
- Email verified: **yes**
- Phone verified: no (phone OTP UI is deferred to a follow-up ticket)

---

## Suggested UAT walkthrough order

1. Sign in as **poster1** → create and publish a gig.
2. Sign in as **worker1** → find the gig and apply.
3. Sign in as **worker2** → apply to the same gig.
4. Sign back in as **poster1** → view both applications, accept worker1.
5. Both **poster1** and **worker1** sign the contract → observe the status reach `in_progress`.

Steps 4–5 exercise gigs, applications, and contract features which are in later UAT slices.
For the **auth slice only**, steps 1–3 above are sufficient — sign in, confirm email-verified state
is shown, log out and log back in.

---

## Security note

These credentials exist only in dev/UAT environments. The seed script refuses to run in
`production`. Do not use these passwords for any real accounts.
