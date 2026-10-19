# Feature Spec: Configurable Contract Settings

## Goal
Let an administrator manage the platform's fee rates and contract timeframes without a code change, while preserving the rules that applied to contracts already underway.

## Current gap
The contract routes contain a hard-coded 24-hour cancellation/quit grace period. The 48-hour completion timer, overdue completion, dispute timers, and fee calculation are documented but not implemented. There is no settings API or usable admin settings screen.

## First implementation slice
1. Store one active set of platform settings with defaults: poster fee 3%, worker fee 2%, cancellation grace 24 hours, completion response 48 hours, overdue completion 14 days, arbiter unlock 24 hours, and dispute auto-resolution 7 days.
2. Expose an admin-only API to read and update the complete settings set. Validate units and bounds; do not accept unknown fields.
3. Record each successful settings change with the administrator, timestamp, and before/after values.
4. When the second party signs a contract, copy the active settings onto that contract. Later admin changes apply only to contracts activated after the change.
5. Use the saved grace value for worker-quit fee eligibility. Preserve existing 24-hour behavior for contracts created before the new snapshot columns exist. Cancellation itself is mutual and always fee-free since the mutual-cancellation slice (PR #19), so it does not consult the grace value.

## Rules for administrators
- Only accounts with the `admin` role may read or change settings.
- Updates replace the complete settings set atomically; invalid updates change nothing.
- Timeframes are positive whole numbers: hours are limited to 1–8,760 and days to 1–365. Fee percentages are from 0 through 100 with at most two decimal places.
- The API returns the effective settings and last-updated metadata. Audit history is retained for later review; a history-view screen is outside this slice.

## Compatibility and boundaries
- Settings are snapshotted when a contract enters `in_progress`; they never rewrite a signed, active, or terminal contract's policy.
- This slice does not implement the BullMQ timers, fee ledger, invoice generation, dispute evidence, or arbiter resolution. The saved values are ready for those follow-up slices; they must be wired to their behavior before being presented as operational controls.
- A minimal admin settings page and production deployment of `apps/admin` are separate follow-up work. The API must remain secure independently of the UI.

## Acceptance criteria
- Admin can read and update the complete settings object; a normal user receives 403 and an unauthenticated caller receives 401.
- Invalid values and partial updates are rejected without changing stored settings or creating an audit entry.
- A successful update atomically changes settings and creates one audit entry.
- When the second signature activates a contract, all current settings are snapshotted.
- Cancel/quit fee eligibility uses the contract's snapshotted grace period, including exact boundary behavior.
- Existing contracts without snapshot values retain the current 24-hour rule.
- Tests cover authorization, validation, audit behavior, snapshotting, and grace-period boundaries.
