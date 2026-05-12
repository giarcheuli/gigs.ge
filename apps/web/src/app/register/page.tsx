'use client';

/**
 * /register — New user registration.
 *
 * Extends the shared registerSchema with a confirmPassword field and a
 * client-side age check (≥ 18). On success, stores the token and redirects
 * to /verify so the user can confirm their email OTP.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema } from '@gigs/shared/schemas';
import { z } from 'zod';
import { useAuth } from '@/lib/auth-context';
import type { AuthUser } from '@/lib/auth-context';
import { setAccessToken } from '@/lib/api';

const formSchema = registerSchema
  .extend({ confirmPassword: z.string() })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      });
    }
    const dob = new Date(data.dateOfBirth);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 18);
    if (dob > cutoff) {
      ctx.addIssue({
        code: 'custom',
        message: 'You must be at least 18 years old',
        path: ['dateOfBirth'],
      });
    }
  });

type FormData = z.infer<typeof formSchema>;

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(formSchema) });

  async function onSubmit(data: FormData) {
    setServerError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`${BASE}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: data.email,
          phone: data.phone,
          password: data.password,
          dateOfBirth: data.dateOfBirth,
        }),
      });

      const body = (await res.json()) as {
        accessToken?: string;
        user?: AuthUser;
        error?: string;
        field?: string;
        _dev?: { emailCode?: string; smsCode?: string };
      };

      if (!res.ok) {
        if (body.field === 'email') {
          setError('email', { message: body.error ?? 'Email already in use' });
        } else if (body.field === 'phone') {
          setError('phone', { message: body.error ?? 'Phone already in use' });
        } else {
          setServerError(body.error ?? 'Registration failed. Please try again.');
        }
        return;
      }

      if (body._dev) {
        console.info('[DEV] OTP codes:', body._dev);
      }

      if (body.accessToken && body.user) {
        setAccessToken(body.accessToken);
        login(body.accessToken, body.user);
        router.push('/verify');
      }
    } catch {
      setServerError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-brand-700 mb-1">Create account</h1>
        <p className="text-sm text-gray-500 mb-6">
          Already have one?{' '}
          <Link href="/login" className="text-brand-600 hover:underline">
            Sign in
          </Link>
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          {serverError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {serverError}
            </p>
          )}

          <Field label="Email address" error={errors.email?.message}>
            <input
              {...register('email')}
              type="email"
              autoComplete="email"
              className={inputCls(!!errors.email)}
            />
          </Field>

          <Field label="Mobile number (E.164, e.g. +995599123456)" error={errors.phone?.message}>
            <input
              {...register('phone')}
              type="tel"
              autoComplete="tel"
              placeholder="+995"
              className={inputCls(!!errors.phone)}
            />
          </Field>

          <Field label="Date of birth" error={errors.dateOfBirth?.message}>
            <input
              {...register('dateOfBirth')}
              type="date"
              className={inputCls(!!errors.dateOfBirth)}
            />
          </Field>

          <Field label="Password" error={errors.password?.message}>
            <input
              {...register('password')}
              type="password"
              autoComplete="new-password"
              className={inputCls(!!errors.password)}
            />
          </Field>

          <Field label="Confirm password" error={errors.confirmPassword?.message}>
            <input
              {...register('confirmPassword')}
              type="password"
              autoComplete="new-password"
              className={inputCls(!!errors.confirmPassword)}
            />
          </Field>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return [
    'rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500',
    hasError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300',
  ].join(' ');
}
