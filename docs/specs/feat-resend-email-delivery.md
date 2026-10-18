# Feature Spec: Resend Authentication Email Delivery

> **Status:** Approved for implementation
> **Type:** Backend and minimal web flow
> **Target:** Dev first, then UAT after verification

## Goal

Send the authentication emails that the existing API already prepares, using the verified `gigs.ge` domain through Resend. A new user must be able to receive and verify an email code, request another code, and complete a password reset from the email link.

## Current behavior

The API stores hashed verification codes and reset tokens, but its registration, resend, and forgot-password routes do not deliver email. Development responses may expose codes or reset tokens for local testing. The API already reads `RESEND_API_KEY` and `EMAIL_FROM`; the Resend client is not yet installed or used. The web app has no password-reset screen.

## Scope

1. Add a shared API email service using the official Resend Node SDK.
2. Enqueue verification, resend, and password-reset messages in Google Cloud Tasks; the request handlers must not wait for Resend.
3. Add a signed internal task handler that checks the current token record and expiry before sending.
4. Add password-reset web screens to request and complete a reset.
5. Load the dev API key from Google Secret Manager through Cloud Run; configure `EMAIL_FROM=noreply@gigs.ge`.
6. Keep the existing email-required, phone-optional product rule and current OTP policy.

## Out of scope

- SMS or phone verification delivery.
- Gig, contract, billing, or general inbox notification emails.
- Marketing or broadcast email, template management UI, and delivery analytics.
- A general-purpose notification platform; Cloud Tasks is used only for authentication email jobs.
- Georgian localization; auth emails use the English language already used by the first auth UI slice.

## Product behavior

### Registration verification

- After registration creates the account and stores the hashed, expiring email code, submit a verification email to the registered address.
- The email includes the six-digit code, its 15-minute expiry, and a brief instruction to ignore it if the recipient did not register.
- Keep the API response and session behavior compatible with the existing registration flow. In production, never return the code or include it in logs.
- Enqueue the email job without waiting for Resend. If Cloud Tasks cannot accept the job, keep the account and OTP record, return normal registration success with an explicit delivery-failed state, and let the web screen explain that the user can request a resend after the existing cooldown.

### Resend verification email

- Preserve authentication, email-only channel behavior, and the existing one-request-per-60-seconds-per-user cooldown.
- A successful request sends the newest code to the authenticated user's own registered email. Do not accept an email address in the request body or send to another address.
- Preserve the existing `PHONE_VERIFICATION_NOT_AVAILABLE` response for SMS requests. Do not generate or send SMS.
- If the task queue cannot accept the job, do not expose the code or provider details. Return a stable delivery error and retry timing; retain the cooldown so repeated requests cannot flood the provider.

### Password reset

- Preserve the generic forgot-password response for both known and unknown email addresses; neither the response nor delivery status may reveal whether an account exists.
- Apply a route-specific IP rate limit to forgot-password requests. Enqueue a no-op task for unknown accounts so both paths make a queue request and return the same response shape.
- For an existing account, email a single-use reset link containing the existing cryptographically random token. The token expires after 15 minutes, is stored only as a hash, and is consumed once.
- Use `FRONTEND_URL/reset-password#token=<token>` so the token stays in the browser fragment instead of being sent in HTTP requests or referrer headers.
- Add a minimal `/forgot-password` page linked from login. It accepts an email address, submits to the existing forgot-password endpoint, and always displays the same generic confirmation.
- Add a minimal `/reset-password` page with new password and confirmation fields. It reads the fragment, submits the token and new password to the existing reset endpoint, clears the token from the address bar, and gives clear success, expired-link, and invalid-link feedback.
- Ensure verification codes and password-reset tokens have distinct purposes in storage and lookup. A reset request must not invalidate or be mistaken for an email-verification code, and vice versa. Existing unexpired records may be treated as verification codes during migration; previously issued reset links may expire and be requested again.

### Asynchronous delivery

- User-facing handlers enqueue tasks and return without awaiting Resend. Cloud Tasks retries temporary worker/provider failures and stops dispatching after the associated 15-minute credential expiry.
- Task bodies contain only an AES-256-GCM encrypted envelope; the plaintext user ID, email type, credential, and expiry are not stored in Cloud Tasks. Never log task bodies or credentials.
- The internal task endpoint validates an HMAC signature made with the API access-token secret using constant-time comparison, then decrypts and validates the envelope. Invalid signatures are rejected without sending mail.
- Before delivery, the worker confirms the credential still matches an unused, unexpired record of the expected purpose. Stale or already-used tasks complete without sending.
- Use the Cloud Tasks delivery ID as Resend's idempotency key so retries do not send duplicates.
- Cloud Run uses the dedicated `gigsge-api-runtime@$PROJECT_ID.iam.gserviceaccount.com` identity. Grant it Cloud SQL Client on the project, Secret Manager Secret Accessor on only the Resend secret, and Cloud Tasks Enqueuer on only the environment queue. Grant the Cloud Build service account Service Account User on this runtime identity so it can deploy the API.
- The Cloud Tasks queue must be provisioned in the same region as the API.

## Delivery, failure, and security requirements

- Use the verified sender `noreply@gigs.ge`; use Resend's accepted message ID for safe operational logging where available.
- Keep the API key in Google Secret Manager and grant access only to the Cloud Run API service account. Do not put it in source control, Cloud Build substitutions, build logs, browser code, or screenshots. Keep local credentials in an untracked `.env` file.
- A missing key or provider failure must never fall back to returning production OTPs or reset tokens. Do not log recipient addresses, codes, reset tokens, or message bodies. Log a sanitized failure category and message type.
- Resend API acceptance means queued by the provider, not guaranteed inbox delivery; UI copy must not promise inbox placement.
- Provider errors must not expose credentials or internal provider responses to the caller. Password-reset requests keep the same generic response even when delivery fails.
- Continue to rely on the existing auth endpoint/IP rate limit, OTP five-attempt limit, 15-minute expiry, and resend cooldown. Do not weaken any of them.

## Acceptance criteria

1. Registration queues a verification message without waiting for Resend; the worker sends it from the configured sender to the registered recipient, with the generated code and expiry.
2. In production mode, registration and resend responses, API logs, and errors contain no plaintext OTP. Local development may retain the existing `_dev` seam only when `NODE_ENV=development`.
3. Resend of an email code is authenticated, respects the 60-second cooldown, and sends only to the authenticated account's email. SMS remains unavailable.
4. Forgot-password responses are indistinguishable for existing and unknown accounts. The request page always shows the same confirmation; existing accounts receive a reset email with a single-use, 15-minute link; the reset page completes the existing reset operation.
5. Verification and password-reset tokens cannot be used interchangeably. Both remain hashed at rest and single-use.
6. Provider failure does not delete a newly registered account, expose a token, or falsely tell the user that an email was accepted. Registration UI presents a safe resend path; password-reset response remains generic.
7. Unit/integration tests cover encrypted enqueue and delivery, queue/provider failure, signed-task authorization, tamper rejection, Resend idempotency, route rate limiting, production secrecy, resend cooldown, unknown-account response, token-purpose separation, token expiry/use, and the reset page flow.
8. A manual dev check sends to a controlled mailbox, verifies the email code, requests a reset, follows the link, and signs in with the new password. No secret is committed.
9. `docs/architecture/auth-flow.md` and relevant UAT runbook notes accurately describe email-only verification and real Resend delivery; SMS remains optional and unavailable.

## Rollout

1. Create the dedicated API runtime service account and grant only its Cloud SQL, secret-access, and environment-queue roles. Let the Cloud Build service account act as this identity for deployment.
2. Enable the Cloud Tasks API, create an environment-specific queue in `us-central1`, and grant the API runtime service account `roles/cloudtasks.enqueuer` on that queue.
3. Use a Resend sending-only key restricted to `gigs.ge` where supported. Store it as a Secret Manager secret and bind it to the dev API service; keep `EMAIL_FROM` as a non-secret setting.
4. Deploy to dev and verify registration, resend cooldown, and password reset using a controlled mailbox.
5. Promote to UAT only after the same checks pass with a separate queue and secret. Do not revoke the existing Resend onboarding key until the replacement is confirmed working.

## Related documents

- [Auth flow](../architecture/auth-flow.md)
- [UAT auth screens](./feat-uat-auth-screens.md)
- [UAT runbook](../guides/uat-runbook.md)
