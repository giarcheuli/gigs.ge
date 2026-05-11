'use client';

/**
 * /account — Authenticated user profile view.
 *
 * Client-side route protection: redirects to /login?next=/account if the
 * auth context has no user once the initial loading check is done.
 *
 * Shows: email, phone, email verification status, account creation date.
 * Phone verification status is intentionally not shown in this UAT slice.
 * Profile editing is deferred to a follow-up ticket.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function AccountPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  // Protect the route — redirect unauthenticated visitors.
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login?next=/account');
    }
  }, [user, loading, router]);

  if (loading || !user) return null;

  const createdAt = new Date(user.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  async function handleLogout() {
    await logout();
    router.push('/');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-brand-700">My Account</h1>
          <Link href="/" className="text-sm text-brand-600 hover:underline">
            Home
          </Link>
        </div>

        {!user.emailVerified && (
          <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-3 text-sm text-amber-800">
            <strong>Email not verified.</strong>{' '}
            <Link href="/verify" className="underline hover:text-amber-900">
              Verify now
            </Link>{' '}
            to unlock full access.
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          <Row label="Email">
            <span className="text-sm text-gray-800">{user.email}</span>
            {user.emailVerified ? (
              <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                Verified ✓
              </span>
            ) : (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Unverified
              </span>
            )}
          </Row>

          <Row label="Phone">
            <span className="text-sm text-gray-800">{user.phone}</span>
          </Row>

          <Row label="Member since">
            <span className="text-sm text-gray-800">{createdAt}</span>
          </Row>

          <Row label="Account type">
            <span className="text-sm text-gray-800 capitalize">{user.role}</span>
          </Row>
        </div>

        <button
          onClick={handleLogout}
          className="mt-6 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Log out
        </button>
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}
