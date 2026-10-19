'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema } from '@gigs/shared/schemas';
import { z } from 'zod';
import { API_BASE } from '@/lib/api';

const formSchema = resetPasswordSchema
  .pick({ password: true })
  .extend({ confirmPassword: z.string() })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({ code: 'custom', message: 'Passwords do not match', path: ['confirmPassword'] });
    }
  });

type FormData = z.infer<typeof formSchema>;

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenLoaded, setTokenLoaded] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(formSchema), mode: 'onBlur' });

  useEffect(() => {
    const resetToken = new URLSearchParams(window.location.hash.slice(1)).get('token');
    setToken(resetToken);
    setTokenLoaded(true);
    if (resetToken) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  async function onSubmit(data: FormData) {
    if (!token) {
      setServerError('This reset link is missing or invalid. Request a new one to continue.');
      return;
    }

    setServerError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: data.password }),
      });
      const body = await response.json() as { error?: string };

      if (!response.ok) {
        setServerError(body.error ?? 'This reset link is invalid or expired. Request a new one to continue.');
        return;
      }

      setToken(null);
      setComplete(true);
    } catch {
      setServerError('We could not reach the service. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link href="/login" className="mb-4 inline-flex text-sm text-gray-500 hover:text-brand-600">
          Back to sign in
        </Link>
        <h1 className="mb-1 text-2xl font-bold text-brand-700">Choose a new password</h1>
        {complete ? (
          <div className="mt-6 space-y-4">
            <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">Your password has been updated.</p>
            <Link href="/login" className="text-sm text-brand-600 hover:underline">Sign in</Link>
          </div>
        ) : !tokenLoaded ? (
          <p className="mt-6 text-sm text-gray-500">Loading reset link…</p>
        ) : !token ? (
          <div className="mt-6 space-y-4">
            <p role="alert" className="text-sm text-gray-600">This reset link is missing or invalid. Request a new one to continue.</p>
            <Link href="/forgot-password" className="text-sm text-brand-600 hover:underline">Request a new reset link</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 flex flex-col gap-4">
            <p className="text-sm text-gray-500">Choose a password with at least 8 characters.</p>
            {serverError && (
              <div className="space-y-2">
                <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
                <Link href="/forgot-password" className="text-sm text-brand-600 hover:underline">
                  Request a new reset link
                </Link>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">New password</label>
              <input {...register('password')} id="password" type="password" autoComplete="new-password" className={inputCls(!!errors.password)} />
              {errors.password && <p role="alert" className="text-xs text-red-600">{errors.password.message}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">Confirm new password</label>
              <input {...register('confirmPassword')} id="confirmPassword" type="password" autoComplete="new-password" className={inputCls(!!errors.confirmPassword)} />
              {errors.confirmPassword && <p role="alert" className="text-xs text-red-600">{errors.confirmPassword.message}</p>}
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {isSubmitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function inputCls(hasError: boolean) {
  return [
    'rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500',
    hasError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300',
  ].join(' ');
}