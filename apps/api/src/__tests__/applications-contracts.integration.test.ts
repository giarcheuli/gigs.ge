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
      users: {
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
    gigs: { findFirst: jest.Mock };
    applications: { findFirst: jest.Mock; findMany: jest.Mock };
    contracts: { findFirst: jest.Mock };
    users: { findFirst: jest.Mock };
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

// contractDraft as returned by a plain db.query (no relations)
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

// contractDraft as returned by GET /:id (with relations hydrated)
const contractDraftHydrated = {
  ...contractDraft,
  gig: { id: activeGig.id, shortDescription: 'Fix leaking pipe', priceType: 'fixed' },
  application: { id: pendingApplication.id, message: pendingApplication.message },
};

// in_progress contract (both signed, past half-time for action tests)
const inProgressContract = {
  ...contractDraft,
  status: 'in_progress',
  posterSignedAt: new Date('2026-05-01T10:07:00.000Z'),
  workerSignedAt: new Date('2026-05-01T10:08:00.000Z'),
  // agreedStartAt 2026-05-01, dueAt 2026-05-10 → half-time ~2026-05-05 08:00
  // Tests run on 2026-05-11 so half-time is already past.
  updatedAt: new Date('2026-05-01T10:08:00.000Z'),
};

const POSTER_EMAIL = 'poster@example.com';
const WORKER_EMAIL = 'worker@example.com';
const UAT_WORKER_EMAIL = 'worker1@uat.gigs.ge';

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
    mockDb.query.users.findFirst.mockReset();
    mockDb.insert.mockReset();
    mockDb.update.mockReset();
    mockDb.transaction.mockReset();
  });

  it('allows a verified worker to apply to an active gig', async () => {
    mockDb.query.gigs.findFirst.mockResolvedValueOnce(activeGig);
    mockDb.query.applications.findFirst.mockResolvedValueOnce(null);
    mockDb.insert
      .mockReturnValueOnce(mockInsertReturning(pendingApplication))
      .mockReturnValueOnce(mockInsertReturning({ id: 'notification-1' }));

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

  it('rejects acceptance when the gig is not fixed-price in this UAT slice', async () => {
    const rangeGig = { ...activeGig, priceType: 'range', priceFixed: null };

    mockDb.query.applications.findFirst.mockResolvedValueOnce(pendingApplication);
    mockDb.query.gigs.findFirst.mockResolvedValueOnce(rangeGig);

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/applications/${pendingApplication.id}/accept`,
      headers: { authorization: `Bearer ${makeToken(POSTER_ID)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'Only fixed-price gigs are currently supported for contract acceptance',
      statusCode: 409,
    });
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('allows contract parties to view and sign a draft contract until it reaches in_progress', async () => {
    const posterSignedContract = {
      ...contractDraft,
      posterSignedAt: new Date('2026-05-01T10:07:00.000Z'),
      updatedAt: new Date('2026-05-01T10:07:00.000Z'),
    };

    const bothSignedContract = {
      ...posterSignedContract,
      workerSignedAt: new Date('2026-05-01T10:08:00.000Z'),
      status: 'in_progress',
      updatedAt: new Date('2026-05-01T10:08:00.000Z'),
    };

    // GET /:id returns hydrated shape; sign endpoints use plain shape
    mockDb.query.contracts.findFirst
      .mockResolvedValueOnce(contractDraftHydrated)  // GET fetch
      .mockResolvedValueOnce(contractDraft)           // POST sign (poster)
      .mockResolvedValueOnce(posterSignedContract);   // POST sign (worker)
    mockDb.update
      .mockReturnValueOnce(mockUpdateReturning(posterSignedContract))
      .mockReturnValueOnce(mockUpdateReturning(bothSignedContract));

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
        ...bothSignedContract,
        agreedStartAt: bothSignedContract.agreedStartAt.toISOString(),
        dueAt: bothSignedContract.dueAt.toISOString(),
        posterSignedAt: bothSignedContract.posterSignedAt.toISOString(),
        workerSignedAt: bothSignedContract.workerSignedAt.toISOString(),
        createdAt: bothSignedContract.createdAt.toISOString(),
        updatedAt: bothSignedContract.updatedAt.toISOString(),
      }),
    });
  });

  it('blocks non-parties from viewing contracts', async () => {
    mockDb.query.contracts.findFirst.mockResolvedValueOnce(contractDraftHydrated);

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

  // ── mark-complete ──────────────────────────────────────────────────────────

  it('worker can mark job complete (→ pending_completion) after half-time', async () => {
    const pendingCompletion = {
      ...inProgressContract,
      status: 'pending_completion',
      completionMarkedBy: WORKER_ID,
      completionMarkedAt: new Date('2026-05-11T12:00:00.000Z'),
      updatedAt: new Date('2026-05-11T12:00:00.000Z'),
    };

    mockDb.query.contracts.findFirst.mockResolvedValueOnce(inProgressContract);
    mockDb.query.users.findFirst.mockResolvedValueOnce({ email: WORKER_EMAIL });
    mockDb.update.mockReturnValueOnce(mockUpdateReturning(pendingCompletion));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/contracts/${inProgressContract.id}/mark-complete`,
      headers: { authorization: `Bearer ${makeToken(WORKER_ID)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().contract.status).toBe('pending_completion');
    expect(response.json().contract.completionMarkedBy).toBe(WORKER_ID);
  });

  it('UAT worker (@uat.gigs.ge) bypasses half-time rule on mark-complete', async () => {
    // Make the contract half-time NOT yet past (start now, due in 10 days)
    const futureContract = {
      ...inProgressContract,
      agreedStartAt: new Date(),
      dueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    };
    const pendingCompletion = { ...futureContract, status: 'pending_completion' };

    mockDb.query.contracts.findFirst.mockResolvedValueOnce(futureContract);
    mockDb.query.users.findFirst.mockResolvedValueOnce({ email: UAT_WORKER_EMAIL });
    mockDb.update.mockReturnValueOnce(mockUpdateReturning(pendingCompletion));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/contracts/${futureContract.id}/mark-complete`,
      headers: { authorization: `Bearer ${makeToken(WORKER_ID)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().contract.status).toBe('pending_completion');
  });

  it('blocks mark-complete before half-time for regular workers', async () => {
    const futureContract = {
      ...inProgressContract,
      agreedStartAt: new Date(),
      dueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    };

    mockDb.query.contracts.findFirst.mockResolvedValueOnce(futureContract);
    mockDb.query.users.findFirst.mockResolvedValueOnce({ email: WORKER_EMAIL });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/contracts/${futureContract.id}/mark-complete`,
      headers: { authorization: `Bearer ${makeToken(WORKER_ID)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/half-time/i);
  });

  it('poster can confirm completion (→ completed) from pending_completion', async () => {
    const pendingCompletion = {
      ...inProgressContract,
      status: 'pending_completion',
      completionMarkedBy: WORKER_ID,
      completionMarkedAt: new Date('2026-05-11T12:00:00.000Z'),
    };
    const completed = {
      ...pendingCompletion,
      status: 'completed',
      completedAt: new Date('2026-05-11T13:00:00.000Z'),
      updatedAt: new Date('2026-05-11T13:00:00.000Z'),
    };

    mockDb.query.contracts.findFirst.mockResolvedValueOnce(pendingCompletion);
    mockDb.query.users.findFirst.mockResolvedValueOnce({ email: POSTER_EMAIL });
    mockDb.update.mockReturnValueOnce(mockUpdateReturning(completed));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/contracts/${inProgressContract.id}/mark-complete`,
      headers: { authorization: `Bearer ${makeToken(POSTER_ID)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().contract.status).toBe('completed');
    expect(response.json().contract.completedAt).toBeTruthy();
  });

  // ── dispute ────────────────────────────────────────────────────────────────

  it('poster can raise a dispute from in_progress after half-time', async () => {
    const disputed = {
      ...inProgressContract,
      status: 'disputed',
      disputedAt: new Date('2026-05-11T12:00:00.000Z'),
      updatedAt: new Date('2026-05-11T12:00:00.000Z'),
    };

    mockDb.query.contracts.findFirst.mockResolvedValueOnce(inProgressContract);
    mockDb.query.users.findFirst.mockResolvedValueOnce({ email: POSTER_EMAIL });
    mockDb.update.mockReturnValueOnce(mockUpdateReturning(disputed));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/contracts/${inProgressContract.id}/dispute`,
      headers: { authorization: `Bearer ${makeToken(POSTER_ID)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().contract.status).toBe('disputed');
    expect(response.json().contract.disputedAt).toBeTruthy();
  });

  it('worker cannot raise a dispute', async () => {
    mockDb.query.contracts.findFirst.mockResolvedValueOnce(inProgressContract);

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/contracts/${inProgressContract.id}/dispute`,
      headers: { authorization: `Bearer ${makeToken(WORKER_ID)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
  });

  it('poster cannot dispute before half-time', async () => {
    const earlyContract = {
      ...inProgressContract,
      agreedStartAt: new Date(),
      dueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    };

    mockDb.query.contracts.findFirst.mockResolvedValueOnce(earlyContract);
    mockDb.query.users.findFirst.mockResolvedValueOnce({ email: POSTER_EMAIL });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/contracts/${earlyContract.id}/dispute`,
      headers: { authorization: `Bearer ${makeToken(POSTER_ID)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/half-time/i);
  });

  // ── cancel ─────────────────────────────────────────────────────────────────

  it('either party can cancel an in_progress contract (fee applies outside grace)', async () => {
    const cancelled = {
      ...inProgressContract,
      status: 'cancelled',
      cancelledAt: new Date('2026-05-11T12:00:00.000Z'),
      feeEligible: true,
      updatedAt: new Date('2026-05-11T12:00:00.000Z'),
    };

    mockDb.query.contracts.findFirst.mockResolvedValueOnce(inProgressContract);
    mockDb.update.mockReturnValueOnce(mockUpdateReturning(cancelled));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/contracts/${inProgressContract.id}/cancel`,
      headers: { authorization: `Bearer ${makeToken(POSTER_ID)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().contract.status).toBe('cancelled');
    expect(response.json().withinGrace).toBe(false);
  });

  it('cancellation within 24h of signing waives fees (grace period)', async () => {
    const now = new Date();
    const recentContract = {
      ...inProgressContract,
      // Both signed just 1 hour ago
      posterSignedAt: new Date(now.getTime() - 60 * 60 * 1000),
      workerSignedAt: new Date(now.getTime() - 60 * 60 * 1000),
    };
    const cancelled = {
      ...recentContract,
      status: 'cancelled',
      feeEligible: false,
      cancelledAt: now,
      updatedAt: now,
    };

    mockDb.query.contracts.findFirst.mockResolvedValueOnce(recentContract);
    mockDb.update.mockReturnValueOnce(mockUpdateReturning(cancelled));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/contracts/${recentContract.id}/cancel`,
      headers: { authorization: `Bearer ${makeToken(WORKER_ID)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().withinGrace).toBe(true);
    expect(response.json().contract.feeEligible).toBe(false);
  });

  it('blocks cancellation from non-parties', async () => {
    mockDb.query.contracts.findFirst.mockResolvedValueOnce(inProgressContract);

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/contracts/${inProgressContract.id}/cancel`,
      headers: { authorization: `Bearer ${makeToken(OTHER_ID)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
  });

  // ── quit ───────────────────────────────────────────────────────────────────

  it('worker can quit an in_progress contract (fee applies after 24h)', async () => {
    const quit = {
      ...inProgressContract,
      status: 'quit',
      quitAt: new Date('2026-05-11T12:00:00.000Z'),
      feeEligible: true,
      updatedAt: new Date('2026-05-11T12:00:00.000Z'),
    };

    mockDb.query.contracts.findFirst.mockResolvedValueOnce(inProgressContract);
    mockDb.update.mockReturnValueOnce(mockUpdateReturning(quit));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/contracts/${inProgressContract.id}/quit`,
      headers: { authorization: `Bearer ${makeToken(WORKER_ID)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().contract.status).toBe('quit');
    expect(response.json().quitNoFee).toBe(false);
  });

  it('worker quit within 24h of signing incurs no fee', async () => {
    const now = new Date();
    const recentContract = {
      ...inProgressContract,
      workerSignedAt: new Date(now.getTime() - 30 * 60 * 1000), // 30 min ago
    };
    const quit = {
      ...recentContract,
      status: 'quit',
      feeEligible: false,
      quitAt: now,
      updatedAt: now,
    };

    mockDb.query.contracts.findFirst.mockResolvedValueOnce(recentContract);
    mockDb.update.mockReturnValueOnce(mockUpdateReturning(quit));

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/contracts/${recentContract.id}/quit`,
      headers: { authorization: `Bearer ${makeToken(WORKER_ID)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().quitNoFee).toBe(true);
    expect(response.json().contract.feeEligible).toBe(false);
  });

  it('poster cannot quit a contract (worker only)', async () => {
    mockDb.query.contracts.findFirst.mockResolvedValueOnce(inProgressContract);

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/contracts/${inProgressContract.id}/quit`,
      headers: { authorization: `Bearer ${makeToken(POSTER_ID)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
  });
});
