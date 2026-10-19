'use client';

/**
 * Public gig board, rendered on the homepage for everyone.
 *
 * Cards show title, short description, location, and price, which are public for every gig.
 * Opening a gig requires login, so visitors' card links go straight to /login and return to the gig.
 * Filters run on the server; pages load as the user scrolls, with a "Load more" button as a fallback.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';

interface Place {
  id: number;
  nameEn: string;
}

interface Region extends Place {
  cities: Place[];
}

export interface BoardGig {
  id: string;
  title?: string | null;
  shortDescription: string;
  workersNeeded?: number;
  regionId: number;
  region?: Place | null;
  city?: Place | null;
  priceType: 'fixed' | 'range' | 'negotiable';
  priceFixed: string | null;
  priceRangeMin: string | null;
  priceRangeMax: string | null;
  expiresAt: string;
}

interface BoardPage {
  data: BoardGig[];
  nextCursor: string | null;
}

interface Filters {
  regionId: string;
  cityId: string;
  priceMin: string;
  priceMax: string;
}

interface MyApplication {
  gigId: string;
  status: string;
}

const EMPTY_FILTERS: Filters = { regionId: '', cityId: '', priceMin: '', priceMax: '' };

export function priceLabel(gig: Pick<BoardGig, 'priceType' | 'priceFixed' | 'priceRangeMin' | 'priceRangeMax'>): string {
  if (gig.priceType === 'fixed' && gig.priceFixed) return `₾ ${gig.priceFixed}`;
  if (gig.priceType === 'range' && gig.priceRangeMin && gig.priceRangeMax) {
    return `₾ ${gig.priceRangeMin} – ${gig.priceRangeMax}`;
  }
  return 'Negotiable';
}

export function locationLabel(gig: Pick<BoardGig, 'regionId' | 'region' | 'city'>): string {
  const region = gig.region?.nameEn ?? `Region ${gig.regionId}`;
  return gig.city ? `${gig.city.nameEn}, ${region}` : region;
}

function expiryLabel(expiresAt: string): string {
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Expired';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

function boardQueryString(filters: Filters, cursor: string | undefined): string {
  const params = new URLSearchParams();
  if (filters.regionId) params.set('regionId', filters.regionId);
  if (filters.cityId) params.set('cityId', filters.cityId);
  if (filters.priceMin) params.set('priceMin', filters.priceMin);
  if (filters.priceMax) params.set('priceMax', filters.priceMax);
  if (cursor) params.set('cursor', cursor);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function GigBoard() {
  const { user, loading } = useAuth();
  const isVerified = Boolean(user?.emailVerified);

  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ['regions'],
    queryFn: async () => {
      const res = await apiFetch('/regions');
      if (!res.ok) return [];
      const body = (await res.json()) as { data: Region[] };
      return body.data;
    },
    staleTime: Infinity,
  });

  const citiesForRegion = regions.find((r) => String(r.id) === draft.regionId)?.cities ?? [];
  const priceRangeInvalid = Boolean(draft.priceMin && draft.priceMax && Number(draft.priceMin) > Number(draft.priceMax));

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['gigs', 'active', filters],
    queryFn: async ({ pageParam }) => {
      const res = await apiFetch(`/gigs${boardQueryString(filters, pageParam)}`);
      if (!res.ok) throw new Error('Failed to load gigs');
      return (await res.json()) as BoardPage;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: '200px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { data: myApplications = [] } = useQuery<MyApplication[]>({
    queryKey: ['my-applications'],
    queryFn: async () => {
      const res = await apiFetch('/applications/mine');
      if (!res.ok) return [];
      const body = (await res.json()) as { data: Array<{ gig: { id: string }; status: string }> };
      return body.data.map((a) => ({ gigId: a.gig.id, status: a.status }));
    },
    enabled: isVerified,
  });

  const appliedGigIds = new Set(myApplications.filter((a) => a.status !== 'withdrawn').map((a) => a.gigId));
  const gigs = data?.pages.flatMap((page) => page.data) ?? [];
  const hasActiveFilters = Object.values(filters).some(Boolean);

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    if (!priceRangeInvalid) setFilters(draft);
  }

  function clearFilters() {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-brand-700">gigs.ge</Link>
        <nav className="flex gap-2 text-sm">
          {isVerified && (
            <Link
              href="/gigs/new"
              className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              + Post a gig
            </Link>
          )}
          {user ? (
            <Link href="/account" className="px-3 py-2 text-gray-600 hover:text-brand-600 transition-colors">
              My account
            </Link>
          ) : !loading && (
            <>
              <Link href="/login" className="px-3 py-2 text-gray-600 hover:text-brand-600 transition-colors">
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                Create account
              </Link>
            </>
          )}
        </nav>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Available gigs</h1>
        {!loading && !user && (
          <p className="mt-1 text-sm text-gray-500">Sign in to see full details and apply.</p>
        )}

        <form
          onSubmit={applyFilters}
          className="mt-4 mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 bg-white rounded-xl p-3 border border-gray-100"
          aria-label="Filter gigs"
        >
          <select
            aria-label="Region"
            value={draft.regionId}
            onChange={(e) => setDraft({ ...draft, regionId: e.target.value, cityId: '' })}
            className="rounded-md border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="">All regions</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.nameEn}</option>)}
          </select>
          <select
            aria-label="City"
            value={draft.cityId}
            onChange={(e) => setDraft({ ...draft, cityId: e.target.value })}
            disabled={citiesForRegion.length === 0}
            className="rounded-md border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-50"
          >
            <option value="">All cities</option>
            {citiesForRegion.map((c) => <option key={c.id} value={c.id}>{c.nameEn}</option>)}
          </select>
          <input
            aria-label="Minimum price"
            inputMode="numeric"
            placeholder="Min ₾"
            value={draft.priceMin}
            onChange={(e) => setDraft({ ...draft, priceMin: e.target.value.replace(/\D/g, '') })}
            className="rounded-md border border-gray-300 px-2 py-2 text-sm"
          />
          <input
            aria-label="Maximum price"
            inputMode="numeric"
            placeholder="Max ₾"
            value={draft.priceMax}
            onChange={(e) => setDraft({ ...draft, priceMax: e.target.value.replace(/\D/g, '') })}
            className="rounded-md border border-gray-300 px-2 py-2 text-sm"
          />
          <div className="col-span-2 sm:col-span-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={priceRangeInvalid}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              Apply filters
            </button>
            {(hasActiveFilters || Object.values(draft).some(Boolean)) && (
              <button type="button" onClick={clearFilters} className="text-sm text-gray-500 hover:text-brand-600">
                Clear
              </button>
            )}
            {priceRangeInvalid && <span role="alert" className="text-xs text-red-600">Min must be ≤ max</span>}
          </div>
        </form>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-5 animate-pulse h-28" />
            ))}
          </div>
        )}

        {isError && <p className="text-red-600 text-sm">Failed to load gigs. Please refresh.</p>}

        {!isLoading && !isError && gigs.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg font-medium mb-2">
              {hasActiveFilters ? 'No gigs match these filters' : 'No gigs posted yet'}
            </p>
            {isVerified && !hasActiveFilters && (
              <Link href="/gigs/new" className="text-brand-600 hover:underline text-sm">
                Be the first to post one →
              </Link>
            )}
          </div>
        )}

        {gigs.length > 0 && (
          <div className="space-y-3">
            {gigs.map((gig) => (
              <Link
                key={gig.id}
                href={user ? `/gigs/${gig.id}` : `/login?next=${encodeURIComponent(`/gigs/${gig.id}`)}`}
                className="block bg-white rounded-xl p-5 border border-gray-100 hover:border-brand-200 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-gray-900 line-clamp-1">{gig.title ?? gig.shortDescription}</p>
                  {appliedGigIds.has(gig.id) && (
                    <span className="shrink-0 rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700 whitespace-nowrap">
                      ✓ Applied
                    </span>
                  )}
                </div>
                {gig.title && (
                  <p className="mt-1 text-sm text-gray-600 line-clamp-2">{gig.shortDescription}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                  <span>📍 {locationLabel(gig)}</span>
                  <span className="font-medium text-brand-700">{priceLabel(gig)}</span>
                  {(gig.workersNeeded ?? 1) > 1 && <span>👥 {gig.workersNeeded} workers</span>}
                  <span className="ml-auto text-xs">{expiryLabel(gig.expiresAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div ref={sentinelRef} aria-hidden="true" />

        {hasNextPage && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-white disabled:opacity-60"
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
