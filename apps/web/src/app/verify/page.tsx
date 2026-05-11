'use client';

/**
 * /verify — Email OTP verification.
 *
 * Requires the user to be logged in (just registered, or resuming a session
 * where email is still unverified). If email is already verified, redirects
 * to /account immediately.
 *
 * DEV seam: the API returns `_dev.code` in the resend response and
 * `_dev.emailCode` in the register response. These are logged to the console
 * so testers can complete the flow without real email delivery.
 *
 * On successful verification, calls /auth/refresh to obtain a fresh access
 * token with emailVerified: true, then redirects to /account.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, silentRefresh, getAccessToken } from '@/lib/api';

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export default function VerifyPage() {
  const router = useRouter();
  const { user, accessToken, loading, login, refreshUser } = useAuth();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  // Redirect if not logged in, or if email is already verified.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.emailVerified) {
      router.replace('/account');
    }
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError('Please enter the verification code.');
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await apiFetch('/auth/verify-otp?channel=email', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() }),
      });

      if (res.ok) {
        // Refresh the token so the new emailVerified: true claim is included.
        const refreshed = await silentRefresh();
        if (refreshed) {
          const newToken = getAccessToken();
          if (newToken) {
            // Fetch updated user profile
            const meRes = await fetch(`${BASE}/api/v1/auth/me`, {
              headers: { Authorization: `Bearer ${newToken}` },
              credentials: 'include',
            });
            if (meRes.ok) {
              const meData = (await meRes.json()) as { user: Parameters<typeof login>[1] };
              login(newToken, meData.user);
            }
          }
        } else {
          // Fallback: just refresh user data without a new token
          await refreshUser();
        }
        setSuccess(true);
        setTimeout(() => router.push('/account'), 1200);
      } else {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? 'Invalid code. Please try again.');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    setResendMessage(null);
    setError(null);
    setIsResending(true);

    try {
      const res = await apiFetch('/auth/resend-otp?channel=email', {
        method: 'POST',
      });

      const body = (await res.json()) as {
        message?: string;
        error?: string;
        _dev?: { code: string };
      };

      if (res.ok) {
        // DEV-ONLY seam — remove before public demo
        if (body._dev) {
          console.info('[DEV] New Email OTP:', body._dev.code);
        }
        setResendMessage('A new code has been sent to your email address.');
      } else {
        setError(body.error ?? 'Could not resend code. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsResending(false);
    }
  }

  if (loading || !user) return null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-brand-700 mb-1">Verify your email</h1>
        <p className="text-sm text-gray-500 mb-6">
          We sent a 6-digit code to <strong>{user.email}</strong>. Enter it below to confirm
          your email address.
        </p>

        {success ? (
          <p className="rounded-md bg-green-50 px-3 py-3 text-sm font-medium text-green-700">
            ✓ Email verified! Redirecting…
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            {resendMessage && (
              <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
                {resendMessage}
              </p>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Verification code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                className="rounded-md border border-gray-300 px-3 py-2 text-center text-xl tracking-widest outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="000000"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {isSubmitting ? 'Verifying…' : 'Verify email'}
            </button>
          </form>
        )}

        {!success && (
          <p className="mt-4 text-center text-sm text-gray-500">
            Didn&apos;t receive the code?{' '}
            <button
              onClick={handleResend}
              disabled={isResending}
              className="text-brand-600 hover:underline disabled:opacity-60"
            >
              {isResending ? 'Sending…' : 'Resend code'}
            </button>
          </p>
        )}
      </div>
    </main>
  );
}
