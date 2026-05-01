jest.mock('../db/index.js', () => ({
  db: {
    query: {
      gigs: {
        findFirst: jest.fn(),
      },
      applications: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      contracts: {
        findFirst: jest.fn(),
      },
    },
    insert: jest.fn(),
    update: jest.fn(),
    transaction: jest.fn(),
  },
}));

import { buildApp } from '../app.js';
import { db } from '../db/index.js';
import { signAccessToken } from '../lib/auth.js';

const POSTER_ID = '11111111-1111-1111-1111-111111111111';
const WORKER_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_ID = '33333333-3333-3333-3333-333333333333';

const mockDb = db as unknown as {
  query: {
    gigs: {
      findFirst: jest.Mock;
    };
    applications: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    contracts: {
      findFirst: jest.Mock;
    };
  };
  insert: jest.Mock;
  update: jest.Mock;
  transaction: jest.Mock;
};

const makeToken = (sub: string, overrides: Record<string, unknown> = {}) => signAccessToken({
  sub,
  role: 'user',
  status: 'active',
  emailVerified: true,
  phoneVerified: true,
  ...overrides,
});

const activeGig = {
  id: '44444444-4444-4444-4444-444444444444',
  posterId: POSTER_ID,
  status: 'active',
  priceType: 'fixed',
  priceFixed: '120.00',
  availableFrom: new Date('2026-05-01T10:00:00.000Z'),
  availableTo: new Date('2026-05-10T10:00:00.000Z'),
};

const pendingApplication = {
  id: '55555555-5555-5555-5555-555555555555',
  gigId: activeGig.id,
  applicantId: WORKER_ID,
  status: 'pending',
  message: 'I can do this job',
  rejectionReason: null,
  createdAt: new Date('2026-05-01T10:05:00.000Z'),
  updatedAt: new Date('2026-05-01T10:05:00.000Z'),
};

const contractDraft = {
  id: '66666666-6666-6666-6666-666666666666',
  applicationId: pendingApplication.id,
  gigId: activeGig.id,
  posterId: POSTER_ID,
  workerId: WORKER_ID,
  agreedPrice: '120.00',
  agreedStartAt: new Date('2026-05-01T10:00:00.000Z'),
  dueAt: new Date('2026-05-10T10:00:00.000Z'),
  status: 'draft',
  posterSignedAt: null,
  workerSignedAt: null,
  feeEligible: true,
  completionMarkedBy: null,
  completionMarkedAt: null,
  completedAt: null,
  cancelledAt: null,
  disputedAt: null,
  quitAt: null,
  arbiterDecision: null,
  arbiterNotes: null,
  arbiterDecidedAt: null,
  createdAt: new Date('2026-05-01T10:06:00.000Z'),
  updatedAt: new Date('2026-05-01T10:06:00.000Z'),
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

describe('Applications + Contracts Routes Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.gigs.findFirst.mockReset();
    mockDb.query.applications.findFirst.mockReset();
    mockDb.query.applications.findMany.mockReset();
    mockDb.query.contracts.findFirst.mockReset();
    mockDb.insert.mockReset();
    mockDb.update.mockReset();
    mockDb.transaction.mockReset();
  });

  it('allows a verified worker to apply to an active gig', async () => {
    mockDb.query.gigs.findFirst.mockResolvedValueOnce(activeGig);
    mockDb.query.applications.findFirst.mockResolvedValueOnce(null);
    mockDb.insert.mockReturnValueOnce(mockInsertReturning(pendingApplication));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/applications',
      headers: { authorization: `Bearer ${makeToken(WORKER_ID)}` },
      payload: { gigId: activeGig.id, message: pendingApplication.message },
    });
    await app.close();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      application: expect.objectContaining({
        ...pendingApplication,
        createdAt: pendingApplication.createdAt.toISOString(),
        updatedAt: pendingApplication.updatedAt.toISOString(),
      }),
    });
  });

  it('rejects applications from unverified workers', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/applications',
      headers: {
        authorization: `Bearer ${makeToken(WORKER_ID, { emailVerified: false, phoneVerified: false })}`,
      },
      payload: { gigId: activeGig.id, message: 'hello' },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'Email and phone verification required',
      statusCode: 403,
    });
  });

  it('lets the poster list applications for their gig and accept one into a draft contract', async () => {
    const acceptedApplication = { ...pendingApplication, status: 'accepted' };

    mockDb.query.gigs.findFirst
      .mockResolvedValueOnce(activeGig)
      .mockResolvedValueOnce(activeGig);
    mockDb.query.applications.findMany.mockResolvedValueOnce([pendingApplication]);
    mockDb.query.applications.findFirst.mockResolvedValueOnce(pendingApplication);
    mockDb.query.contracts.findFirst.mockResolvedValueOnce(null);
    mockDb.transaction.mockImplementationOnce(async (callback: (tx: {
      update: jest.Mock;
      insert: jest.Mock;
    }) => Promise<readonly [typeof acceptedApplication, typeof contractDraft]>) => {
      const tx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([acceptedApplication]),
            }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([contractDraft]),
          }),
        }),
      };

      return callback(tx);
    });

    const app = await buildApp();

    const listResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/gig/${activeGig.id}`,
      headers: { authorization: `Bearer ${makeToken(POSTER_ID)}` },
    });

    const acceptResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/applications/${pendingApplication.id}/accept`,
      headers: { authorization: `Bearer ${makeToken(POSTER_ID)}` },
    });

    await app.close();

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      data: [
        expect.objectContaining({
          ...pendingApplication,
          createdAt: pendingApplication.createdAt.toISOString(),
          updatedAt: pendingApplication.updatedAt.toISOString(),
        }),
      ],
    });

    expect(acceptResponse.statusCode).toBe(200);
    expect(acceptResponse.json()).toEqual({
      application: expect.objectContaining({
        ...acceptedApplication,
        createdAt: acceptedApplication.createdAt.toISOString(),
        updatedAt: acceptedApplication.updatedAt.toISOString(),
      }),
      contract: expect.objectContaining({
        ...contractDraft,
        agreedStartAt: contractDraft.agreedStartAt.toISOString(),
        dueAt: contractDraft.dueAt.toISOString(),
        createdAt: contractDraft.createdAt.toISOString(),
        updatedAt: contractDraft.updatedAt.toISOString(),
      }),
    });
  });

  it('allows contract parties to view and sign a draft contract until it reaches in_progress', async () => {
    const posterSignedContract = {
      ...contractDraft,
      posterSignedAt: new Date('2026-05-01T10:07:00.000Z'),
      updatedAt: new Date('2026-05-01T10:07:00.000Z'),
    };

    const inProgressContract = {
      ...posterSignedContract,
      workerSignedAt: new Date('2026-05-01T10:08:00.000Z'),
      status: 'in_progress',
      updatedAt: new Date('2026-05-01T10:08:00.000Z'),
    };

    mockDb.query.contracts.findFirst
      .mockResolvedValueOnce(contractDraft)
      .mockResolvedValueOnce(contractDraft)
      .mockResolvedValueOnce(posterSignedContract);
    mockDb.update
      .mockReturnValueOnce(mockUpdateReturning(posterSignedContract))
      .mockReturnValueOnce(mockUpdateReturning(inProgressContract));

    const app = await buildApp();

    const fetchResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/contracts/${contractDraft.id}`,
      headers: { authorization: `Bearer ${makeToken(WORKER_ID)}` },
    });

    const posterSignResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/contracts/${contractDraft.id}/sign`,
      headers: { authorization: `Bearer ${makeToken(POSTER_ID)}` },
    });

    const workerSignResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/contracts/${contractDraft.id}/sign`,
      headers: { authorization: `Bearer ${makeToken(WORKER_ID)}` },
    });

    await app.close();

    expect(fetchResponse.statusCode).toBe(200);
    expect(fetchResponse.json()).toEqual({
      contract: expect.objectContaining({
        ...contractDraft,
        agreedStartAt: contractDraft.agreedStartAt.toISOString(),
        dueAt: contractDraft.dueAt.toISOString(),
        createdAt: contractDraft.createdAt.toISOString(),
        updatedAt: contractDraft.updatedAt.toISOString(),
      }),
    });

    expect(posterSignResponse.statusCode).toBe(200);
    expect(posterSignResponse.json()).toEqual({
      contract: expect.objectContaining({
        ...posterSignedContract,
        agreedStartAt: posterSignedContract.agreedStartAt.toISOString(),
        dueAt: posterSignedContract.dueAt.toISOString(),
        posterSignedAt: posterSignedContract.posterSignedAt.toISOString(),
        createdAt: posterSignedContract.createdAt.toISOString(),
        updatedAt: posterSignedContract.updatedAt.toISOString(),
      }),
    });

    expect(workerSignResponse.statusCode).toBe(200);
    expect(workerSignResponse.json()).toEqual({
      contract: expect.objectContaining({
        ...inProgressContract,
        agreedStartAt: inProgressContract.agreedStartAt.toISOString(),
        dueAt: inProgressContract.dueAt.toISOString(),
        posterSignedAt: inProgressContract.posterSignedAt.toISOString(),
        workerSignedAt: inProgressContract.workerSignedAt.toISOString(),
        createdAt: inProgressContract.createdAt.toISOString(),
        updatedAt: inProgressContract.updatedAt.toISOString(),
      }),
    });
  });

  it('blocks non-parties from viewing contracts', async () => {
    mockDb.query.contracts.findFirst.mockResolvedValueOnce(contractDraft);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/contracts/${contractDraft.id}`,
      headers: { authorization: `Bearer ${makeToken(OTHER_ID)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'You can only view your own contracts',
      statusCode: 403,
    });
  });
});
