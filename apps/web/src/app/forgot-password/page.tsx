'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema } from '@gigs/shared/schemas';
import { z } from 'zod';
import { API_BASE } from '@/lib/api';

type FormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(forgotPasswordSchema), mode: 'onBlur' });

  async function onSubmit(data: FormData) {
    setServerError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        setServerError('We could not process that request. Please try again.');
        return;
      }

      setSubmitted(true);
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
        <h1 className="mb-1 text-2xl font-bold text-brand-700">Reset your password</h1>
        {submitted ? (
          <div className="mt-6 space-y-4">
            <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
              If that email is registered, we sent a password reset link.
            </p>
            <Link href="/login" className="text-sm text-brand-600 hover:underline">
              Return to sign in
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-6 text-sm text-gray-500">Enter your account email and we’ll send a reset link if it matches an account.</p>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
              {serverError && (
                <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
              )}
              <div className="flex flex-col gap-1">
                <label htmlFor="email" className="text-sm font-medium text-gray-700">Email address</label>
                <input
                  {...register('email')}
                  id="email"
                  type="email"
                  autoComplete="email"
                  className={inputCls(!!errors.email)}
                />
                {errors.email && <p role="alert" className="text-xs text-red-600">{errors.email.message}</p>}
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {isSubmitting ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
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