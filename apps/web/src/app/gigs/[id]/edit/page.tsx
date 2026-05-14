'use client';

/**
 * /gigs/[id]/edit — Edit a draft gig and publish it.
 *
 * Guard: poster only, gig must be in draft status.
 * Fetches existing data, pre-fills the form, then PATCH + publish on submit.
 */

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { POSTER_FEE_RATE } from '@gigs/shared/constants';

interface Region {
  id: number;
  nameEn: string;
  cities: { id: number; nameEn: string }[];
}

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
    }
  });

type FormData = z.infer<typeof gigFormSchema>;

const toDatetimeLocal = (iso: string | null) =>
  iso ? new Date(iso).toISOString().slice(0, 16) : '';

export default function EditGigPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace(`/login?next=/gigs/${id}/edit`); }
  }, [user, loading, router, id]);

  // Fetch the existing gig to pre-fill
  const { data: gig, isLoading: gigLoading, isError: gigError } = useQuery({
    queryKey: ['gig', id],
    queryFn: async () => {
      const res = await apiFetch(`/gigs/${id}`);
      if (!res.ok) throw new Error('Not found');
      const body = (await res.json()) as { gig: {
        id: string; posterId: string; status: string;
        shortDescription: string; longDescription: string | null;
        regionId: number; cityId: number | null; streetAddress: string | null;
        priceType: string; priceFixed: string | null;
        priceRangeMin: string | null; priceRangeMax: string | null;
        availableFrom: string | null; availableTo: string | null;
        visImages: string; visPrice: string; visCity: string;
        visAddress: string; visContact: string; visDates: string;
      }};
      return body.gig;
    },
    enabled: !!id,
  });

  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ['regions'],
    queryFn: async () => {
      const res = await apiFetch('/regions');
      if (!res.ok) throw new Error('Failed to load regions');
      const body = (await res.json()) as { data: Region[] };
      return body.data;
    },
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(gigFormSchema) });

  // Pre-fill form once gig is loaded
  useEffect(() => {
    if (!gig) return;
    reset({
      shortDescription: gig.shortDescription,
      longDescription: gig.longDescription ?? '',
      regionId: gig.regionId,
      cityId: gig.cityId ?? 0,
      streetAddress: gig.streetAddress ?? '',
      priceType: gig.priceType as FormData['priceType'],
      priceFixed: gig.priceFixed ?? '',
      priceRangeMin: gig.priceRangeMin ?? '',
      priceRangeMax: gig.priceRangeMax ?? '',
      availableFrom: toDatetimeLocal(gig.availableFrom),
      availableTo: toDatetimeLocal(gig.availableTo),
      visImages: gig.visImages as FormData['visImages'],
      visPrice: gig.visPrice as FormData['visPrice'],
      visCity: gig.visCity as FormData['visCity'],
      visAddress: gig.visAddress as FormData['visAddress'],
      visContact: gig.visContact as FormData['visContact'],
      visDates: gig.visDates as FormData['visDates'],
    });
    setReady(true);
  }, [gig, reset]);

  const priceType = useWatch({ control, name: 'priceType' });
  const priceFixed = useWatch({ control, name: 'priceFixed' });
  const selectedRegionId = useWatch({ control, name: 'regionId' });

  const citiesForRegion = regions.find((r) => r.id === Number(selectedRegionId))?.cities ?? [];

  const estimatedFee =
    priceType === 'fixed' && priceFixed && /^\d+(\.\d{1,2})?$/.test(priceFixed)
      ? (Number(priceFixed) * POSTER_FEE_RATE).toFixed(2)
      : null;

  async function onSubmit(data: FormData) {
    setServerError(null);
    setIsSubmitting(true);

    try {
      // Patch the draft
      const patchRes = await apiFetch(`/gigs/${id}`, {
        method: 'PATCH',
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
          availableFrom: data.availableFrom ? new Date(data.availableFrom).toISOString() : undefined,
          availableTo: data.availableTo ? new Date(data.availableTo).toISOString() : undefined,
          visImages: data.visImages,
          visPrice: data.visPrice,
          visCity: data.visCity,
          visAddress: data.visAddress,
          visContact: data.visContact,
          visDates: data.visDates,
        }),
      });

      if (!patchRes.ok) {
        const body = (await patchRes.json()) as { error?: string };
        setServerError(body.error ?? 'Failed to update gig.');
        return;
      }

      // Publish
      const publishRes = await apiFetch(`/gigs/${id}/publish`, { method: 'POST' });

      if (!publishRes.ok) {
        let errMsg = 'Gig saved but could not be published. Please try again.';
        try {
          const errBody = (await publishRes.json()) as { error?: string };
          if (errBody.error) errMsg = `Publish failed: ${errBody.error}`;
        } catch { /* ignore */ }
        setServerError(errMsg);
        return;
      }

      router.push('/account');
    } catch {
      setServerError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading || !user || gigLoading) return null;

  if (gigError || (gig && gig.status !== 'draft')) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-3">
            {gigError ? 'Gig not found.' : 'Only draft gigs can be edited.'}
          </p>
          <Link href="/gigs" className="text-brand-600 hover:underline text-sm">← Back to board</Link>
        </div>
      </main>
    );
  }

  if (gig && gig.posterId !== user.id) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-3">You can only edit your own gigs.</p>
          <Link href="/gigs" className="text-brand-600 hover:underline text-sm">← Back to board</Link>
        </div>
      </main>
    );
  }

  if (!ready) return null;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <Link href={`/gigs/${id}`} className="text-gray-500 hover:text-brand-600">← Back</Link>
        <h1 className="text-lg font-bold text-brand-700">Edit draft</h1>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-xl mx-auto px-4 py-8 space-y-6">
        {serverError && (
          <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {serverError}
          </p>
        )}

        <section className="bg-white rounded-xl p-5 space-y-4 border border-gray-100">
          <h2 className="font-semibold text-gray-800">Description</h2>
          <Field label="Short description *" error={errors.shortDescription?.message}>
            <textarea {...register('shortDescription')} rows={2} maxLength={160}
              className={textareaCls(!!errors.shortDescription)} />
            <p className="text-xs text-gray-400 mt-0.5">Max 160 characters</p>
          </Field>
          <Field label="Long description" error={errors.longDescription?.message}>
            <textarea {...register('longDescription')} rows={4}
              className={textareaCls(!!errors.longDescription)} />
          </Field>
        </section>

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
            <input {...register('streetAddress')} type="text" placeholder="e.g. Rustaveli Ave 15"
              className={inputCls(!!errors.streetAddress)} />
          </Field>
        </section>

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
                  {...register('priceFixed', {
                    validate: (v) => {
                      if (!v) return 'Required';
                      const num = Number(v);
                      if (isNaN(num)) return 'Must be a number';
                      if (num > 10000) return 'Max 10,000 ₾';
                      return true;
                    },
                  })}
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  pattern="\d*"
                  onKeyDown={(e) => {
                    if (!/[\d]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  className={`w-40 ${inputCls(!!errors.priceFixed)}`}
                />
                {estimatedFee && (
                  <span className="text-xs text-gray-400">Platform fee: ₾ {estimatedFee} (3%)</span>
                )}
              </div>
            </Field>
          )}
          {priceType === 'range' && (
            <div className="flex gap-3 items-start">
              <Field label="Min (₾) *" error={errors.priceRangeMin?.message}>
                <input
                  {...register('priceRangeMin', {
                    validate: (v) => {
                      if (!v) return 'Required';
                      const num = Number(v);
                      if (isNaN(num)) return 'Must be a number';
                      if (num > 10000) return 'Max 10,000 ₾';
                      return true;
                    },
                  })}
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  pattern="\d*"
                  onKeyDown={(e) => {
                    if (!/[\d]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  className={`w-32 ${inputCls(!!errors.priceRangeMin)}`}
                />
              </Field>
              <Field label="Max (₾) *" error={errors.priceRangeMax?.message}>
                <input
                  {...register('priceRangeMax', {
                    validate: (v) => {
                      if (!v) return 'Required';
                      const num = Number(v);
                      if (isNaN(num)) return 'Must be a number';
                      if (num > 10000) return 'Max 10,000 ₾';
                      return true;
                    },
                  })}
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  pattern="\d*"
                  onKeyDown={(e) => {
                    if (!/[\d]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  className={`w-32 ${inputCls(!!errors.priceRangeMax)}`}
                />
              </Field>
            </div>
          )}
        </section>

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
        </section>

        <section className="bg-white rounded-xl p-5 space-y-3 border border-gray-100">
          <h2 className="font-semibold text-gray-800">Field visibility</h2>
          <div className="grid grid-cols-2 gap-3">
            {VIS_FIELD_CONFIG.map(({ key, label }) => (
              <Field key={key} label={label}>
                <select {...register(key as keyof FormData)}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-brand-500">
                  <option value="public">Public</option>
                  <option value="authenticated">Logged-in users</option>
                  <option value="verified">Verified users</option>
                  <option value="on_request">On request</option>
                </select>
              </Field>
            ))}
          </div>
        </section>

        <button type="submit" disabled={isSubmitting}
          className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors">
          {isSubmitting ? 'Saving…' : 'Save & Publish'}
        </button>
      </form>
    </main>
  );
}

const VIS_FIELD_CONFIG = [
  { key: 'visImages', label: 'Images' },
  { key: 'visPrice', label: 'Price' },
  { key: 'visCity', label: 'City' },
  { key: 'visAddress', label: 'Street address' },
  { key: 'visContact', label: 'Contact info' },
  { key: 'visDates', label: 'Available dates' },
] as const;

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
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
