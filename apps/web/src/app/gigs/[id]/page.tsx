'use client';

/**
 * /gigs/[id] — Gig detail page.
 *
 * Renders differently based on the viewer:
 *
 *  Visitor / unverified user:
 *    - Sees basic info. Fields hidden based on visibility settings.
 *    - CTA: sign up / verify to apply.
 *
 *  Verified worker (not the poster):
 *    - Sees full visible fields. Apply button (or "Already applied" message).
 *    - Apply opens an inline form with optional message.
 *
 *  Poster (gig owner):
 *    - Sees management section: edit link, shelve, applications list.
 *    - Each application has an "Accept" button (creates contract).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { WORKER_FEE_RATE } from '@gigs/shared/constants';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Gig {
  id: string;
  posterId: string;
  shortDescription: string;
  longDescription: string | null;
  regionId: number;
  cityId: number | null;
  streetAddress: string | null;
  priceType: 'fixed' | 'range' | 'negotiable';
  priceFixed: string | null;
  priceRangeMin: string | null;
  priceRangeMax: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  status: string;
  visPrice: string;
  visCity: string;
  visAddress: string;
  visDates: string;
  expiresAt: string;
  createdAt: string;
}

interface Application {
  id: string;
  applicantId: string;
  status: string;
  message: string | null;
  createdAt: string;
  contract?: { id: string } | null;
}

const REGION_NAMES: Record<number, string> = {
  1: 'Tbilisi', 2: 'Adjara', 3: 'Guria', 4: 'Imereti',
  5: 'Kakheti', 6: 'Kvemo Kartli', 7: 'Mtskheta-Mtianeti',
  8: 'Racha-Lechkhumi', 9: 'Samegrelo-Zemo Svaneti',
  10: 'Samtskhe-Javakheti', 11: 'Shida Kartli',
};

// ── Page component ─────────────────────────────────────────────────────────────

export default function GigDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const qc = useQueryClient();

  const isVerified = Boolean(user?.emailVerified && user?.phoneVerified);

  // ── Fetch gig ──
  const {
    data: gig,
    isLoading,
    isError,
  } = useQuery<Gig>({
    queryKey: ['gig', params.id],
    queryFn: async () => {
      const res = await apiFetch(`/gigs/${params.id}`);
      if (!res.ok) throw new Error('Not found');
      const body = (await res.json()) as { gig: Gig };
      return body.gig;
    },
  });

  const isPoster = Boolean(user && gig && user.id === gig.posterId);

  // ── Fetch applications (poster only) ──
  const { data: applications = [] } = useQuery<Application[]>({
    queryKey: ['gig-applications', params.id],
    enabled: isPoster,
    queryFn: async () => {
      const res = await apiFetch(`/applications/gig/${params.id}`);
      if (!res.ok) return [];
      const body = (await res.json()) as { data: Application[] };
      return body.data;
    },
  });

  // ── Fetch my applications (to check if already applied) ──
  const { data: myApplications = [] } = useQuery<Application[]>({
    queryKey: ['my-applications'],
    enabled: isVerified && !isPoster,
    queryFn: async () => {
      const res = await apiFetch('/applications/mine');
      if (!res.ok) return [];
      const body = (await res.json()) as {
        data: Array<Application & { gig: Gig }>;
      };
      return body.data;
    },
  });

  const myApplicationForThisGig = myApplications.find(
    (a) => (a as Application & { gigId?: string }).gigId === params.id ||
            (a as Application & { gig?: { id: string } }).gig?.id === params.id
  );

  // ── Apply mutation ──
  const [applyMessage, setApplyMessage] = useState('');
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/applications', {
        method: 'POST',
        body: JSON.stringify({ gigId: params.id, message: applyMessage || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? 'Failed to submit application');
      }
      return res.json();
    },
    onSuccess: () => {
      setShowApplyForm(false);
      setApplyMessage('');
      qc.invalidateQueries({ queryKey: ['my-applications'] });
    },
    onError: (err: Error) => {
      setApplyError(err.message);
    },
  });

  // ── Accept application mutation ──
  const acceptMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await apiFetch(`/applications/${applicationId}/accept`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? 'Failed to accept application');
      }
      return res.json() as Promise<{ contract: { id: string } }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['gig-applications', params.id] });
      router.push(`/contracts/${data.contract.id}`);
    },
  });

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-8 animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
        </div>
      </main>
    );
  }

  if (isError || !gig) {
    return (
      <main className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-8 text-center text-gray-500">
          <p className="text-lg font-medium">Gig not found</p>
          <Link href="/gigs" className="text-brand-600 hover:underline text-sm mt-2 inline-block">
            ← Back to board
          </Link>
        </div>
      </main>
    );
  }

  const canSeeField = (vis: string) => {
    if (vis === 'public') return true;
    if (vis === 'authenticated' && user) return true;
    if (vis === 'verified' && isVerified) return true;
    return false;
  };

  const priceLabel = () => {
    if (gig.priceType === 'negotiable') return '💬 Negotiable — discuss in person';
    if (!canSeeField(gig.visPrice)) return null; // locked
    if (gig.priceType === 'fixed' && gig.priceFixed) return `₾ ${gig.priceFixed}`;
    if (gig.priceType === 'range' && gig.priceRangeMin && gig.priceRangeMax) {
      return `₾ ${gig.priceRangeMin} – ₾ ${gig.priceRangeMax}`;
    }
    return null;
  };

  const workerFee =
    gig.priceType === 'fixed' && gig.priceFixed
      ? (Number(gig.priceFixed) * WORKER_FEE_RATE).toFixed(2)
      : null;

  return (
    <main className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Main gig card */}
        <section className="bg-white rounded-xl p-6 border border-gray-100 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-bold text-gray-900">{gig.shortDescription}</h1>
            <StatusBadge status={gig.status} />
          </div>

          {gig.longDescription && (
            <p className="text-gray-700 text-sm whitespace-pre-wrap">{gig.longDescription}</p>
          )}

          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Row label="Region" value={REGION_NAMES[gig.regionId] ?? `Region ${gig.regionId}`} />

            {canSeeField(gig.visCity) && gig.cityId ? (
              <Row label="City" value={`City #${gig.cityId}`} />
            ) : !canSeeField(gig.visCity) ? (
              <Row label="City" value="🔒 Verified users only" muted />
            ) : null}

            {canSeeField(gig.visAddress) && gig.streetAddress ? (
              <Row label="Address" value={gig.streetAddress} />
            ) : !canSeeField(gig.visAddress) ? (
              <Row label="Address" value="🔒 On request" muted />
            ) : null}

            {canSeeField(gig.visDates) && gig.availableFrom ? (
              <Row label="From" value={fmtDate(gig.availableFrom)} />
            ) : null}

            {canSeeField(gig.visDates) && gig.availableTo ? (
              <Row label="Until" value={fmtDate(gig.availableTo)} />
            ) : null}

            <Row label="Expires" value={fmtDate(gig.expiresAt)} />
          </dl>

          {/* Price */}
          <div className="pt-2 border-t border-gray-100">
            {priceLabel() ? (
              <p className="text-lg font-semibold text-brand-700">{priceLabel()}</p>
            ) : (
              <p className="text-sm text-gray-400">🔒 Price visible to verified users</p>
            )}
            {workerFee && isVerified && !isPoster && (
              <p className="text-xs text-gray-400 mt-1">
                Service fee upon completion: ₾ {workerFee} (2%)
              </p>
            )}
          </div>
        </section>

        {/* ── Poster management ── */}
        {isPoster && (
          <section className="bg-white rounded-xl p-6 border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Manage gig</h2>
              {gig.status === 'draft' && (
                <Link
                  href={`/gigs/${gig.id}/edit`}
                  className="text-sm text-brand-600 hover:underline"
                >
                  Edit draft →
                </Link>
              )}
            </div>

            <h3 className="text-sm font-medium text-gray-700">
              Applications ({applications.length})
            </h3>

            {applications.length === 0 ? (
              <p className="text-sm text-gray-400">No applications yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {applications.map((app) => (
                  <li key={app.id} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400">Applied {fmtDate(app.createdAt)}</p>
                        {app.message && (
                          <p className="text-sm text-gray-700 mt-1">&ldquo;{app.message}&rdquo;</p>
                        )}
                        <ApplicationStatusBadge status={app.status} />
                      </div>
                      {app.status === 'pending' && gig.status === 'active' && (
                        <button
                          onClick={() => acceptMutation.mutate(app.id)}
                          disabled={acceptMutation.isPending}
                          className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
                        >
                          {acceptMutation.isPending ? 'Accepting…' : 'Accept'}
                        </button>
                      )}
                      {app.contract && (
                        <Link
                          href={`/contracts/${app.contract.id}`}
                          className="shrink-0 text-sm text-brand-600 hover:underline"
                        >
                          View contract →
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── Worker apply section ── */}
        {!isPoster && isVerified && gig.status === 'active' && (
          <section className="bg-white rounded-xl p-6 border border-gray-100 space-y-3">
            {myApplicationForThisGig ? (
              <div>
                <p className="text-sm font-medium text-gray-700">
                  You&apos;ve already applied for this gig.
                </p>
                <ApplicationStatusBadge status={myApplicationForThisGig.status} />
                {myApplicationForThisGig.contract && (
                  <Link
                    href={`/contracts/${myApplicationForThisGig.contract.id}`}
                    className="mt-2 inline-block text-sm text-brand-600 hover:underline"
                  >
                    View contract →
                  </Link>
                )}
              </div>
            ) : showApplyForm ? (
              <div className="space-y-3">
                <h2 className="font-semibold text-gray-800">Apply</h2>
                {applyError && (
                  <p role="alert" className="text-xs text-red-600">{applyError}</p>
                )}
                <textarea
                  value={applyMessage}
                  onChange={(e) => setApplyMessage(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Add a message to the poster (optional)…"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y outline-none focus:ring-2 focus:ring-brand-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => applyMutation.mutate()}
                    disabled={applyMutation.isPending}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
                  >
                    {applyMutation.isPending ? 'Sending…' : 'Submit application'}
                  </button>
                  <button
                    onClick={() => setShowApplyForm(false)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setApplyError(null); setShowApplyForm(true); }}
                className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                Apply for this gig
              </button>
            )}
          </section>
        )}

        {/* ── Prompt unverified users ── */}
        {!isPoster && !isVerified && gig.status === 'active' && (
          <section className="bg-white rounded-xl p-6 border border-gray-100 text-center">
            {!user ? (
              <>
                <p className="text-sm text-gray-600 mb-3">Sign in to apply for this gig.</p>
                <Link
                  href={`/login?next=/gigs/${gig.id}`}
                  className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
                >
                  Sign in
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-3">
                  Verify your email and phone to apply for gigs.
                </p>
                <Link
                  href="/verify"
                  className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
                >
                  Verify account
                </Link>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="bg-white border-b px-4 py-4">
      <Link href="/gigs" className="text-gray-500 hover:text-brand-600 text-sm">
        ← Back to board
      </Link>
    </header>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <>
      <dt className="text-xs text-gray-400 font-medium">{label}</dt>
      <dd className={`text-sm ${muted ? 'text-gray-400' : 'text-gray-700'}`}>{value}</dd>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    draft: 'bg-yellow-100 text-yellow-700',
    shelf: 'bg-gray-100 text-gray-600',
    expired: 'bg-red-100 text-red-600',
    cancelled: 'bg-red-100 text-red-600',
    archived: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function ApplicationStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'text-yellow-600',
    accepted: 'text-green-600',
    rejected: 'text-red-500',
    closed: 'text-gray-400',
    withdrawn: 'text-gray-400',
  };
  const labels: Record<string, string> = {
    pending: 'Application pending',
    accepted: 'Application accepted',
    rejected: 'Application rejected',
    closed: 'Application closed',
    withdrawn: 'Withdrawn',
  };
  return (
    <span className={`mt-1 inline-block text-xs font-medium ${map[status] ?? 'text-gray-400'}`}>
      {labels[status] ?? status}
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
