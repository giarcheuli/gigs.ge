jest.mock('../db/index.js', () => ({
  db: {
    query: {
      gigs: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      contracts: { findMany: jest.fn() },
      infoRequests: { findMany: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

import { buildApp } from '../app.js';
import { db } from '../db/index.js';
import { signAccessToken } from '../lib/auth.js';

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

const mockDb = db as unknown as {
  query: {
    gigs: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    contracts: { findMany: jest.Mock };
    infoRequests: { findMany: jest.Mock };
  };
  insert: jest.Mock;
  update: jest.Mock;
};

const makeToken = (overrides: Record<string, unknown> = {}) => signAccessToken({
  sub: TEST_USER_ID,
  role: 'user',
  status: 'active',
  emailVerified: true,
  phoneVerified: true,
  ...overrides,
});

const draftGig = {
  id: '22222222-2222-2222-2222-222222222222',
  posterId: TEST_USER_ID,
  title: 'Kitchen sink repair',
  shortDescription: 'Fix kitchen sink',
  longDescription: 'Need a plumber for a quick fix',
  regionId: 1,
  cityId: 2,
  streetAddress: 'Rustaveli Ave 10',
  priceType: 'fixed',
  priceFixed: '120.00',
  priceRangeMin: null,
  priceRangeMax: null,
  availableFrom: null,
  availableTo: null,
  workersNeeded: 2,
  status: 'draft',
  visImages: 'verified',
  visPrice: 'public',
  visCity: 'verified',
  visAddress: 'on_request',
  visContact: 'on_request',
  visDates: 'verified',
  expiresAt: new Date('2026-06-01T00:00:00.000Z'),
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
  updatedAt: new Date('2026-05-01T00:00:00.000Z'),
};

const mockInsertReturning = (result: unknown) => ({
  values: jest.fn().mockReturnValue({
    returning: jest.fn().mockResolvedValue([result]),
  }),
});

const mockUpdateReturning = (result: unknown) => ({
  set: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([result]),
    }),
  }),
});

describe('Gigs Routes Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.gigs.findFirst.mockReset();
    mockDb.query.gigs.findMany.mockReset();
    mockDb.query.contracts.findMany.mockReset().mockResolvedValue([]);
    mockDb.query.infoRequests.findMany.mockReset().mockResolvedValue([]);
    mockDb.insert.mockReset();
    mockDb.update.mockReset();
  });

  it('allows an email-verified poster with an unverified phone to create a draft gig', async () => {
    const insert = mockInsertReturning(draftGig);
    mockDb.insert.mockReturnValueOnce(insert);

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/gigs',
      headers: { authorization: `Bearer ${makeToken({ phoneVerified: false })}` },
      payload: {
        title: draftGig.title,
        shortDescription: draftGig.shortDescription,
        longDescription: draftGig.longDescription,
        regionId: draftGig.regionId,
        cityId: draftGig.cityId,
        streetAddress: draftGig.streetAddress,
        priceType: 'fixed',
        priceFixed: draftGig.priceFixed,
        workersNeeded: 2,
      },
    });
    await app.close();

    expect(response.statusCode).toBe(201);
    expect(insert.values).toHaveBeenCalledWith(expect.objectContaining({
      title: draftGig.title,
      workersNeeded: 2,
    }));
    expect(response.json()).toEqual({
      gig: expect.objectContaining({
        ...draftGig,
        createdAt: draftGig.createdAt.toISOString(),
        updatedAt: draftGig.updatedAt.toISOString(),
        expiresAt: draftGig.expiresAt.toISOString(),
      }),
    });
  });

  it('rejects gig creation for users that are not verified', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/gigs',
      headers: {
        authorization: `Bearer ${makeToken({ emailVerified: false, phoneVerified: false })}`,
      },
      payload: {
        shortDescription: draftGig.shortDescription,
        regionId: draftGig.regionId,
        priceType: 'fixed',
        priceFixed: draftGig.priceFixed,
      },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'Email verification required',
      code: 'EMAIL_VERIFICATION_REQUIRED',
      statusCode: 403,
    });
  });

  it('rejects a gig without a title and a non-fixed price with 400', async () => {
    const app = await buildApp();
    const noTitle = await app.inject({
      method: 'POST',
      url: '/api/v1/gigs',
      headers: { authorization: `Bearer ${makeToken()}` },
      payload: {
        shortDescription: draftGig.shortDescription,
        regionId: draftGig.regionId,
        priceType: 'fixed',
        priceFixed: draftGig.priceFixed,
      },
    });
    const negotiable = await app.inject({
      method: 'POST',
      url: '/api/v1/gigs',
      headers: { authorization: `Bearer ${makeToken()}` },
      payload: {
        title: draftGig.title,
        shortDescription: draftGig.shortDescription,
        regionId: draftGig.regionId,
        priceType: 'negotiable',
      },
    });
    await app.close();

    expect(noTitle.statusCode).toBe(400);
    expect(noTitle.json()).toMatchObject({ error: 'Invalid request', statusCode: 400 });
    expect(negotiable.statusCode).toBe(400);
    expect(negotiable.json()).toEqual({ error: 'Only fixed-price gigs can be posted for now', statusCode: 400 });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('allows the poster to update their draft gig', async () => {
    const updatedGig = { ...draftGig, shortDescription: 'Fix bathroom sink' };

    mockDb.query.gigs.findFirst.mockResolvedValueOnce(draftGig);
    mockDb.update.mockReturnValueOnce(mockUpdateReturning(updatedGig));

    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/gigs/${draftGig.id}`,
      headers: { authorization: `Bearer ${makeToken()}` },
      payload: { shortDescription: updatedGig.shortDescription },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      gig: expect.objectContaining({
        ...updatedGig,
        createdAt: updatedGig.createdAt.toISOString(),
        updatedAt: updatedGig.updatedAt.toISOString(),
        expiresAt: updatedGig.expiresAt.toISOString(),
      }),
    });
  });

  it('allows the poster to publish a draft gig', async () => {
    const activeGig = { ...draftGig, status: 'active' };

    mockDb.query.gigs.findFirst.mockResolvedValueOnce(draftGig);
    mockDb.update.mockReturnValueOnce(mockUpdateReturning(activeGig));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/gigs/${draftGig.id}/publish`,
      headers: { authorization: `Bearer ${makeToken()}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      gig: expect.objectContaining({
        ...activeGig,
        createdAt: activeGig.createdAt.toISOString(),
        updatedAt: activeGig.updatedAt.toISOString(),
        expiresAt: activeGig.expiresAt.toISOString(),
      }),
    });
  });

  it('lists gigs publicly with city and price, and requires login for detail', async () => {
    const visibleGigs = [{
      ...draftGig,
      status: 'active',
      region: { id: 1, nameEn: 'Tbilisi' },
      city: { id: 2, nameEn: 'Tbilisi' },
    }];
    const viewerToken = makeToken({ sub: '33333333-3333-3333-3333-333333333333', emailVerified: false });

    mockDb.query.gigs.findMany.mockResolvedValueOnce(visibleGigs);
    mockDb.query.gigs.findFirst
      .mockResolvedValueOnce(visibleGigs[0])
      .mockResolvedValueOnce(null);

    const app = await buildApp();

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/gigs',
    });

    const anonymousDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/gigs/${draftGig.id}`,
    });

    const getResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/gigs/${draftGig.id}`,
      headers: { authorization: `Bearer ${viewerToken}` },
    });

    const notFoundResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/gigs/33333333-3333-3333-3333-333333333333',
      headers: { authorization: `Bearer ${viewerToken}` },
    });

    await app.close();

    expect(listResponse.statusCode).toBe(200);
    const listed = listResponse.json().data[0];
    expect(listed).toMatchObject({
      shortDescription: visibleGigs[0].shortDescription,
      longDescription: null,
      priceFixed: visibleGigs[0].priceFixed,
      cityId: visibleGigs[0].cityId,
      city: { id: 2, nameEn: 'Tbilisi' },
      region: { id: 1, nameEn: 'Tbilisi' },
      streetAddress: null,
      availableFrom: null,
      availableTo: null,
    });
    expect(listed).not.toHaveProperty('visPrice');
    expect(listed).not.toHaveProperty('visCity');
    expect(mockDb.query.gigs.findMany).toHaveBeenCalledWith(expect.objectContaining({
      with: { region: true, city: true },
    }));

    expect(anonymousDetail.statusCode).toBe(401);

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({
      gig: expect.objectContaining({
        longDescription: visibleGigs[0].longDescription,
        cityId: visibleGigs[0].cityId,
        priceFixed: visibleGigs[0].priceFixed,
        streetAddress: null,
      }),
    });

    expect(notFoundResponse.statusCode).toBe(404);
    expect(notFoundResponse.json()).toEqual({
      error: 'Gig not found',
      statusCode: 404,
    });
  });
});
