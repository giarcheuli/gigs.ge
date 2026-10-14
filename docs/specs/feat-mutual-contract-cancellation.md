# Feature Requirements: Mutual Contract Cancellation

## Product Decision
Either contract party may request cancellation while a contract is `in_progress`, but cancellation takes effect only when the other party agrees. A mutually cancelled contract incurs no platform fee, regardless of elapsed time. A worker may still quit unilaterally; the existing 24-hour quit grace rule remains separate. A poster who believes work is incomplete must use the dispute flow, not unilateral cancellation.

## Why
The current API ends an in-progress contract immediately when either party calls cancel. That contradicts the documented mutual-cancellation rule and gives one party unilateral control over the other party's active agreement. A request/accept flow preserves consent without blocking the worker-quit and poster-dispute remedies.

## User Flow

### Requester
1. On an in-progress contract, choose **"Request cancellation"**.
2. A confirmation panel explains the contract stays active until the other party agrees. An optional reason (maximum 1,000 characters) may be entered.
3. Confirm with **"Send request"** or back out with **"Keep contract"**.
4. Status copy: **"Cancellation request sent. The contract is still active while you wait for {other party}."** Show the request date and a **"Withdraw request"** action.
5. If accepted: **"You both agreed to cancel. The contract is cancelled and no platform fee is due."**
6. If declined: **"The cancellation request was declined. The contract remains active."**
7. If withdrawn: **"Cancellation request withdrawn. The contract remains active."**

### Recipient
- Show a prominent information panel: **"{name} asked to cancel this contract. It remains active unless you agree."** Show the optional reason and request date.
- Actions: **"Agree and cancel"** and **"Decline request"**.
- Before agreement, show a confirmation step: **"This ends the contract for both parties. No platform fee will be due for a mutual cancellation."**
- Declining does not end the contract and does not prevent later work completion, a new cancellation request, worker quit, or an eligible dispute.

## State and Eligibility Rules
- A cancellation request is a separate pending record; it does not change the contract status from `in_progress`.
- Only one pending cancellation request may exist per contract. Either party may be requester.
- Request is allowed only for a contract in `in_progress` with no other pending cancellation request.
- The recipient may accept or decline. The requester may withdraw while the request is pending.
- A pending request does not block normal contract actions. If the contract advances to `pending_completion`, `disputed`, or a terminal status first, close the request as superseded and notify both parties. A stale accept/decline attempt returns a conflict and cannot change the contract.
- Silence never cancels a contract and there is no automatic cancellation on request timeout. The request remains visibly pending until it is accepted, declined, withdrawn, or superseded.
- Accepted mutual cancellation atomically marks the contract `cancelled`, records the acceptance, closes the pending request, and sets both parties' fee eligibility to false.
- Decline or withdrawal closes only the request; the contract remains `in_progress` and fee eligibility is unchanged.
- No fee is due for mutual cancellation at any point in the contract. This is consistent with fees being earned on completed work; the 24-hour grace period remains relevant to worker quit.
- Worker quit remains unilateral from `in_progress`. The saved grace period starts when the contract becomes active (the later of the two signature timestamps), not when the worker signs a draft before the poster. Within the grace period, no fee is eligible; after it, the documented worker fee may apply. The UI must not claim money was collected: payment processing is out of scope and invoice/ledger work is a later release phase.
- Poster cannot unilaterally cancel an in-progress contract. If the poster says work is incomplete, they use **"Job not done — raise dispute"** when eligible under the half-time rule.
- Draft contracts are not part of this cancellation flow. The worker's draft-rejection action is a separate draft-negotiation requirement; do not label it as cancellation.
- Disputed, pending-completion, completed, auto-resolved, cancelled, and quit contracts cannot accept new cancellation requests.

## UI Copy for Other States
- No request: **"Cancellation requires agreement from both parties. If work is incomplete, raise a dispute instead."**
- Existing request: requester sees waiting state; recipient sees the accept/decline panel. Hide the request button for both.
- Contract changed while panel was open: **"This contract has changed. Refresh to see the latest status."**
- Non-party access: use the existing generic access-denied/not-found behavior; do not reveal another contract's request or reason.
- Duplicate/concurrent request: keep the existing pending request and show **"A cancellation request is already pending for this contract."**
- Notification delivery failure: preserve the saved request; show it in the recipient's contract page and retry notification delivery. Do not roll back the request because notification sending failed.

## API and Data Requirements
- Add authenticated party-only endpoints to create a cancellation request, accept it, decline it, and withdraw it.
- Validate contract UUID, party identity, current contract status, requester/recipient roles, request status, and reason length on the server.
- Use a transaction/conditional update so duplicate requests, stale responses, and simultaneous accept/decline actions cannot produce conflicting terminal states.
- Retain an audit record containing requester, recipient, optional reason, requested time, response, responder, and resolution time.
- Notifications go to the other party on request, to both parties on accept/decline/withdrawal, and to both when a request is superseded.
- Do not expose cancellation-reason text to unrelated users or admins outside authorized moderation needs.

## Error Handling

| Condition | Result |
|---|---|
| Unauthenticated | 401; web prompts sign-in and returns to contract. |
| Not a contract party | 403 or existing privacy-preserving 404; reveal no contract/request details. |
| Contract is not `in_progress` | 409; show current status and available next action. |
| Request already pending | 409; keep the existing pending-request panel. |
| Request is no longer pending | 409; refresh state and do not repeat the action. |
| Invalid or oversized reason | 400; keep the form and show a field-level message. |
| Concurrent response / duplicate click | One transaction wins; other receives 409 and refreshes. |
| Server/network failure | Preserve the user's text; show retry guidance and never claim the request succeeded. |

## Acceptance Criteria
- Either party can request cancellation; only the recipient can accept or decline; only the requester can withdraw.
- A request alone never changes contract status or fee eligibility.
- Acceptance ends the contract exactly once, records both parties' agreement, and creates no fees.
- Decline, withdrawal, and supersession leave contract lifecycle and fees unchanged.
- Worker quit and poster dispute remain distinct and available under their existing rules.
- Pending requests cannot trap the contract or prevent other valid state transitions.
- All copy and all error states above have corresponding UI states and tests.
- Tests cover both party roles, every terminal outcome, authorization, duplicate requests, stale requests, and competing lifecycle transitions.
