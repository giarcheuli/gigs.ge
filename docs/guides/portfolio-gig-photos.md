# Case study: turning gig photos into a testable feature

## Problem and contribution

A Georgian gig board needs photos so workers can understand a short-term job before applying. Adding upload controls also introduces privacy, authorization, failure, and deletion decisions.

This is my personal project. My focus is product requirements, decision ownership, acceptance criteria, documentation, and validation of AI-assisted implementation. Repository artifacts show the work; they do not establish that every line was handwritten or that this was an employer deliverable.

## From requirement to evidence

| Requirement or decision | Evidence |
|---|---|
| Cover photo on public cards; extra photos governed by visibility settings | [Delivered feature spec](../specs/feat-gig-photos.md) and [web component](../../apps/web/src/components/gig-photos.tsx) |
| Owner-only changes; maximum 10 photos, 10 MB per file | [API tests](../../apps/api/src/__tests__/gig-images.integration.test.ts) cover non-owner rejection, file size, and photo limit |
| Protect location data; inspect bytes rather than trusting MIME labels | Same tests check metadata removal and reject non-images |
| Storage choice balances operational complexity and portability | [Spec decision](../specs/feat-gig-photos.md): existing cloud identity avoids another set of access keys; storage access is isolated |
| Delete the image and select a replacement cover | API test covers deletion, stored-file removal, and cover promotion |
| Explain partial upload failure without losing the gig | Spec describes publishing the gig and reporting individual failed photos |

The spec records a concrete revision: a one-year cache was reduced to one hour because deleted photos could remain cached. This is a tradeoff, not immediate revocation. Storage uses public objects with unguessable names; gallery visibility controls API discovery and is not private-object access control. Private dispute evidence needs a separate design.

## Verification and limits

The spec marks this feature delivered on 2026-10-20 and records UAT cache verification on that date. The [current handoff](uat-readiness-handoff.md) includes photo posting and editing. These are repository records, not a fresh live test in this portfolio pass.

[CI](../../.github/workflows/ci.yml) defines API typechecking/tests and web/admin builds. The photo suite uses a real API app with mocked dependencies; it does not prove cloud permissions, real-database concurrency, or browser behavior. The suite was inspected, not rerun in this documentation-only pass.

## Result and next validation

The repository contains a delivered slice with an explicit privacy rule, storage rationale, failure behavior, tests, and a recorded decision revision. No usage, revenue, or time-saving result is claimed.

Next acceptance pass: use synthetic images on UAT to verify posting, partial failure, owner/non-owner behavior, removal, and cache expiry. Attach dated results without credentials or real user data. Avatars, application attachments, and dispute evidence remain outside this slice.

[Documentation index](../README.md) · [Scope of this update](../specs/portfolio-entry.md)
