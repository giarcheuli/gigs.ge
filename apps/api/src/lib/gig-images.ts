import sharp from 'sharp';

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

export type ProcessedGigImage = { full: Buffer; thumb: Buffer };

/**
 * Validates by decoding the actual bytes (not the client's MIME claim), applies EXIF orientation,
 * and re-encodes to WebP. sharp drops all metadata (including GPS) unless withMetadata() is called.
 */
export async function processGigImage(input: Buffer): Promise<ProcessedGigImage | null> {
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    return null;
  }
  if (!format || !ALLOWED_FORMATS.has(format)) return null;

  const oriented = sharp(input, { failOn: 'error' }).rotate();
  const [full, thumb] = await Promise.all([
    oriented.clone()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(),
    oriented.clone()
      .resize({ width: 600, height: 600, fit: 'cover' })
      .webp({ quality: 75 })
      .toBuffer(),
  ]);
  return { full, thumb };
}

export const gigImageObjectNames = (storageKey: string) => [`${storageKey}.webp`, `${storageKey}-thumb.webp`];
