---
name: frontend-web
description: "Next.js frontend development for gigs.ge user-facing and admin apps. Use when: building pages, components, forms, visibility rules, Tailwind styling, TanStack Query data fetching, or PWA configuration."
---

# Frontend Development

## Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS (mobile-first)
- **Data Fetching**: TanStack Query
- **Forms**: React Hook Form + Zod
- **i18n**: next-intl (English only in v1; architecture supports Georgian in v2)

## App Structure
- `apps/web/` — Visitor and verified user interface
- `apps/admin/` — Separate deployment for platform moderation
- Both share types from `packages/shared/`

## Routing (User App)
| Route | Access | Purpose |
|-------|--------|---------|
| `/` | All | Gig board (paginated) |
| `/gigs/:id` | All | Gig detail (visibility rules) |
| `/gigs/new` | Verified | Post a gig |
| `/register`, `/login` | Unauth | Auth flows |
| `/profile/me` | Auth | Own profile edit |
| `/profile/:id` | Verified | View other user's profile |
| `/inbox`, `/sent` | Auth | Messaging |
| `/my-gigs` | Auth | Dashboard (My Jobs / My Work tabs) |
| `/contracts/:id` | Party | Contract detail |
| `/invoices` | Auth | Invoice history |

## Visibility Rules (Client-Side)
The API enforces visibility server-side. The frontend renders conditionally:
- Hidden fields: show "🔒 Request access" button
- Requestable fields: show "📩 Request sent" after request
- Unverified users: show verification prompt on restricted actions

## Mobile-First
- All layouts designed for 375px minimum width first
- Breakpoints: `sm` (640px), `md` (768px), `lg` (1024px)
- Touch targets: minimum 44x44px

## Fee Display
- Post Gig form: show "Estimated platform fee: ₾ X.XX (3%)" next to price field
- Apply form: show "Service fee upon completion: ₾ X.XX (2%)" as info banner
- Negotiable gigs: fee shown after agreed_price is set in contract draft

## My Work Status Labels
Each gig in "My Work" tab shows a status label:
- Application Pending / Rejected / Closed
- Contract Draft / Contract Signed / Work Completed / Disputed / Cancelled / Quit
- Dropdown filter to narrow by status

## Contact Info Visibility
- Contact info only shown while contract is in active state
- Hidden on terminal contract states (COMPLETED, AUTO_RESOLVED, CANCELLED, QUIT)
