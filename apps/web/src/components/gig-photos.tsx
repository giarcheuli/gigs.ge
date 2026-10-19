'use client';

/* eslint-disable @next/next/no-img-element -- photos are public bucket URLs already resized by the API */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MAX_FILE_SIZE_BYTES, MAX_GIG_IMAGES } from '@gigs/shared/constants';
import { apiFetch } from '@/lib/api';
import type { GigImage } from '@/components/gig-board';

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

/** Uploads one photo; returns a readable error message, or null on success. */
export async function uploadGigPhoto(gigId: string, file: File): Promise<string | null> {
  if (file.size > MAX_FILE_SIZE_BYTES) return `${file.name}: larger than 10 MB`;
  const form = new FormData();
  form.append('file', file);
  try {
    const res = await apiFetch(`/gigs/${gigId}/images`, { method: 'POST', body: form });
    if (res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return `${file.name}: ${body.error ?? 'upload failed'}`;
  } catch {
    return `${file.name}: network error`;
  }
}

export function GigGallery({ images, title }: { images: GigImage[]; title: string }) {
  const [selected, setSelected] = useState(0);
  if (images.length === 0) return null;
  const index = Math.min(selected, images.length - 1);

  return (
    <div className="space-y-2">
      <img
        src={images[index].url}
        alt={title}
        className="w-full max-h-96 rounded-lg object-contain bg-gray-100"
      />
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((image, i) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setSelected(i)}
              aria-label={`Show photo ${i + 1}`}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 ${i === index ? 'border-brand-600' : 'border-transparent'}`}
            >
              <img src={image.thumbUrl} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GigPhotoManager({ gigId, images }: { gigId: string; images: GigImage[] }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const remaining = MAX_GIG_IMAGES - images.length;

  async function addPhotos(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    const failures: string[] = [];
    if (files.length > remaining) {
      failures.push(`Only ${remaining} more photo(s) allowed, so some files were skipped.`);
    }
    for (const file of files.slice(0, remaining)) {
      const error = await uploadGigPhoto(gigId, file);
      if (error) failures.push(error);
    }
    setErrors(failures);
    setBusy(false);
    await qc.invalidateQueries({ queryKey: ['gig', gigId] });
  }

  async function change(path: string, method: 'POST' | 'DELETE') {
    setBusy(true);
    const res = await apiFetch(path, { method }).catch(() => null);
    setErrors(res?.ok ? [] : ['Could not update photos. Please try again.']);
    setBusy(false);
    await qc.invalidateQueries({ queryKey: ['gig', gigId] });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Photos ({images.length}/{MAX_GIG_IMAGES})</h3>
        {remaining > 0 && (
          <label className={`text-sm text-brand-600 hover:underline ${busy ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
            {busy ? 'Working…' : '+ Add photos'}
            <input
              type="file"
              accept={PHOTO_ACCEPT}
              multiple
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                void addPhotos(files);
              }}
            />
          </label>
        )}
      </div>

      {images.length === 0 ? (
        <p className="text-sm text-gray-400">No photos yet. Gigs with photos get more attention.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {images.map((image) => (
            <li key={image.id} className="space-y-1">
              <img src={image.thumbUrl} alt="" className="aspect-square w-full rounded-md object-cover bg-gray-100" />
              {image.isPreview ? (
                <p className="text-xs font-medium text-brand-700">Cover</p>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => change(`/gigs/${gigId}/images/${image.id}/cover`, 'POST')}
                  className="block text-xs text-brand-600 hover:underline disabled:opacity-50"
                >
                  Make cover
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Remove this photo?')) void change(`/gigs/${gigId}/images/${image.id}`, 'DELETE');
                }}
                className="block text-xs text-red-600 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <ul role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 space-y-1">
          {errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      )}
      <p className="text-xs text-gray-400">
        JPEG, PNG or WebP, up to 10 MB each. Location data is removed. The cover photo is shown to everyone on the board.
      </p>
    </div>
  );
}
