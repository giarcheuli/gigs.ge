'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  const { user, loading } = useAuth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold tracking-tight text-brand-700">gigs.ge</h1>
      <p className="mt-4 text-lg text-gray-600">Find gigs. Get things done.</p>

      {!loading && (
        <div className="mt-8 flex flex-col gap-3 w-full max-w-xs">
          {user ? (
            <Link
              href="/account"
              className="block rounded-lg bg-brand-600 px-4 py-3 text-center font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              My Account
            </Link>
          ) : (
            <>
              <Link
                href="/register"
                className="block rounded-lg bg-brand-600 px-4 py-3 text-center font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                Create account
              </Link>
              <Link
                href="/login"
                className="block rounded-lg border border-brand-600 px-4 py-3 text-center font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      )}
    </main>
  );
}
