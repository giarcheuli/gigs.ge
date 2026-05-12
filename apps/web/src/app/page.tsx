'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  const { user, loading } = useAuth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-brand-700">gigs.ge</h1>
      <p className="mt-3 text-lg text-gray-500">Find gigs. Get things done.</p>

      <div className="mt-8 flex flex-col gap-3 w-full max-w-xs">
        <Link
          href="/gigs"
          className="rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          Browse gigs
        </Link>

        {!loading && (
          <>
            {user ? (
              <Link
                href="/account"
                className="rounded-lg border border-brand-600 px-6 py-3 font-semibold text-brand-600 hover:bg-brand-50 transition-colors"
              >
                My account
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="rounded-lg border border-brand-600 px-6 py-3 font-semibold text-brand-600 hover:bg-brand-50 transition-colors"
                >
                  Create account
                </Link>
                <Link
                  href="/login"
                  className="text-sm text-gray-500 hover:text-brand-600 transition-colors"
                >
                  Sign in
                </Link>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

