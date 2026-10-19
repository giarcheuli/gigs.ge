'use client';

/**
 * /gigs/[id] — Gig detail page.
 *
 * Renders differently based on the viewer:
 *
 * Requires login: logged-out visitors are sent to /login and returned here.
 *
 *  Unverified user:
 *    - Sees the gig. Fields hidden based on the poster's remaining privacy settings.
 *    - CTA: verify email to apply.
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
import { priceLabel as boardPriceLabel } from '@/components/gig-board';
import { WORKER_FEE_RATE } from '@gigs/shared/constants';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Gig {
  id: string;
  posterId: string;
  title?: string | null;
  shortDescription: string;
  longDescription: string | null;
  workersNeeded?: number;
  regionId: number;
  cityId: number | null;
  region?: { id: number; nameEn: string } | null;
  city?: { id: number; nameEn: string } | null;
  streetAddress: string | null;
  priceType: 'fixed' | 'range' | 'negotiable';
  priceFixed: string | null;
  priceRangeMin: string | null;
  priceRangeMax: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  status: string;
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
  withdrawalCount?: number;
  contract?: { id: string } | null;
}

// Mirrors MAX_APPLICATION_WITHDRAWALS on the API: one re-apply, then the second withdrawal is final.
const MAX_WITHDRAWALS = 2;

const REGION_FALLBACK = (regionId: number) => `Region ${regionId}`;

// ── Page component ─────────────────────────────────────────────────────────────

export default function GigDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const qc = useQueryClient();

  const isVerified = Boolean(user?.emailVerified);

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(`/gigs/${params.id}`)}`);
    }
  }, [loading, user, router, params.id]);

  // ── Fetch gig ──
  const {
    data: gig,
    isLoading,
    isError,
  } = useQuery<Gig>({
    queryKey: ['gig', params.id],
    enabled: Boolean(user),
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
  const [choosingFor, setChoosingFor] = useState<string | null>(null);
  const acceptMutation = useMutation({
    mutationFn: async ({ applicationId, declineOthers }: { applicationId: string; declineOthers: boolean }) => {
      const res = await apiFetch(`/applications/${applicationId}/accept`, {
        method: 'POST',
        body: JSON.stringify({ declineOthers }),
      });
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

  // ── Withdraw application mutation ──
  const withdrawMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await apiFetch(`/applications/${applicationId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? 'Failed to withdraw application');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-applications'] });
    },
    onError: (err: Error) => {
      setApplyError(err.message);
    },
  });

  function confirmWithdraw(application: Application) {
    const isFinal = (application.withdrawalCount ?? 0) + 1 >= MAX_WITHDRAWALS;
    const message = isFinal
      ? 'This is your final withdrawal. You will not be able to apply to this gig again. Withdraw anyway?'
      : 'Withdraw your application? You can apply again once.';
    if (window.confirm(message)) withdrawMutation.mutate(application.id);
  }

  if (loading || !user || isLoading) {
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
          <Link href="/" className="text-brand-600 hover:underline text-sm mt-2 inline-block">
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

  const priceLabel = () =>
    gig.priceType === 'negotiable' ? '💬 Negotiable — discuss in person' : boardPriceLabel(gig);

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
            <h1 className="text-xl font-bold text-gray-900">{gig.title ?? gig.shortDescription}</h1>
            <StatusBadge status={gig.status} />
          </div>

          {gig.title && <p className="text-gray-800 text-sm font-medium">{gig.shortDescription}</p>}

          {gig.longDescription && (
            <p className="text-gray-700 text-sm whitespace-pre-wrap">{gig.longDescription}</p>
          )}

          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Row label="Region" value={gig.region?.nameEn ?? REGION_FALLBACK(gig.regionId)} />

            {gig.city && <Row label="City" value={gig.city.nameEn} />}

            <Row label="Workers needed" value={String(gig.workersNeeded ?? 1)} />

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
            <p className="text-lg font-semibold text-brand-700">{priceLabel()}</p>
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
                      {app.status === 'pending' && gig.status === 'active' && (() => {
                        const otherPending = applications.filter((a) => a.status === 'pending' && a.id !== app.id).length;
                        if (choosingFor === app.id) {
                          return (
                            <div className="shrink-0 flex flex-col items-end gap-1.5 text-right">
                              <p className="text-xs text-gray-600">
                                Decline the other {otherPending} pending applicant{otherPending === 1 ? '' : 's'}?
                              </p>
                              <button
                                onClick={() => acceptMutation.mutate({ applicationId: app.id, declineOthers: true })}
                                disabled={acceptMutation.isPending}
                                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                              >
                                Hire and decline others
                              </button>
                              <button
                                onClick={() => acceptMutation.mutate({ applicationId: app.id, declineOthers: false })}
                                disabled={acceptMutation.isPending}
                                className="rounded-lg border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
                              >
                                Hire and keep others
                              </button>
                              <button onClick={() => setChoosingFor(null)} className="text-xs text-gray-500 hover:text-gray-700">
                                Cancel
                              </button>
                            </div>
                          );
                        }
                        return (
                          <button
                            onClick={() => (otherPending > 0
                              ? setChoosingFor(app.id)
                              : acceptMutation.mutate({ applicationId: app.id, declineOthers: false }))}
                            disabled={acceptMutation.isPending}
                            className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
                          >
                            {acceptMutation.isPending ? 'Accepting…' : 'Accept'}
                          </button>
                        );
                      })()}
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
            {myApplicationForThisGig && myApplicationForThisGig.status !== 'withdrawn' ? (
              <div>
                <p className="text-sm font-medium text-gray-700">
                  You&apos;ve applied for this gig.
                </p>
                <ApplicationStatusBadge status={myApplicationForThisGig.status} />
                <div className="mt-3 space-y-2">
                  {myApplicationForThisGig.contract && (
                    <Link
                      href={`/contracts/${myApplicationForThisGig.contract.id}`}
                      className="block text-sm text-brand-600 hover:underline"
                    >
                      View contract →
                    </Link>
                  )}
                  {myApplicationForThisGig.status === 'pending' && (
                    <button
                      onClick={() => confirmWithdraw(myApplicationForThisGig)}
                      disabled={withdrawMutation.isPending}
                      className="block text-sm text-red-600 hover:underline disabled:opacity-60"
                    >
                      {withdrawMutation.isPending ? 'Withdrawing…' : 'Withdraw application'}
                    </button>
                  )}
                  <Link
                    href="/"
                    className="block text-sm text-gray-500 hover:text-brand-600"
                  >
                    ← Go back to list of gigs
                  </Link>
                </div>
              </div>
            ) : myApplicationForThisGig && (myApplicationForThisGig.withdrawalCount ?? 0) >= MAX_WITHDRAWALS ? (
              <p className="text-sm text-gray-600">
                You withdrew from this gig twice, so you can&apos;t apply to it again.
              </p>
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
                {myApplicationForThisGig ? 'Apply again' : 'Apply for this gig'}
              </button>
            )}
          </section>
        )}

        {/* ── Prompt unverified users ── */}
        {!isPoster && !isVerified && gig.status === 'active' && (
          <section className="bg-white rounded-xl p-6 border border-gray-100 text-center">
            <p className="text-sm text-gray-600 mb-3">
              Verify your email to apply for gigs. Phone verification is optional.
            </p>
            <Link
              href={`/verify?next=${encodeURIComponent(`/gigs/${gig.id}`)}`}
              className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Verify email
            </Link>
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
      <Link href="/" className="text-gray-500 hover:text-brand-600 text-sm">
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
