'use client';

/**
 * /register — New user registration.
 *
 * Fields: email, phone (E.164), password, confirm password, date of birth.
 * Client-side age check mirrors the server-side isAtLeast18 rule.
 * Server errors are surfaced per-field where the API provides field context,
 * and at the form level otherwise.
 *
 * On success: stores the access token in auth context and navigates to /verify.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { registerSchema } from '@gigs/shared/schemas';
import { useAuth } from '@/lib/auth-context';
import type { AuthUser } from '@/lib/auth-context';

// Extend the shared schema with confirm-password validation.
const formSchema = registerSchema
  .extend({ confirmPassword: z.string().min(1, 'Please confirm your password') })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine(
    (d) => {
      const dob = new Date(d.dateOfBirth);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 18);
      return dob <= cutoff;
    },
    { message: 'You must be at least 18 years old', path: ['dateOfBirth'] },
  );

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
        _dev?: { emailCode: string; smsCode: string };
      };

      if (!res.ok) {
        const msg = body.error ?? 'Registration failed';
        if (msg.toLowerCase().includes('email')) {
          setError('email', { message: msg });
        } else if (msg.toLowerCase().includes('phone')) {
          setError('phone', { message: msg });
        } else {
          setServerError(msg);
        }
        return;
      }

      if (body.accessToken && body.user) {
        // DEV: log OTP to console so testers can complete verification without email delivery
        if (body._dev) {
          // DEV-ONLY seam — remove before public demo
          console.info('[DEV] Email OTP:', body._dev.emailCode);
        }
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
          Already have an account?{' '}
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
              className={inputClass(!!errors.email)}
            />
          </Field>

          <Field label="Phone number (E.164, e.g. +995555123456)" error={errors.phone?.message}>
            <input
              {...register('phone')}
              type="tel"
              autoComplete="tel"
              placeholder="+995"
              className={inputClass(!!errors.phone)}
            />
          </Field>

          <Field label="Password" error={errors.password?.message}>
            <input
              {...register('password')}
              type="password"
              autoComplete="new-password"
              className={inputClass(!!errors.password)}
            />
          </Field>

          <Field label="Confirm password" error={errors.confirmPassword?.message}>
            <input
              {...register('confirmPassword')}
              type="password"
              autoComplete="new-password"
              className={inputClass(!!errors.confirmPassword)}
            />
          </Field>

          <Field label="Date of birth" error={errors.dateOfBirth?.message}>
            <input
              {...register('dateOfBirth')}
              type="date"
              className={inputClass(!!errors.dateOfBirth)}
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

function inputClass(hasError: boolean) {
  return [
    'rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500',
    hasError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300',
  ].join(' ');
}
