jest.mock('../db/index.js', () => ({
  db: {
    query: {
      gigs: { findFirst: jest.fn(), findMany: jest.fn() },
      gigImages: { findFirst: jest.fn() },
      contracts: { findMany: jest.fn() },
      infoRequests: { findMany: jest.fn() },
    },
    transaction: jest.fn(),
  },
}));

jest.mock('../lib/media-storage.js', () => ({
  mediaStorageConfigured: jest.fn(() => true),
  putMediaObject: jest.fn(async (name: string) => `https://storage.googleapis.com/test-bucket/${name}`),
  deleteMediaObjects: jest.fn(async () => undefined),
}));

import sharp from 'sharp';
import { MAX_FILE_SIZE_BYTES, MAX_GIG_IMAGES } from '@gigs/shared/constants';
import { buildApp } from '../app.js';
import { db } from '../db/index.js';
import { signAccessToken } from '../lib/auth.js';
import { presentGig } from '../lib/gig-visibility.js';
import { deleteMediaObjects, mediaStorageConfigured, putMediaObject } from '../lib/media-storage.js';

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '33333333-3333-3333-3333-333333333333';
const GIG_ID = '22222222-2222-2222-2222-222222222222';
const IMAGE_ID = '44444444-4444-4444-4444-444444444444';

const mockDb = db as unknown as {
  query: {
    gigs: { findFirst: jest.Mock };
    gigImages: { findFirst: jest.Mock };
  };
  transaction: jest.Mock;
};
const mockPut = putMediaObject as jest.Mock;
const mockDelete = deleteMediaObjects as jest.Mock;
const mockConfigured = mediaStorageConfigured as jest.Mock;

const tokenFor = (sub: string) => signAccessToken({
  sub, role: 'user', status: 'active', emailVerified: true, phoneVerified: true,
});

const gig = { id: GIG_ID, posterId: OWNER_ID, status: 'active' };

// Chainable stand-in for a Drizzle query builder that resolves to `result` when awaited.
const chain = (result: unknown) => {
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'for', 'orderBy', 'limit', 'set', 'values']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.returning = jest.fn().mockResolvedValue(result);
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder as Record<string, jest.Mock>;
};

const makeTx = (existingCount: number, inserted: unknown) => {
  const insertChain = chain([inserted]);
  const tx = {
    select: jest.fn()
      .mockReturnValueOnce(chain([{ id: GIG_ID }]))
      .mockReturnValueOnce(chain([{ count: existingCount }])),
    insert: jest.fn(() => insertChain),
    delete: jest.fn(() => chain(undefined)),
    update: jest.fn(() => chain(undefined)),
  };
  mockDb.transaction.mockImplementationOnce(async (callback: (t: typeof tx) => unknown) => callback(tx));
  return { tx, insertChain };
};

const multipart = (data: Buffer, filename: string, contentType: string) => {
  const boundary = '----gigsTestBoundary';
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
};

const jpegWithExif = () => sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#c03030' } })
  .jpeg()
  .withMetadata({ exif: { IFD0: { ImageDescription: 'home address', Copyright: 'private' } } })
  .toBuffer();

const upload = async (sub: string, data: Buffer, filename = 'photo.jpg', contentType = 'image/jpeg') => {
  const app = await buildApp();
  const body = multipart(data, filename, contentType);
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/gigs/${GIG_ID}/images`,
    headers: { authorization: `Bearer ${tokenFor(sub)}`, ...body.headers },
    payload: body.payload,
  });
  await app.close();
  return response;
};

describe('Gig photo routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigured.mockReturnValue(true);
    mockDb.query.gigs.findFirst.mockResolvedValue(gig);
  });

  it('stores a resized WebP copy and thumbnail with all metadata removed', async () => {
    const input = await jpegWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const { insertChain } = makeTx(0, {
      id: IMAGE_ID, url: 'full-url', thumbUrl: 'thumb-url', isPreview: true,
    });

    const response = await upload(OWNER_ID, input);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ image: { id: IMAGE_ID, url: 'full-url', thumbUrl: 'thumb-url', isPreview: true } });
    expect(mockPut).toHaveBeenCalledTimes(2);

    const [fullName, fullBuffer, contentType] = mockPut.mock.calls[0];
    expect(fullName).toMatch(new RegExp(`^gigs/${GIG_ID}/images/[0-9a-f-]{36}\\.webp$`));
    expect(contentType).toBe('image/webp');
    const full = await sharp(fullBuffer).metadata();
    expect(full).toMatchObject({ format: 'webp', width: 1600, height: 800 });
    expect(full.exif).toBeUndefined();

    const thumb = await sharp(mockPut.mock.calls[1][1]).metadata();
    expect(thumb).toMatchObject({ format: 'webp', width: 600, height: 600 });
    expect(thumb.exif).toBeUndefined();

    expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({
      gigId: GIG_ID, isPreview: true, sortOrder: 0,
    }));
  });

  it('rejects uploads from someone who is not the poster', async () => {
    const response = await upload(OTHER_ID, await jpegWithExif());

    expect(response.statusCode).toBe(403);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('rejects files that are not real images, whatever their declared type', async () => {
    const response = await upload(OWNER_ID, Buffer.from('not really a picture'), 'photo.jpg', 'image/jpeg');

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('UNSUPPORTED_IMAGE');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('rejects files over the size limit', async () => {
    const response = await upload(OWNER_ID, Buffer.alloc(MAX_FILE_SIZE_BYTES + 1));

    expect(response.statusCode).toBe(413);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('refuses a photo beyond the limit and removes the stored files', async () => {
    makeTx(MAX_GIG_IMAGES, undefined);

    const response = await upload(OWNER_ID, await jpegWithExif());

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('IMAGE_LIMIT_REACHED');
    expect(mockDelete).toHaveBeenCalledWith([mockPut.mock.calls[0][0], mockPut.mock.calls[1][0]]);
  });

  it('returns 503 when photo storage is not configured', async () => {
    mockConfigured.mockReturnValue(false);

    const response = await upload(OWNER_ID, await jpegWithExif());

    expect(response.statusCode).toBe(503);
  });

  it('deletes a photo, its stored files, and promotes the next photo to cover', async () => {
    mockDb.query.gigImages.findFirst.mockResolvedValue({
      id: IMAGE_ID, gigId: GIG_ID, storageKey: `gigs/${GIG_ID}/images/${IMAGE_ID}`, isPreview: true,
    });
    const { tx } = makeTx(0, undefined);
    tx.select.mockReset().mockReturnValueOnce(chain([{ id: 'next-image' }]));

    const app = await buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/gigs/${GIG_ID}/images/${IMAGE_ID}`,
      headers: { authorization: `Bearer ${tokenFor(OWNER_ID)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(204);
    expect(tx.delete).toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith([
      `gigs/${GIG_ID}/images/${IMAGE_ID}.webp`,
      `gigs/${GIG_ID}/images/${IMAGE_ID}-thumb.webp`,
    ]);
  });
});

describe('Gig photo visibility', () => {
  const images = [
    { id: 'a', url: 'a.webp', thumbUrl: 'a-thumb.webp', isPreview: true, storageKey: 'k/a' },
    { id: 'b', url: 'b.webp', thumbUrl: null, isPreview: false, storageKey: 'k/b' },
  ];
  const gigRow = {
    id: GIG_ID, posterId: OWNER_ID, priceType: 'fixed', visImages: 'private', visAddress: 'public', visDates: 'public',
    longDescription: null, priceFixed: '10.00', priceRangeMin: null, priceRangeMax: null, cityId: 1,
    streetAddress: null, availableFrom: null, availableTo: null, images,
  };
  const context = (sub: string) => ({
    viewer: { sub, role: 'user', emailVerified: true },
    activeGigIds: new Set<string>(),
    grantedFields: new Set<string>(),
  });

  it('shows only the cover photo when the gallery is hidden from the viewer', () => {
    const presented = presentGig(gigRow, context(OTHER_ID)) as { images: unknown[] };
    expect(presented.images).toEqual([{ id: 'a', url: 'a.webp', thumbUrl: 'a-thumb.webp', isPreview: true }]);
  });

  it('shows the full gallery to the poster', () => {
    const presented = presentGig(gigRow, context(OWNER_ID)) as { images: unknown[] };
    expect(presented.images).toHaveLength(2);
    expect(presented.images[1]).toEqual({ id: 'b', url: 'b.webp', thumbUrl: 'b.webp', isPreview: false });
  });
});
