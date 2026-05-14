'use client';

/**
 * /verify — Email OTP verification.
 *
 * Guard:
 *  - No user in auth context → redirect to /login.
 *  - User already has emailVerified: true → redirect to /account.
 *
 * Flow: user enters 6-digit code → POST /auth/verify-otp?channel=email.
 * On success, perform a silent refresh to get a fresh token that carries the
 * updated emailVerified flag, then redirect to /account.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, silentRefresh } from '@/lib/api';

export default function VerifyPage() {
  const router = useRouter();
  const { user, loading, refreshUser } = useAuth();

  const [code, setCode] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.emailVerified) { router.replace('/account'); }
  }, [user, loading, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const res = await apiFetch('/auth/verify-otp?channel=email', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });

      const body = (await res.json()) as { verified?: boolean; error?: string };

      if (!res.ok || !body.verified) {
        setSubmitError(body.error ?? 'Incorrect code. Please try again.');
        return;
      }

      // Refresh token so the new emailVerified flag is reflected in auth state.
      await silentRefresh();
      await refreshUser();
      router.push('/account');
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onResend() {
    setResendMsg(null);
    setResending(true);
    try {
      const res = await apiFetch('/auth/resend-otp?channel=email', { method: 'POST' });
      const body = (await res.json()) as { message?: string; _dev?: { code?: string }; error?: string };
      if (body._dev?.code) {
        console.info('[DEV] Resent OTP code:', body._dev.code);
      }
      setResendMsg(res.ok ? 'A new code has been sent.' : (body.error ?? 'Failed to resend.'));
    } catch {
      setResendMsg('Network error. Could not resend.');
    } finally {
      setResending(false);
    }
  }

  if (loading || !user) return null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-brand-700 mb-1">Verify your email</h1>
        <p className="text-sm text-gray-500 mb-6">
          Enter the 6-digit code sent to <strong>{user.email}</strong>.
        </p>

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {submitError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </p>
          )}

          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="rounded-md border border-gray-300 px-3 py-3 text-center text-2xl tracking-widest outline-none focus:ring-2 focus:ring-brand-500"
          />

          <button
            type="submit"
            disabled={isSubmitting || code.length < 4}
            className="rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {isSubmitting ? 'Verifying…' : 'Verify'}
          </button>
        </form>

        <div className="mt-4 text-center">
          {resendMsg && <p className="text-sm text-gray-600 mb-2">{resendMsg}</p>}
          <button
            onClick={onResend}
            disabled={resending}
            className="text-sm text-brand-600 hover:underline disabled:opacity-50"
          >
            {resending ? 'Sending…' : 'Resend code'}
          </button>
        </div>
      </div>
    </main>
  );
}
