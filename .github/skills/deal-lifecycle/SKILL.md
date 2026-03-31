---
name: deal-lifecycle
description: "Contract state machine for gigs.ge including draft negotiation, signing, completion, cancellation, disputes, and arbitration. Use when: implementing contract status transitions, the 48h auto-complete timer, the 24h grace period, half-time rule, 14-day overdue auto-complete, dispute evidence submission, or arbiter resolution logic."
---

# Contract Lifecycle & Dispute Resolution

## State Machine

```
DRAFT (created when poster accepts application)
    |
    |-- Worker rejects --> poster revises & re-sends (unlimited)
    |                       or poster rejects application (ends negotiation)
    |
    +-- Both sign --> IN_PROGRESS
            |
            |-- Mutual cancel within 24h --> CANCELLED (no fee)
            |
            |-- Worker: "Job Complete" --> PENDING_COMPLETION
            |       |  (only after half-time rule)
            |       |
            |       |-- Poster: "Job Complete" --> COMPLETED
            |       |-- Poster silent 48h --> COMPLETED (auto)
            |       +-- Poster: "Job Not Done" --> DISPUTED
            |
            |-- Poster: "Job Not Done" --> DISPUTED
            |       (only after half-time rule)
            |
            |-- Worker: "Quit Job"
            |       |-- < 24h of signing --> QUIT (no fee)
            |       +-- > 24h of signing --> QUIT (2% fee)
            |
            +-- Both silent past due --> reminders +24h/+72h/+7d
                                     --> auto-complete at +14d
```

## Key Timers (BullMQ Jobs)
| Timer | Duration | Trigger |
|-------|----------|--------|
| Auto-complete (one marks done) | 48 hours | One party marks DONE, other is silent |
| Grace period for cancel | 24 hours | From contract signing - cancellation without fees |
| Half-time rule | `(due_at - agreed_start_at) / 2` | Earliest time Complete/Not Done buttons activate |
| Dispute communication window | 7 days | From dispute creation |
| Arbiter unlock | 24 hours | "Submit to Arbiter" button becomes available |
| Dispute auto-resolve | 7 days | From dispute creation -> AUTO_RESOLVED (fees for both) |
| Overdue reminders | +24h, +72h, +7d | From `due_at` when both parties are silent |
| Overdue auto-complete | 14 days | From `due_at` -> COMPLETED (fees for both) |

## Half-Time Rule
`earliest_action_at = agreed_start_at + (due_at - agreed_start_at) / 2`
Both "Job Complete" (worker) and "Job Not Done" (poster) are disabled until this time.

## Contract Draft Rejection
- Worker rejects -> poster can revise & re-send (unlimited rounds)
- Worker may include optional rejection reason (free text, visible only to poster)
- Poster can reject the application at any time to end negotiation

## Dispute Resolution Flow
1. Poster marks "Job Not Done" -> contract enters `DISPUTED`
2. Poster can propose Resolution Appendix (max 3 per contract)
3. Appendix can include: new description, additional compensation, new due date, new start date
4. Worker accepts (-> back to IN_PROGRESS) or rejects
5. After 24h, "Submit to Arbiter" unlocks for **both parties**
6. Both parties submit evidence: description + files (max 10)
7. Admin (Arbiter) decides: **Favor Poster** / **Favor Worker** / **Dismiss Both**
8. If neither submits in 7 days -> `AUTO_RESOLVED` with fees for both

## Cancellation / Quit Rules
- **Mutual cancel < 24h after signing**: Clean cancel, no fees
- **Worker quits < 24h**: No fee; poster can leave negative review
- **Worker quits > 24h**: 2% fee on agreed_price; tracked; poster can leave negative review
- **On cancel/quit**: Application status -> `REJECTED`; re-application to same gig blocked

## Contact Info
- Shared when contract is created (all non-private fields)
- **Temporary**: visible only while contract is in active state
- Hidden when contract reaches terminal status (COMPLETED, AUTO_RESOLVED, CANCELLED, QUIT)

## Fee Eligibility
- `fee_eligible = true` by default on contract creation
- Set to `false` on mutual cancel within 24h grace period
- Set to `false` when arbiter dismisses both parties

## Finality Lock
Once a contract reaches `COMPLETED`, `AUTO_RESOLVED`, `CANCELLED`, or `QUIT`, the record is **immutable**.
