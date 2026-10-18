# Architecture: Authentication Flow

> **Status:** Authentication email delivery uses Resend; SMS remains optional and unavailable.

## Overview

gigs.ge uses a **stateless JWT** pattern with a short-lived access token and a long-lived httpOnly refresh cookie. This is the standard approach for SPAs that need to talk to an API on a different origin without exposing tokens to JavaScript.

## Token Pair

| Token | Where | Lifetime | Purpose |
|-------|-------|----------|---------|
| **Access token** | `Authorization: Bearer <token>` header | 15 minutes | Authenticates API requests |
| **Refresh token** | `httpOnly` cookie (`SameSite=Strict`) | 7 days | Silently renews the access token |

Why 15 minutes? Short enough that a leaked access token has limited blast radius, long enough that users don't see refresh jitter during a typical session.

## Registration

```mermaid
sequenceDiagram
    participant U as User
    participant API as /auth/register
    participant DB as PostgreSQL
    participant Mail as Resend

    U->>API: POST { email, phone, password, dateOfBirth }
    API->>API: Validate (Zod schema)
    API->>API: Hash password (bcrypt, cost=12)
    API->>DB: INSERT users + user_profiles
    API->>Mail: Send verification code
    API-->>U: 201 { user } + Set-Cookie (refresh)
```

After registration, the user is **authenticated with email unverified**. They can view the board (same as a visitor) but cannot post or apply until email is confirmed. Phone verification is optional for the first usable release; the phone field remains collected at registration but does not gate actions.

## Login

```mermaid
sequenceDiagram
    participant U as User
    participant API as /auth/login
    participant DB as PostgreSQL

    U->>API: POST { email, password }
    API->>DB: SELECT user by email
    API->>API: bcrypt.compare(password, hash)
    API-->>U: 200 { accessToken, user } + Set-Cookie (refresh)
```

## Token Refresh

```mermaid
sequenceDiagram
    participant U as Client
    participant API as /auth/refresh

    U->>API: POST (cookie sent automatically)
    API->>API: Verify refresh token
    API->>API: Rotate: issue new refresh token, invalidate old
    API-->>U: 200 { accessToken } + Set-Cookie (new refresh)
```

**Rotation** means every refresh call issues a *new* refresh token. If an attacker replays an old one, the server knows the family was compromised and can revoke all tokens for that user.

## Verification (Email Required, Phone Optional)

Email verification is required for posting and applying. Phone verification is optional and is not part of the first-release access decision:

| Channel | Method | Endpoint |
|---------|--------|----------|
| Email | 6-digit one-time code | `POST /auth/verify-otp?channel=email` |
| Phone | Optional; SMS delivery unavailable | Not available |

Email verification codes and password-reset tokens are stored hashed in `otp_codes`, with separate purposes so the two credentials cannot be used interchangeably. Verification codes have:

- Max 5 attempts before expiry
- 15-minute TTL
- 60-second cooldown on resend

Verification and password-reset emails are sent from `noreply@gigs.ge` through Resend. The API key is supplied to Cloud Run from Google Secret Manager; it is never stored in source control or exposed to the browser. Local development can omit the key and use the explicitly development-only `_dev` code response. Provider failure never exposes a code or token in production.

## Password Reset

`POST /auth/forgot-password` always returns the same generic response to avoid revealing whether an email is registered. For an existing account, the API emails a single-use reset link that expires after 15 minutes. The token is placed in the URL fragment, stored only as a hash, and accepted only by the password-reset flow. The `/forgot-password` and `/reset-password` screens complete the user journey.

## Delivery Behavior

Registration creates the account and hashed verification code before attempting email delivery. If Resend cannot accept the email, registration remains successful and reports a safe delivery-failed state so the user can retry after the 60-second cooldown. The resend endpoint returns a stable temporary-unavailable response with retry timing. Password-reset requests retain their generic response even when delivery fails.

## Auth Guards

Three Fastify `preHandler` hooks gate access throughout the API:

| Guard | Checks | Used by |
|-------|--------|---------|
| `requireAuth` | Valid access token, user exists, not banned | Any logged-in action |
| `requireVerified` (or renamed email guard) | `requireAuth` + `email_verified` | Post gig, apply, and other actions that require a verified account |
| `requireAdmin` | `requireAuth` + `role = 'admin'` | All `/admin/*` routes |

These are composable — a route can chain them:

```typescript
app.post('/gigs', {
  preHandler: [requireAuth, requireVerified],
}, createGigHandler);
```

## Rate Limiting

| Scope | Limit | Why |
|-------|-------|-----|
| Auth endpoints (`/auth/*`) | 10 req/min per IP | Brute-force protection |
| OTP resend | 1 req/60s per user | Prevent verification-email abuse |
| General API | 100 req/min per user | Fair use |

## Security Decisions

1. **No token in localStorage.** The access token lives in memory (React state / context). On page refresh, the client calls `/auth/refresh` to get a new one.
2. **httpOnly + SameSite=Strict cookie.** The refresh token is invisible to JavaScript and only sent to same-site requests — mitigates XSS and CSRF.
3. **bcrypt cost=12.** Enough to resist brute-force on modern hardware without noticeably slowing login.
4. **Password hash only.** We never store plaintext. The `password_hash` column is the only password artifact.

## Blocked Users

The `users.status` column controls access:

| Status | Can login? | Can act? |
|--------|-----------|----------|
| `active` | Yes | Yes |
| `restricted` | Yes | No posting/applying (unpaid invoices or arbiter faults) |
| `suspended` | No | No |
| `banned` | No | No |

---

**Related:** [Database Design](./database-design.md) · [SYSTEM_DESIGN.md §4](../../SYSTEM_DESIGN.md) · [Getting Started](../guides/getting-started.md)
