jest.mock('../db/index.js', () => ({
  db: {
    query: {
      gigs: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
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
    mockDb.insert.mockReset();
    mockDb.update.mockReset();
  });

  it('allows a verified poster to create a draft gig', async () => {
    mockDb.insert.mockReturnValueOnce(mockInsertReturning(draftGig));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/gigs',
      headers: { authorization: `Bearer ${makeToken()}` },
      payload: {
        shortDescription: draftGig.shortDescription,
        longDescription: draftGig.longDescription,
        regionId: draftGig.regionId,
        cityId: draftGig.cityId,
        streetAddress: draftGig.streetAddress,
        priceType: 'fixed',
        priceFixed: draftGig.priceFixed,
      },
    });
    await app.close();

    expect(response.statusCode).toBe(201);
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
      error: 'Email and phone verification required',
      statusCode: 403,
    });
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

  it('lists and fetches only visible gigs', async () => {
    const visibleGigs = [{ ...draftGig, status: 'active' }];

    mockDb.query.gigs.findMany.mockResolvedValueOnce(visibleGigs);
    mockDb.query.gigs.findFirst
      .mockResolvedValueOnce(visibleGigs[0])
      .mockResolvedValueOnce(null);

    const app = await buildApp();

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/gigs',
    });

    const getResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/gigs/${draftGig.id}`,
    });

    const notFoundResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/gigs/33333333-3333-3333-3333-333333333333',
    });

    await app.close();

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      data: [
        expect.objectContaining({
          ...visibleGigs[0],
          createdAt: visibleGigs[0].createdAt.toISOString(),
          updatedAt: visibleGigs[0].updatedAt.toISOString(),
          expiresAt: visibleGigs[0].expiresAt.toISOString(),
        }),
      ],
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual({
      gig: expect.objectContaining({
        ...visibleGigs[0],
        createdAt: visibleGigs[0].createdAt.toISOString(),
        updatedAt: visibleGigs[0].updatedAt.toISOString(),
        expiresAt: visibleGigs[0].expiresAt.toISOString(),
      }),
    });

    expect(notFoundResponse.statusCode).toBe(404);
    expect(notFoundResponse.json()).toEqual({
      error: 'Gig not found',
      statusCode: 404,
    });
  });
});
