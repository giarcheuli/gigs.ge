# Feature Spec: Public Gig Board and Hiring Rules

Product-owner decisions from 2026-10-19/20. One spec covers four PR-sized slices; each PR links back here.

## Decisions

| # | Decision |
|---|----------|
| D1 | The money model is unchanged: posters pay workers directly; the platform invoices its 3%/2% fee monthly. A wallet/escrow (balance, top-up, withdrawal) was considered and **rejected**. |
| D2 | The homepage shows the gig board to everyone, logged in or not. `/gigs` redirects to `/`. |
| D3 | Cards show **title, short description, city/region, and amount**. City and amount are **always public**; the per-gig `vis_price` and `vis_city` settings are deprecated and ignored. Personal fields (street address, contact) stay hideable. |
| D4 | The gig detail page requires login (any account). The long description is visible to any logged-in user. |
| D5 | New gigs have a **title** (1–80 characters). Gigs created before the title existed fall back to the short description. |
| D6 | The poster states how many workers they need (`workersNeeded`, default 1). Anyone may apply, and the poster may hire more or fewer than stated. |
| D7 | Only fixed-price gigs can be posted until negotiation is designed. Existing range/negotiable gigs still display. |
| D8 | Board filters: region, city, price range; newest first; "load more" paging. |
| D9 | When accepting an applicant, the poster chooses whether to decline the other pending applicants. Declined applicants get a notification. |
| D10 | A worker may re-apply to a gig **once** after withdrawing. Before a second withdrawal the UI warns that it is final. |
| D11 | Photos are in the backlog; storage choice (Google Cloud Storage vs Cloudflare R2) is pending. |

## Slices

1. **Public board** (D2–D4): board on `/`, city/price public, detail behind login, long description for logged-in users, region/city names returned with each gig.
2. **Posting fields** (D5–D7): `title` and `workers_needed` columns; create/edit forms; fixed price only on create.
3. **Filters and paging** (D8): `GET /api/v1/gigs?regionId&cityId&priceMin&priceMax&cursor&limit` returning `nextCursor`; filter bar and "Load more" on the board.
4. **Hiring rules** (D9–D10): `POST /applications/:id/accept` accepts `{ declineOthers: boolean }`; re-apply reactivates the withdrawn application while `withdrawal_count < 2`; withdraw button with final-withdrawal warning.

## Acceptance criteria

- A logged-out visitor on `/` sees active gigs with title, short description, location names, and amount, and is sent to login when opening one.
- No API response includes `visPrice` or `visCity`; anonymous `GET /api/v1/gigs/:id` returns 401.
- Creating a non-fixed-price gig returns 400; a gig without a title cannot be created.
- Filters narrow the board server-side; "Load more" fetches the next page without duplicates.
- Accepting with `declineOthers: true` rejects every other pending application for that gig in the same transaction and notifies those applicants; with `false` they stay pending.
- After one withdrawal, applying again succeeds; after a second withdrawal, applying returns 409.

Related: [SYSTEM_DESIGN.md §11](../../SYSTEM_DESIGN.md), [improvement plan](../planning/improvement-plan.md).
