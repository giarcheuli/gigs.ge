# Feature Requirements: Email Required, Phone Verification Optional

## Product Decision
Email verification is required before a user can post a gig or apply for work. Phone verification is optional. The phone number remains a required, unique registration field for this release; this decision changes verification eligibility, not phone-number collection.

## Current Gap
The user journey and API currently require both email and phone verification for restricted actions, while the verification screen only supports email OTP. Production email/SMS delivery is not fully configured. The UI and API therefore disagree about what a user must do, and a new user cannot reliably complete verification in production.

## User Journeys

### Registration
1. User enters email, Georgian phone number, date of birth, and password.
2. The account is created with `emailVerified=false` and `phoneVerified=false`.
3. The system sends an email OTP. SMS delivery is not required or sent as a launch prerequisite.
4. The user sees: **"Check your email"** and **"Enter the code we sent to {email}. Email verification is required to post or apply. Phone verification is optional."**
5. After a valid email code, the user is returned to the app and can post or apply.

### Verification Screen
- Title: **"Verify your email"**.
- Show the destination email with only the existing UI's appropriate masking policy; do not expose it in URLs or logs.
- Primary action: **"Verify email"**.
- Resend action: **"Resend code"**; show the remaining wait during the 60-second limit.
- Secondary text: **"Phone verification is optional and does not affect your ability to post or apply."**
- After success: **"Email verified. You can now post gigs and apply for work."**

### Account and Access Prompts
- Account status displays separate values: **Email: Verified / Not verified** and **Phone: Not verified (optional)**.
- An unverified user may browse and manage their own profile, but cannot post or apply.
- A gated action redirects an unauthenticated user to sign-in, preserving the requested destination.
- A signed-in user with unverified email is sent to email verification. Do not send a phone-verification prompt as a blocker.
- API authorization checks `emailVerified`; `phoneVerified` remains truthful and is not silently changed to `true`.

## Validation and Error Messages

| Condition | User-facing behavior |
|---|---|
| Invalid email OTP | Inline alert: **"That code is incorrect. Check it and try again."** Keep the code entry available. |
| Expired OTP | Inline alert: **"That code has expired. Request a new code to continue."** Offer resend when rate limit permits. |
| Too many attempts | Inline alert: **"Too many attempts. Request a new code before trying again."** |
| Resend before 60 seconds | Keep resend disabled and show **"You can request another code in {time}."** |
| Email delivery unavailable | Do not mark email verified. Show **"We couldn't send the verification email. Try again later or contact support."** Log a redacted delivery error; never log OTP or token. |
| Network/service error | Keep the current screen and entered address; show **"We couldn't reach the service. Check your connection and try again."** |
| Unverified POST to post/apply | API returns 403 with a stable `EMAIL_VERIFICATION_REQUIRED` code. UI explains email verification is required and links to verification. |
| Verified email, unverified phone | Allow post/apply. Do not show an authorization error because of phone state. |
| Already verified email | Redirect to the requested destination or account; do not ask for another code. |

## Rules and Edge Cases
- Registration still requires a unique E.164 phone number and age 18+; phone OTP confirmation is optional.
- Email verification is required for every restricted action, including posting, applying, and other actions already gated by verified-user access.
- Verification claims in access tokens must refresh after email verification so the new permission takes effect without requiring the user to sign out and back in.
- A user who changes or loses access to their email needs a separately specified account-recovery process; do not provide an unverified email-change shortcut in this feature.
- Phone verification may be offered later if an SMS provider is configured, but it must not become a gate unless the product owner changes this rule.
- Existing accounts with verified email remain eligible even when `phoneVerified=false`.
- Admin status does not bypass email verification for an admin login.

## Out of Scope
- Removing the phone-number registration field.
- SMS provider integration or phone-number change flow.
- Password-reset delivery, email changes, and account recovery.

## Acceptance Criteria
- The same eligibility rule is enforced in API guards and reflected in all web entry points.
- Email-unverified users receive consistent 403 handling and a usable verification path.
- Email-verified users with `phoneVerified=false` can post and apply.
- OTP resend, expiry, attempt-limit, delivery-failure, and network states have explicit UI behavior.
- Tests cover the positive email-only path, unverified-email rejection, and optional phone state.
- No UI or API response claims that phone verification is complete when it is not.
