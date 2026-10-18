# Feature Requirements: Server-Enforced Gig Visibility

## Goal
Return only gig fields the requesting person is permitted to see. Hiding a value in the browser is not privacy: API responses must not contain restricted values.

## Visibility Rules
Apply the existing `SYSTEM_DESIGN.md` visibility levels consistently:
- `public`: any viewer.
- `authenticated`: any valid logged-in viewer.
- `verified`: viewer with verified email.
- `on_request`: only after that viewer's request for that gig field is granted.
- `post_contract`: only to a party while a related contract is active (`draft`, `in_progress`, `pending_completion`, `disputed`, or `arbitration`).
- `private`: gig owner or admin only.

The gig owner and admin may view all gig fields. A verified worker is verified by email; phone verification is optional.

## Fields
- `shortDescription`, `regionId`, `priceType`, status and expiry remain available as needed for board/detail behavior.
- `longDescription` is hidden from visitors and email-unverified users; show it to email-verified viewers, active contract parties, the owner, and admins.
- `priceFixed`, `priceRangeMin`, and `priceRangeMax` are returned only if `visPrice` grants access. Negotiable price type remains visible without numeric price fields.
- `cityId`, `streetAddress`, `availableFrom`, and `availableTo` each follow their corresponding `visCity`, `visAddress`, and `visDates` rules.
- Hidden fields are `null` in responses; their visibility configuration may remain so the UI can show a locked state. Raw restricted values must never be serialized.
- No user profile contact fields are added by this feature. If contact fields are later returned, they must follow active-contract visibility and be removed in terminal states.

## Response Surfaces
Apply the same server-side projection to:
1. `GET /api/v1/gigs` for anonymous, authenticated, verified, owner, and admin viewers.
2. `GET /api/v1/gigs/:id` using the same viewer rules, including inactive gigs visible only to their owner as today.
3. `GET /api/v1/applications/mine` for each nested gig, using that viewer's own grants and active contract relationship.
4. `GET /api/v1/contracts/:id` for the contract party, using the contract's current active/terminal status to decide `post_contract` access.

`GET /api/v1/gigs/mine` remains an owner-only view and returns the owner's full fields.

## Edge Cases and Errors
- Missing, malformed, expired, or invalid optional bearer token on public gig reads is treated as anonymous; it must never grant elevated visibility.
- An inaccessible gig remains 404; do not reveal hidden or inactive gig details to unrelated viewers.
- A `post_contract` grant ends immediately when the contract reaches a terminal state.
- `on_request` grants are specific to the requesting user, gig, and field; another user's grant does not transfer.
- Applications and contract response paths must not bypass the gig projection by returning `gig: true` directly.
- Existing request/access APIs remain unchanged. A pending or denied info request does not grant visibility.

## Acceptance Criteria
- Anonymous and email-unverified API tests assert restricted values are absent/null, not merely hidden by UI.
- Verified users see only fields allowed by each setting; granted `on_request` fields are scoped to that user and gig.
- Contract parties see `post_contract` fields only while the contract is active; terminal contract reads redact them.
- Owner/admin retain access; unrelated users receive no private fields.
- Board, detail, applications/mine, and contract detail all use the same policy helper.
- The web build and all API tests pass.
