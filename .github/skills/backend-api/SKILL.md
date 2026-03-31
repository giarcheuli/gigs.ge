---
name: backend-api
description: "Fastify backend development for gigs.ge. Use when: creating API routes, middleware, auth guards, request validation, error handling, or Fastify plugin setup in apps/api."
---

# Backend API Development

## Stack
- **Runtime**: Node.js 20 LTS
- **Framework**: Fastify
- **Language**: TypeScript (strict mode)
- **Validation**: Zod schemas (shared with frontend via `packages/shared`)

## Route Conventions
- All routes live under `apps/api/src/routes/`
- Versioned: every route is prefixed with `/api/v1/`
- Group by domain: `auth/`, `gigs/`, `users/`, `applications/`, `contracts/`, `notifications/`, `messages/`, `admin/`

## Auth Pattern
- Short-lived JWT access token (15 min) in `Authorization: Bearer` header
- httpOnly refresh token cookie (7 days, SameSite=Strict)
- Refresh token rotation on every `/auth/refresh` call
- Three guard levels used as Fastify `preHandler` hooks:
  - `requireAuth` — any logged-in user
  - `requireVerified` — email AND phone verified
  - `requireAdmin` — role = 'admin'

## Error Handling
- Return consistent JSON: `{ error: string, statusCode: number, details?: unknown }`
- Use Fastify's `setErrorHandler` for global error formatting
- Never leak stack traces in production

## Rate Limiting
- Auth endpoints: 10 req/min per IP
- OTP resend: 1 req/60s per user
- General API: 100 req/min per user

## File Uploads
- Use `@fastify/multipart` for streaming uploads
- Validate MIME type (allowlist) + magic bytes server-side
- Strip EXIF metadata before storage
- Max sizes: 10 MB per file, 10 images per gig, 5 attachments per application
