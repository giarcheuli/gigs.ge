'use client';

/**
 * /account — Authenticated user home with three tabs:
 *
 *  Profile  — email, phone, verification status, member since, logout.
 *  My Jobs  — gigs posted by the current user (all statuses).
 *  My Work  — applications submitted by the current user with derived status.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Gig {
  id: string;
  shortDescription: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

interface Contract {
  id: string;
  status: string;
}

interface ApplicationWithGig {
  id: string;
  status: string;
  createdAt: string;
  gig: Gig;
  contract: Contract | null;
}

type Tab = 'profile' | 'my-jobs' | 'my-work';

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login?next=/account');
    }
  }, [user, loading, router]);

  if (loading || !user) return null;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-4 flex items-center justify-between">
        <Link href="/gigs" className="text-xl font-bold text-brand-700">gigs.ge</Link>
        <span className="text-sm text-gray-500 truncate max-w-[180px]">{user.email}</span>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b">
        <nav className="flex max-w-2xl mx-auto px-4">
          {(['profile', 'my-jobs', 'my-work'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                tab === t
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {t === 'profile' ? 'Profile' : t === 'my-jobs' ? 'My Jobs' : 'My Work'}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {tab === 'profile' && <ProfileTab logout={logout} />}
        {tab === 'my-jobs' && <MyJobsTab />}
        {tab === 'my-work' && <MyWorkTab />}
      </div>
    </main>
  );
}

// ── Profile tab ────────────────────────────────────────────────────────────────

function ProfileTab({ logout }: { logout: () => Promise<void> }) {
  const router = useRouter();
  const { user } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  if (!user) return null;

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    router.push('/');
  }

  return (
    <div className="space-y-4">
      {/* Unverified email banner */}
      {!user.emailVerified && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Your email is not verified.{' '}
          <Link href="/verify" className="font-semibold hover:underline">
            Verify now →
          </Link>
        </div>
      )}

      <section className="bg-white rounded-xl p-5 border border-gray-100 space-y-3">
        <Row label="Email">
          <span>{user.email}</span>
          {user.emailVerified ? (
            <VerifiedBadge />
          ) : (
            <UnverifiedBadge />
          )}
        </Row>

        <Row label="Phone">
          <span>{user.phone}</span>
          {user.phoneVerified ? <VerifiedBadge /> : <UnverifiedBadge />}
        </Row>

        <Row label="Member since">
          <span>{fmtDate(user.createdAt)}</span>
        </Row>

        <Row label="Role">
          <span className="capitalize">{user.role}</span>
        </Row>
      </section>

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
      >
        {loggingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}

// ── My Jobs tab ────────────────────────────────────────────────────────────────

function MyJobsTab() {
  const { user } = useAuth();
  const isVerified = Boolean(user?.emailVerified && user?.phoneVerified);

  const { data: gigs = [], isLoading } = useQuery<Gig[]>({
    queryKey: ['my-gigs'],
    queryFn: async () => {
      const res = await apiFetch('/gigs/mine');
      if (!res.ok) return [];
      const body = (await res.json()) as { data: Gig[] };
      return body.data;
    },
  });

  const GIG_STATUS_COLORS: Record<string, string> = {
    draft: 'bg-yellow-100 text-yellow-700',
    active: 'bg-green-100 text-green-700',
    shelf: 'bg-gray-100 text-gray-600',
    expired: 'bg-red-100 text-red-600',
    cancelled: 'bg-red-100 text-red-600',
    archived: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="space-y-3">
      {isVerified && (
        <Link
          href="/gigs/new"
          className="block text-center rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          + Post a new gig
        </Link>
      )}

      {isLoading && <div className="animate-pulse h-20 bg-gray-100 rounded-xl" />}

      {!isLoading && gigs.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">
          {isVerified ? "You haven't posted any gigs yet." : 'Verify your account to post gigs.'}
        </p>
      )}

      {gigs.map((gig) => (
        <Link
          key={gig.id}
          href={`/gigs/${gig.id}`}
          className="block bg-white rounded-xl p-4 border border-gray-100 hover:border-brand-200 transition-all"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900 line-clamp-2">{gig.shortDescription}</p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${GIG_STATUS_COLORS[gig.status] ?? 'bg-gray-100 text-gray-600'}`}
            >
              {gig.status}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Created {fmtDate(gig.createdAt)}</p>
        </Link>
      ))}
    </div>
  );
}

// ── My Work tab ────────────────────────────────────────────────────────────────

function MyWorkTab() {
  const qc = useQueryClient();

  const { data: applications = [], isLoading } = useQuery<ApplicationWithGig[]>({
    queryKey: ['my-applications'],
    queryFn: async () => {
      const res = await apiFetch('/applications/mine');
      if (!res.ok) return [];
      const body = (await res.json()) as { data: ApplicationWithGig[] };
      return body.data;
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/applications/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? 'Failed to withdraw');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-applications'] }),
  });

  // Derive a human-readable status label from application + contract state.
  function workStatusLabel(app: ApplicationWithGig): { label: string; cls: string } {
    if (app.contract) {
      const cs = app.contract.status;
      if (cs === 'draft') return { label: 'Contract draft', cls: 'text-yellow-600' };
      if (cs === 'in_progress') return { label: 'Contract signed — work in progress', cls: 'text-blue-600' };
      if (cs === 'pending_completion') return { label: 'Pending completion', cls: 'text-purple-600' };
      if (cs === 'completed') return { label: 'Work completed ✓', cls: 'text-green-600' };
      if (cs === 'disputed') return { label: 'Disputed', cls: 'text-orange-600' };
      if (cs === 'arbitration') return { label: 'In arbitration', cls: 'text-orange-600' };
      if (cs === 'cancelled') return { label: 'Cancelled', cls: 'text-gray-400' };
      if (cs === 'quit') return { label: 'Quit', cls: 'text-gray-400' };
    }
    if (app.status === 'pending') return { label: 'Application pending', cls: 'text-yellow-600' };
    if (app.status === 'rejected') return { label: 'Application rejected', cls: 'text-red-500' };
    if (app.status === 'closed') return { label: 'Application closed', cls: 'text-gray-400' };
    if (app.status === 'withdrawn') return { label: 'Withdrawn', cls: 'text-gray-400' };
    return { label: app.status, cls: 'text-gray-400' };
  }

  return (
    <div className="space-y-3">
      {isLoading && <div className="animate-pulse h-20 bg-gray-100 rounded-xl" />}

      {!isLoading && applications.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">
          You haven&apos;t applied to any gigs yet.{' '}
          <Link href="/gigs" className="text-brand-600 hover:underline">Browse gigs →</Link>
        </p>
      )}

      {applications.map((app) => {
        const { label, cls } = workStatusLabel(app);
        return (
          <div
            key={app.id}
            className="bg-white rounded-xl p-4 border border-gray-100 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/gigs/${app.gig.id}`}
                className="text-sm font-semibold text-gray-900 hover:text-brand-600 line-clamp-2"
              >
                {app.gig.shortDescription}
              </Link>
              <span className={`shrink-0 text-xs font-medium ${cls}`}>{label}</span>
            </div>

            <p className="text-xs text-gray-400">Applied {fmtDate(app.createdAt)}</p>

            <div className="flex gap-2">
              {app.contract && (
                <Link
                  href={`/contracts/${app.contract.id}`}
                  className="text-xs text-brand-600 hover:underline"
                >
                  View contract →
                </Link>
              )}
              {app.status === 'pending' && (
                <button
                  onClick={() => withdrawMutation.mutate(app.id)}
                  disabled={withdrawMutation.isPending}
                  className="text-xs text-red-500 hover:underline disabled:opacity-50"
                >
                  Withdraw
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 flex items-center gap-1.5">{children}</span>
    </div>
  );
}

function VerifiedBadge() {
  return (
    <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
      Verified
    </span>
  );
}

function UnverifiedBadge() {
  return (
    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
      Unverified
    </span>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
