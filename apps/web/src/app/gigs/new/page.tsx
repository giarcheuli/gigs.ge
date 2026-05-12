'use client';

/**
 * /gigs/new — Create and immediately publish a gig.
 *
 * Guard: verified users only. Unverified → /verify, unauthenticated → /login.
 *
 * Flow:
 *  1. User fills form and clicks "Post Gig".
 *  2. POST /api/v1/gigs → creates DRAFT.
 *  3. POST /api/v1/gigs/:id/publish → makes it ACTIVE.
 *  4. Redirect to /gigs/:id.
 *
 * Shows the full visibility-toggle section so stakeholders can see
 * the field-level privacy model during UAT.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { POSTER_FEE_RATE } from '@gigs/shared/constants';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Region {
  id: number;
  nameEn: string;
  cities: { id: number; nameEn: string }[];
}

// ── Form schema ────────────────────────────────────────────────────────────────
// coerce.number() converts the HTML string value from <select> to a number.

const PRICE_TYPES = ['fixed', 'range', 'negotiable'] as const;
const VIS_OPTS = ['public', 'authenticated', 'verified', 'on_request'] as const;

const gigFormSchema = z
  .object({
    shortDescription: z.string().min(1, 'Required').max(160, 'Max 160 characters'),
    longDescription: z.string().max(5000).optional(),
    regionId: z.coerce.number().int().positive('Select a region'),
    cityId: z.union([z.coerce.number().int().positive(), z.literal(0)]).optional(),
    streetAddress: z.string().max(500).optional(),
    priceType: z.enum(PRICE_TYPES),
    priceFixed: z.string().optional(),
    priceRangeMin: z.string().optional(),
    priceRangeMax: z.string().optional(),
    availableFrom: z.string().optional(),
    availableTo: z.string().optional(),
    visImages: z.enum(VIS_OPTS).optional(),
    visPrice: z.enum(VIS_OPTS).optional(),
    visCity: z.enum(VIS_OPTS).optional(),
    visAddress: z.enum(VIS_OPTS).optional(),
    visContact: z.enum(VIS_OPTS).optional(),
    visDates: z.enum(VIS_OPTS).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.priceType === 'fixed') {
      if (!data.priceFixed || !/^\d+(\.\d{1,2})?$/.test(data.priceFixed)) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid price', path: ['priceFixed'] });
      }
    }
    if (data.priceType === 'range') {
      if (!data.priceRangeMin || !/^\d+(\.\d{1,2})?$/.test(data.priceRangeMin)) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid minimum price', path: ['priceRangeMin'] });
      }
      if (!data.priceRangeMax || !/^\d+(\.\d{1,2})?$/.test(data.priceRangeMax)) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid maximum price', path: ['priceRangeMax'] });
      }
      if (
        data.priceRangeMin &&
        data.priceRangeMax &&
        Number(data.priceRangeMin) > Number(data.priceRangeMax)
      ) {
        ctx.addIssue({ code: 'custom', message: 'Min must be ≤ max', path: ['priceRangeMin'] });
      }
    }
  });

type FormData = z.infer<typeof gigFormSchema>;

// ── Component ──────────────────────────────────────────────────────────────────

export default function NewGigPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Guard: must be verified
  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login?next=/gigs/new'); return; }
    if (!user.emailVerified || !user.phoneVerified) { router.replace('/verify'); }
  }, [user, loading, router]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(gigFormSchema),
    defaultValues: {
      priceType: 'fixed',
      visImages: 'verified',
      visPrice: 'public',
      visCity: 'verified',
      visAddress: 'on_request',
      visContact: 'on_request',
      visDates: 'verified',
    },
  });

  const priceType = useWatch({ control, name: 'priceType' });
  const priceFixed = useWatch({ control, name: 'priceFixed' });
  const selectedRegionId = useWatch({ control, name: 'regionId' });

  // Fetch regions for dropdowns
  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ['regions'],
    queryFn: async () => {
      const res = await apiFetch('/regions');
      if (!res.ok) throw new Error('Failed to load regions');
      const body = (await res.json()) as { data: Region[] };
      return body.data;
    },
  });

  const citiesForRegion =
    regions.find((r) => r.id === Number(selectedRegionId))?.cities ?? [];

  async function onSubmit(data: FormData) {
    setServerError(null);
    setIsSubmitting(true);

    try {
      // Step 1: create draft
      const createRes = await apiFetch('/gigs', {
        method: 'POST',
        body: JSON.stringify({
          shortDescription: data.shortDescription,
          longDescription: data.longDescription || undefined,
          regionId: data.regionId,
          cityId: data.cityId && data.cityId !== 0 ? data.cityId : undefined,
          streetAddress: data.streetAddress || undefined,
          priceType: data.priceType,
          priceFixed: data.priceType === 'fixed' ? data.priceFixed : undefined,
          priceRangeMin: data.priceType === 'range' ? data.priceRangeMin : undefined,
          priceRangeMax: data.priceType === 'range' ? data.priceRangeMax : undefined,
          availableFrom: data.availableFrom
            ? new Date(data.availableFrom).toISOString()
            : undefined,
          availableTo: data.availableTo
            ? new Date(data.availableTo).toISOString()
            : undefined,
          visImages: data.visImages,
          visPrice: data.visPrice,
          visCity: data.visCity,
          visAddress: data.visAddress,
          visContact: data.visContact,
          visDates: data.visDates,
        }),
      });

      const createBody = (await createRes.json()) as { gig?: { id: string }; error?: string };

      if (!createRes.ok) {
        setServerError(createBody.error ?? 'Failed to create gig.');
        return;
      }

      const gigId = createBody.gig!.id;

      // Step 2: publish
      const publishRes = await apiFetch(`/gigs/${gigId}/publish`, { method: 'POST' });

      if (!publishRes.ok) {
        setServerError('Gig saved as draft but could not be published. Please try again.');
        return;
      }

      router.push(`/gigs/${gigId}`);
    } catch {
      setServerError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading || !user) return null;

  // Estimated poster fee (3%) shown next to the price field
  const estimatedFee =
    priceType === 'fixed' && priceFixed && /^\d+(\.\d{1,2})?$/.test(priceFixed)
      ? (Number(priceFixed) * POSTER_FEE_RATE).toFixed(2)
      : null;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <Link href="/gigs" className="text-gray-500 hover:text-brand-600">← Board</Link>
        <h1 className="text-lg font-bold text-brand-700">Post a gig</h1>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-xl mx-auto px-4 py-8 space-y-6">
        {serverError && (
          <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {serverError}
          </p>
        )}

        {/* ── Description ── */}
        <section className="bg-white rounded-xl p-5 space-y-4 border border-gray-100">
          <h2 className="font-semibold text-gray-800">Description</h2>

          <Field label="Short description *" error={errors.shortDescription?.message}>
            <div className="relative">
              <textarea
                {...register('shortDescription')}
                rows={2}
                maxLength={160}
                placeholder="e.g. Need help moving furniture this Saturday"
                className={textareaCls(!!errors.shortDescription)}
              />
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Max 160 characters — shown on the board card</p>
          </Field>

          <Field label="Long description" error={errors.longDescription?.message}>
            <textarea
              {...register('longDescription')}
              rows={4}
              placeholder="More details about the job, requirements, what to bring…"
              className={textareaCls(!!errors.longDescription)}
            />
          </Field>
        </section>

        {/* ── Location ── */}
        <section className="bg-white rounded-xl p-5 space-y-4 border border-gray-100">
          <h2 className="font-semibold text-gray-800">Location</h2>

          <Field label="Region *" error={errors.regionId?.message}>
            <select {...register('regionId')} className={inputCls(!!errors.regionId)}>
              <option value="">Select region…</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>{r.nameEn}</option>
              ))}
            </select>
          </Field>

          {citiesForRegion.length > 0 && (
            <Field label="City">
              <select {...register('cityId')} className={inputCls(false)}>
                <option value={0}>All cities in region</option>
                {citiesForRegion.map((c) => (
                  <option key={c.id} value={c.id}>{c.nameEn}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Street address (optional)" error={errors.streetAddress?.message}>
            <input
              {...register('streetAddress')}
              type="text"
              placeholder="e.g. Rustaveli Ave 15"
              className={inputCls(!!errors.streetAddress)}
            />
          </Field>
        </section>

        {/* ── Price ── */}
        <section className="bg-white rounded-xl p-5 space-y-4 border border-gray-100">
          <h2 className="font-semibold text-gray-800">Compensation</h2>

          <fieldset className="flex gap-4">
            {(['fixed', 'range', 'negotiable'] as const).map((type) => (
              <label key={type} className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input {...register('priceType')} type="radio" value={type} />
                {type === 'fixed' ? 'Fixed price' : type === 'range' ? 'Price range' : 'Negotiable'}
              </label>
            ))}
          </fieldset>

          {priceType === 'fixed' && (
            <Field label="Price (₾) *" error={errors.priceFixed?.message}>
              <div className="flex items-center gap-2">
                <input
                  {...register('priceFixed')}
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  className={`w-40 ${inputCls(!!errors.priceFixed)}`}
                />
                {estimatedFee && (
                  <span className="text-xs text-gray-400">
                    Platform fee: ₾ {estimatedFee} (3%)
                  </span>
                )}
              </div>
            </Field>
          )}

          {priceType === 'range' && (
            <div className="flex gap-3 items-start">
              <Field label="Min (₾) *" error={errors.priceRangeMin?.message}>
                <input
                  {...register('priceRangeMin')}
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  className={`w-32 ${inputCls(!!errors.priceRangeMin)}`}
                />
              </Field>
              <Field label="Max (₾) *" error={errors.priceRangeMax?.message}>
                <input
                  {...register('priceRangeMax')}
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  className={`w-32 ${inputCls(!!errors.priceRangeMax)}`}
                />
              </Field>
            </div>
          )}

          {priceType === 'negotiable' && (
            <p className="text-sm text-gray-500">
              💬 Discuss the price with applicants in person.
            </p>
          )}
        </section>

        {/* ── Dates ── */}
        <section className="bg-white rounded-xl p-5 space-y-4 border border-gray-100">
          <h2 className="font-semibold text-gray-800">Availability</h2>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Available from">
              <input {...register('availableFrom')} type="datetime-local" className={inputCls(false)} />
            </Field>
            <Field label="Available until">
              <input {...register('availableTo')} type="datetime-local" className={inputCls(false)} />
            </Field>
          </div>
          <p className="text-xs text-gray-400">
            These dates define the job window. The contract start/due dates default to these values.
          </p>
        </section>

        {/* ── Visibility ── */}
        <section className="bg-white rounded-xl p-5 space-y-3 border border-gray-100">
          <h2 className="font-semibold text-gray-800">Field visibility</h2>
          <p className="text-xs text-gray-500">
            Control who can see each field on your gig listing.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {VIS_FIELD_CONFIG.map(({ key, label, defaultVal }) => (
              <Field key={key} label={label}>
                <select
                  {...register(key as keyof FormData)}
                  defaultValue={defaultVal}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="public">Public</option>
                  <option value="authenticated">Logged-in users</option>
                  <option value="verified">Verified users</option>
                  <option value="on_request">On request</option>
                </select>
              </Field>
            ))}
          </div>
        </section>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
        >
          {isSubmitting ? 'Posting…' : 'Post gig'}
        </button>
      </form>
    </main>
  );
}

// ── Visibility field config ────────────────────────────────────────────────────

const VIS_FIELD_CONFIG = [
  { key: 'visImages', label: 'Images', defaultVal: 'verified' },
  { key: 'visPrice', label: 'Price', defaultVal: 'public' },
  { key: 'visCity', label: 'City', defaultVal: 'verified' },
  { key: 'visAddress', label: 'Street address', defaultVal: 'on_request' },
  { key: 'visContact', label: 'Contact info', defaultVal: 'on_request' },
  { key: 'visDates', label: 'Available dates', defaultVal: 'verified' },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return [
    'w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500',
    hasError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300',
  ].join(' ');
}

function textareaCls(hasError: boolean) {
  return [
    'w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 resize-y',
    hasError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300',
  ].join(' ');
}
