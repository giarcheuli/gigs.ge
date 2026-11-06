# Spec: Portfolio documentation entry

Documentation-only slice for the approved portfolio milestone. Audience: BA and technical-writing reviewers.

Acceptance: README links a concise evidence-based case study, separates gig photos from deferred attachments, points to current CI, and labels dated status notes as historical. Case study distinguishes requirements, implementation, automated test evidence, and live validation. No app changes, deployment, credentials, test-account details, or measured-impact claims. Historical snapshots remain unchanged.

Validation: resolve local Markdown links, review the diff against the photo spec and UAT handoff, and run `git diff --check`. Target: `dev` via reviewed PR. Required security/coherence and Opus reviews remain gates before merge.
