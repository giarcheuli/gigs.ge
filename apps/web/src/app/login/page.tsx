'use client';

/**
 * /login — Returning user authentication.
 *
 * useSearchParams requires a Suspense boundary in Next.js 14 App Router.
 * The form is extracted into LoginForm; the page shell wraps it in <Suspense>.
 */

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@gigs/shared/schemas';
import { z } from 'zod';
import { useAuth } from '@/lib/auth-context';
import type { AuthUser } from '@/lib/auth-context';
import { setAccessToken } from '@/lib/api';

type FormData = z.infer<typeof loginSchema>;

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: FormData) {
    setServerError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`${BASE}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      const body = (await res.json()) as {
        accessToken?: string;
        user?: AuthUser;
        error?: string;
      };

      if (!res.ok) {
        setServerError(body.error ?? 'Invalid email or password.');
        return;
      }

      if (body.accessToken && body.user) {
        setAccessToken(body.accessToken);
        login(body.accessToken, body.user);
        // Only follow ?next= for same-origin relative paths (open-redirect protection).
        const next = searchParams.get('next');
        const safeDest = next && next.startsWith('/') ? next : '/account';
        router.push(safeDest);
      }
    } catch {
      setServerError('Network error. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {serverError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Email address</label>
        <input
          {...register('email')}
          type="email"
          autoComplete="email"
          className={inputCls(!!errors.email)}
        />
        {errors.email && (
          <p role="alert" className="text-xs text-red-600">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Password</label>
        <input
          {...register('password')}
          type="password"
          autoComplete="current-password"
          className={inputCls(!!errors.password)}
        />
        {errors.password && (
          <p role="alert" className="text-xs text-red-600">
            {errors.password.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-2 rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
      >
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-brand-700 mb-1">Sign in</h1>
        <p className="text-sm text-gray-500 mb-6">
          New here?{' '}
          <Link href="/register" className="text-brand-600 hover:underline">
            Create account
          </Link>
        </p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
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
