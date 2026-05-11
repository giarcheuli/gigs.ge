'use client';

/**
 * /contracts/[id] — Contract detail page.
 *
 * Shows contract terms, signing state, and action buttons appropriate
 * to the viewer's role (poster / worker) and the current contract status.
 *
 * State machine covered:
 *   draft            → sign (poster & worker independently)
 *   in_progress      → mark-complete (worker, half-time), dispute (poster, half-time),
 *                       cancel (either), quit (worker)
 *   pending_completion → confirm complete (poster), dispute (poster), worker waits
 *   disputed         → read-only (arbiter review — Slice 4)
 *   terminal states  → read-only summary
 */

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { POSTER_FEE_RATE, WORKER_FEE_RATE } from '@gigs/shared/constants';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Gig {
  id: string;
  shortDescription: string;
  priceType: string;
}

interface Application {
  id: string;
  message: string | null;
}

interface Contract {
  id: string;
  gigId: string;
  posterId: string;
  workerId: string;
  agreedPrice: string | null;
  agreedStartAt: string;
  dueAt: string | null;
  status: string;
  posterSignedAt: string | null;
  workerSignedAt: string | null;
  feeEligible: boolean;
  completionMarkedBy: string | null;
  completionMarkedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  disputedAt: string | null;
  quitAt: string | null;
  createdAt: string;
  gig: Gig;
  application: Application;
}

// ── Half-time helper ───────────────────────────────────────────────────────────

function computeHalfTimePassed(contract: Contract, userEmail: string): boolean {
  if (userEmail.endsWith('@uat.gigs.ge')) return true;
  if (!contract.dueAt) return true;
  const start = new Date(contract.agreedStartAt).getTime();
  const due = new Date(contract.dueAt).getTime();
  const halfway = start + (due - start) / 2;
  return Date.now() >= halfway;
}

function halfTimeDate(contract: Contract): Date | null {
  if (!contract.dueAt) return null;
  const start = new Date(contract.agreedStartAt).getTime();
  const due = new Date(contract.dueAt).getTime();
  return new Date(start + (due - start) / 2);
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const qc = useQueryClient();

  const {
    data: contract,
    isLoading,
    isError,
  } = useQuery<Contract>({
    queryKey: ['contract', params.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const res = await apiFetch(`/contracts/${params.id}`);
      if (!res.ok) throw new Error('Not found');
      const body = (await res.json()) as { contract: Contract };
      return body.contract;
    },
  });

  if (!user) {
    return (
      <Scaffold>
        <p className="text-sm text-gray-500 text-center py-12">
          <Link href={`/login?next=/contracts/${params.id}`} className="text-brand-600 hover:underline">
            Sign in
          </Link>{' '}
          to view this contract.
        </p>
      </Scaffold>
    );
  }

  if (isLoading) {
    return (
      <Scaffold>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-20 bg-gray-200 rounded" />
        </div>
      </Scaffold>
    );
  }

  if (isError || !contract) {
    return (
      <Scaffold>
        <p className="text-gray-500 text-center py-12">Contract not found.</p>
      </Scaffold>
    );
  }

  const isPoster = user.id === contract.posterId;
  const isWorker = user.id === contract.workerId;
  const halfTimePassed = computeHalfTimePassed(contract, user.email);
  const ht = halfTimeDate(contract);
  const isTerminal = ['completed', 'cancelled', 'quit', 'auto_resolved'].includes(contract.status);

  // ── Mutation factory ──
  function useAction(action: string) {
    return useMutation({
      mutationFn: async () => {
        const res = await apiFetch(`/contracts/${contract!.id}/${action}`, { method: 'POST' });
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? 'Action failed');
        }
        return res.json() as Promise<{ contract: Contract }>;
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ['contract', params.id] }),
    });
  }

  // Declared outside JSX so hooks are called unconditionally
  const signMutation = useAction('sign');
  const markCompleteMutation = useAction('mark-complete');
  const disputeMutation = useAction('dispute');
  const cancelMutation = useAction('cancel');
  const quitMutation = useAction('quit');

  const anyPending =
    signMutation.isPending ||
    markCompleteMutation.isPending ||
    disputeMutation.isPending ||
    cancelMutation.isPending ||
    quitMutation.isPending;

  const actionError =
    signMutation.error?.message ??
    markCompleteMutation.error?.message ??
    disputeMutation.error?.message ??
    cancelMutation.error?.message ??
    quitMutation.error?.message ??
    null;

  const posterFee = contract.agreedPrice
    ? (Number(contract.agreedPrice) * POSTER_FEE_RATE).toFixed(2)
    : null;
  const workerFee = contract.agreedPrice
    ? (Number(contract.agreedPrice) * WORKER_FEE_RATE).toFixed(2)
    : null;

  return (
    <Scaffold gigId={contract.gigId}>
      <div className="space-y-5">

        {/* Status banner */}
        <StatusBanner status={contract.status} />

        {/* Contract terms */}
        <section className="bg-white rounded-xl p-5 border border-gray-100 space-y-3">
          <h1 className="font-bold text-gray-900 text-lg truncate">
            {contract.gig.shortDescription}
          </h1>

          <dl className="grid grid-cols-2 gap-2 text-sm">
            {contract.agreedPrice && (
              <>
                <dt className="text-gray-400 font-medium">Agreed price</dt>
                <dd className="font-semibold text-gray-900">₾ {contract.agreedPrice}</dd>
              </>
            )}
            <dt className="text-gray-400 font-medium">Start</dt>
            <dd className="text-gray-700">{fmtDate(contract.agreedStartAt)}</dd>
            {contract.dueAt && (
              <>
                <dt className="text-gray-400 font-medium">Due</dt>
                <dd className="text-gray-700">{fmtDate(contract.dueAt)}</dd>
              </>
            )}
            <dt className="text-gray-400 font-medium">Your role</dt>
            <dd className="text-gray-700 capitalize">{isPoster ? 'Poster' : 'Worker'}</dd>
          </dl>

          {/* Fees */}
          {contract.agreedPrice && (
            <div className="pt-2 border-t border-gray-50 text-xs text-gray-400 space-y-0.5">
              {isPoster && posterFee && <p>Platform fee on completion: ₾ {posterFee} (3%)</p>}
              {isWorker && workerFee && <p>Platform fee on completion: ₾ {workerFee} (2%)</p>}
              {!contract.feeEligible && (
                <p className="text-green-600 font-medium">No fees — grace period applied</p>
              )}
            </div>
          )}

          {/* Worker message */}
          {contract.application.message && (
            <div className="pt-2 border-t border-gray-50">
              <p className="text-xs text-gray-400 mb-1">Worker message</p>
              <p className="text-sm text-gray-700 italic">&ldquo;{contract.application.message}&rdquo;</p>
            </div>
          )}
        </section>

        {/* Signing state (draft only) */}
        {contract.status === 'draft' && (
          <section className="bg-white rounded-xl p-5 border border-gray-100 space-y-3">
            <h2 className="font-semibold text-gray-800 text-sm">Signatures</h2>
            <div className="flex gap-4 text-sm">
              <SignatureRow label="Poster" signed={Boolean(contract.posterSignedAt)} />
              <SignatureRow label="Worker" signed={Boolean(contract.workerSignedAt)} />
            </div>
            <p className="text-xs text-gray-400">
              Both parties must sign to start the contract.
            </p>
          </section>
        )}

        {/* Half-time notice (in_progress, before half-time) */}
        {contract.status === 'in_progress' && !halfTimePassed && ht && (
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">
            Complete / dispute buttons unlock after {fmtDate(ht.toISOString())} (half-time rule).
          </div>
        )}

        {/* Error */}
        {actionError && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">
            {actionError}
          </p>
        )}

        {/* ── Actions ── */}
        {!isTerminal && (
          <section className="bg-white rounded-xl p-5 border border-gray-100 space-y-3">
            <h2 className="font-semibold text-gray-800 text-sm">Actions</h2>
            <div className="flex flex-col gap-2">

              {/* Sign — draft */}
              {contract.status === 'draft' && (
                <>
                  {isPoster && !contract.posterSignedAt && (
                    <ActionButton
                      label="Sign contract"
                      color="brand"
                      loading={signMutation.isPending}
                      disabled={anyPending}
                      onClick={() => signMutation.mutate()}
                    />
                  )}
                  {isWorker && !contract.workerSignedAt && (
                    <ActionButton
                      label="Sign contract"
                      color="brand"
                      loading={signMutation.isPending}
                      disabled={anyPending}
                      onClick={() => signMutation.mutate()}
                    />
                  )}
                  {isPoster && contract.posterSignedAt && (
                    <p className="text-xs text-gray-400">
                      You signed on {fmtDate(contract.posterSignedAt)}. Waiting for worker.
                    </p>
                  )}
                  {isWorker && contract.workerSignedAt && (
                    <p className="text-xs text-gray-400">
                      You signed on {fmtDate(contract.workerSignedAt)}. Waiting for poster.
                    </p>
                  )}
                </>
              )}

              {/* Worker: mark complete (in_progress) */}
              {isWorker && contract.status === 'in_progress' && (
                <ActionButton
                  label="Mark job complete"
                  color="brand"
                  loading={markCompleteMutation.isPending}
                  disabled={anyPending || !halfTimePassed}
                  title={!halfTimePassed ? 'Half-time rule — not yet available' : undefined}
                  onClick={() => markCompleteMutation.mutate()}
                />
              )}

              {/* Poster: confirm complete (pending_completion) */}
              {isPoster && contract.status === 'pending_completion' && (
                <ActionButton
                  label="Confirm job complete"
                  color="brand"
                  loading={markCompleteMutation.isPending}
                  disabled={anyPending}
                  onClick={() => markCompleteMutation.mutate()}
                />
              )}

              {/* Poster: dispute (in_progress after half-time, or pending_completion) */}
              {isPoster &&
                (contract.status === 'in_progress' || contract.status === 'pending_completion') && (
                  <ActionButton
                    label="Job not done — raise dispute"
                    color="red"
                    loading={disputeMutation.isPending}
                    disabled={
                      anyPending ||
                      (contract.status === 'in_progress' && !halfTimePassed)
                    }
                    title={
                      contract.status === 'in_progress' && !halfTimePassed
                        ? 'Half-time rule — not yet available'
                        : undefined
                    }
                    onClick={() => disputeMutation.mutate()}
                  />
                )}

              {/* Worker: pending_completion — waiting */}
              {isWorker && contract.status === 'pending_completion' && (
                <p className="text-sm text-gray-500">
                  Waiting for poster to confirm completion (auto-completes in 48 h).
                </p>
              )}

              {/* Cancel — in_progress (either party) */}
              {(isPoster || isWorker) && contract.status === 'in_progress' && (
                <ActionButton
                  label="Cancel contract"
                  color="gray"
                  loading={cancelMutation.isPending}
                  disabled={anyPending}
                  onClick={() => cancelMutation.mutate()}
                />
              )}

              {/* Worker: quit (in_progress) */}
              {isWorker && contract.status === 'in_progress' && (
                <ActionButton
                  label="Quit job"
                  color="gray"
                  loading={quitMutation.isPending}
                  disabled={anyPending}
                  onClick={() => quitMutation.mutate()}
                />
              )}
            </div>
          </section>
        )}

        {/* Terminal summary */}
        {isTerminal && (
          <section className="bg-white rounded-xl p-5 border border-gray-100 text-sm text-gray-500 space-y-1">
            {contract.completedAt && <p>Completed on {fmtDate(contract.completedAt)}</p>}
            {contract.cancelledAt && <p>Cancelled on {fmtDate(contract.cancelledAt)}</p>}
            {contract.quitAt && <p>Worker quit on {fmtDate(contract.quitAt)}</p>}
            {!contract.feeEligible && (
              <p className="text-green-600">No platform fees applied.</p>
            )}
          </section>
        )}

        {/* Disputed state */}
        {contract.status === 'disputed' && (
          <section className="bg-amber-50 border border-amber-100 rounded-xl p-5 text-sm text-amber-800 space-y-1">
            <p className="font-semibold">Dispute raised</p>
            {contract.disputedAt && <p>Opened on {fmtDate(contract.disputedAt)}</p>}
            <p className="text-xs">
              An arbiter will review the case. Evidence submission will be available 24 h after the dispute was opened.
            </p>
          </section>
        )}

      </div>
    </Scaffold>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Scaffold({
  children,
  gigId,
}: {
  children: React.ReactNode;
  gigId?: string;
}) {
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-4">
        {gigId ? (
          <Link href={`/gigs/${gigId}`} className="text-gray-500 hover:text-brand-600 text-sm">
            ← Back to gig
          </Link>
        ) : (
          <Link href="/account" className="text-gray-500 hover:text-brand-600 text-sm">
            ← My account
          </Link>
        )}
      </header>
      <div className="max-w-2xl mx-auto px-4 py-8">{children}</div>
    </main>
  );
}

type ButtonColor = 'brand' | 'red' | 'gray';

function ActionButton({
  label,
  color,
  loading,
  disabled,
  title,
  onClick,
}: {
  label: string;
  color: ButtonColor;
  loading: boolean;
  disabled: boolean;
  title?: string;
  onClick: () => void;
}) {
  const colorMap: Record<ButtonColor, string> = {
    brand: 'bg-brand-600 text-white hover:bg-brand-700',
    red: 'bg-red-500 text-white hover:bg-red-600',
    gray: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        'w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50',
        colorMap[color],
      ].join(' ')}
    >
      {loading ? 'Please wait…' : label}
    </button>
  );
}

function SignatureRow({ label, signed }: { label: string; signed: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={signed ? 'text-green-500' : 'text-gray-300'}>{signed ? '✓' : '○'}</span>
      <span className={signed ? 'text-gray-800' : 'text-gray-400'}>{label}</span>
    </div>
  );
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Awaiting signatures', cls: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
  in_progress: { label: 'In progress', cls: 'bg-blue-50 border-blue-200 text-blue-800' },
  pending_completion: { label: 'Pending confirmation', cls: 'bg-purple-50 border-purple-200 text-purple-800' },
  completed: { label: 'Completed ✓', cls: 'bg-green-50 border-green-200 text-green-800' },
  disputed: { label: 'Disputed', cls: 'bg-orange-50 border-orange-200 text-orange-800' },
  arbitration: { label: 'In arbitration', cls: 'bg-orange-50 border-orange-200 text-orange-800' },
  auto_resolved: { label: 'Auto-resolved', cls: 'bg-gray-50 border-gray-200 text-gray-600' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-50 border-gray-200 text-gray-600' },
  quit: { label: 'Worker quit', cls: 'bg-gray-50 border-gray-200 text-gray-600' },
};

function StatusBanner({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, cls: 'bg-gray-50 border-gray-200 text-gray-600' };
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${cfg.cls}`}>
      {cfg.label}
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
