'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/gigs');
    }
  }, [user, loading, router]);

  if (loading || user) {
    return null;
  }

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

        <Link
          href="/register"
          className="rounded-lg border border-brand-600 px-6 py-3 font-semibold text-brand-600 hover:bg-brand-50 transition-colors"
        >
          Create account
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}

