'use client';

/**
 * /gigs — Public gig board.
 *
 * Fetches all active gigs. Visitors see title, region, price preview, expiry.
 * Authenticated verified users also see an "Apply" link on the detail page.
 * Gig cards link to /gigs/[id].
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';

// Region id → name, matches seed order (serial IDs 1–11).
const REGION_NAMES: Record<number, string> = {
  1: 'Tbilisi', 2: 'Adjara', 3: 'Guria', 4: 'Imereti',
  5: 'Kakheti', 6: 'Kvemo Kartli', 7: 'Mtskheta-Mtianeti',
  8: 'Racha-Lechkhumi', 9: 'Samegrelo-Zemo Svaneti',
  10: 'Samtskhe-Javakheti', 11: 'Shida Kartli',
};

interface Gig {
  id: string;
  shortDescription: string;
  regionId: number;
  priceType: 'fixed' | 'range' | 'negotiable';
  priceFixed: string | null;
  priceRangeMin: string | null;
  priceRangeMax: string | null;
  visPrice: string;
  expiresAt: string;
  createdAt: string;
}

interface MyApplication {
  id: string;
  gigId: string;
  status: string;
}

function priceLabel(gig: Gig, isVerified: boolean): string {
  if (gig.priceType === 'negotiable') return '💬 Negotiable';
  if (gig.visPrice === 'public' || isVerified) {
    if (gig.priceType === 'fixed' && gig.priceFixed) return `₾ ${gig.priceFixed}`;
    if (gig.priceType === 'range' && gig.priceRangeMin && gig.priceRangeMax) {
      return `₾ ${gig.priceRangeMin} – ${gig.priceRangeMax}`;
    }
  }
  return '🔒 Price hidden';
}

function expiryLabel(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Expired';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

export default function GigBoardPage() {
  const { user } = useAuth();
  const isVerified = Boolean(user?.emailVerified && user?.phoneVerified);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['gigs', 'active'],
    queryFn: async () => {
      const res = await apiFetch('/gigs');
      if (!res.ok) throw new Error('Failed to load gigs');
      const body = (await res.json()) as { data: Gig[] };
      return body.data;
    },
  });

  // Fetch user's applications to show "Application pending" badges
  const { data: myApplications = [] } = useQuery<MyApplication[]>({
    queryKey: ['my-applications'],
    queryFn: async () => {
      const res = await apiFetch('/applications/mine');
      if (!res.ok) return [];
      const body = (await res.json()) as { data: Array<{ id: string; gig: { id: string }; status: string }> };
      return body.data.map(a => ({ id: a.id, gigId: a.gig.id, status: a.status }));
    },
    enabled: isVerified,
  });

  const myApplicationsByGigId = new Map(myApplications.map(a => [a.gigId, a.status]));

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-brand-700">gigs.ge</Link>
        <nav className="flex gap-3 text-sm">
          {isVerified && (
            <Link
              href="/gigs/new"
              className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              + Post a gig
            </Link>
          )}
          {user ? (
            <Link href="/account" className="px-4 py-2 text-gray-600 hover:text-brand-600 transition-colors">
              My account
            </Link>
          ) : (
            <Link href="/login" className="px-4 py-2 text-gray-600 hover:text-brand-600 transition-colors">
              Sign in
            </Link>
          )}
        </nav>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Available gigs</h1>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-5 animate-pulse h-28" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-red-600 text-sm">Failed to load gigs. Please refresh.</p>
        )}

        {data && data.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg font-medium mb-2">No gigs posted yet</p>
            {isVerified && (
              <Link href="/gigs/new" className="text-brand-600 hover:underline text-sm">
                Be the first to post one →
              </Link>
            )}
          </div>
        )}

        {data && data.length > 0 && (
          <div className="space-y-3">
            {data.map((gig) => {
              const myApplicationStatus = myApplicationsByGigId.get(gig.id);
              return (
                <Link
                  key={gig.id}
                  href={`/gigs/${gig.id}`}
                  className="block bg-white rounded-xl p-5 border border-gray-100 hover:border-brand-200 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-900 line-clamp-2">{gig.shortDescription}</p>
                    {myApplicationStatus && (
                      <span className="shrink-0 rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700 whitespace-nowrap">
                        ✓ Applied
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                    <span>📍 {REGION_NAMES[gig.regionId] ?? `Region ${gig.regionId}`}</span>
                    <span>{priceLabel(gig, isVerified)}</span>
                    <span className="ml-auto text-xs">{expiryLabel(gig.expiresAt)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
