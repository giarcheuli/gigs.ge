jest.mock('../db/index.js', () => ({
  db: {
    query: {
      platformSettings: {
        findFirst: jest.fn(),
      },
    },
    insert: jest.fn(),
    transaction: jest.fn(),
  },
}));

import { buildApp } from '../app.js';
import { db } from '../db/index.js';
import { signAccessToken } from '../lib/auth.js';
import { platformSettingsHistory } from '../db/schema/platform-settings.js';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

const mockDb = db as unknown as {
  query: { platformSettings: { findFirst: jest.Mock } };
  insert: jest.Mock;
  transaction: jest.Mock;
};

const settingsRow = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  scope: 'global',
  posterFeePercent: '3.00',
  workerFeePercent: '2.00',
  cancelGraceHours: 24,
  completionResponseHours: 48,
  overdueAutoCompleteDays: 14,
  disputeArbiterUnlockHours: 24,
  disputeAutoResolveDays: 7,
  updatedAt: new Date('2026-10-14T10:00:00.000Z'),
  updatedBy: null,
};

const makeToken = (sub: string, role: 'admin' | 'user' = 'user') => signAccessToken({
  sub,
  role,
  status: 'active',
  emailVerified: true,
  phoneVerified: true,
});

const requestSettings = {
  posterFeePercent: 4.5,
  workerFeePercent: 1.5,
  cancelGraceHours: 12,
  completionResponseHours: 36,
  overdueAutoCompleteDays: 10,
  disputeArbiterUnlockHours: 18,
  disputeAutoResolveDays: 5,
};

describe('Admin platform settings routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.platformSettings.findFirst.mockResolvedValue(settingsRow);
  });

  it('allows an admin to read current settings', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings',
      headers: { authorization: `Bearer ${makeToken(ADMIN_ID, 'admin')}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().settings).toEqual({
      ...requestSettings,
      posterFeePercent: 3,
      workerFeePercent: 2,
      cancelGraceHours: 24,
      completionResponseHours: 48,
      overdueAutoCompleteDays: 14,
      disputeArbiterUnlockHours: 24,
      disputeAutoResolveDays: 7,
      updatedAt: settingsRow.updatedAt.toISOString(),
      updatedBy: null,
    });
  });

  it('rejects unauthenticated and non-admin reads', async () => {
    const app = await buildApp();
    const unauthenticated = await app.inject({ method: 'GET', url: '/api/v1/admin/settings' });
    const regularUser = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings',
      headers: { authorization: `Bearer ${makeToken(USER_ID)}` },
    });
    await app.close();

    expect(unauthenticated.statusCode).toBe(401);
    expect(regularUser.statusCode).toBe(403);
    expect(mockDb.query.platformSettings.findFirst).not.toHaveBeenCalled();
  });

  it('rejects invalid or partial updates before opening a transaction', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: { authorization: `Bearer ${makeToken(ADMIN_ID, 'admin')}` },
      payload: { ...requestSettings, posterFeePercent: 3.333 },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(mockDb.query.platformSettings.findFirst).not.toHaveBeenCalled();
  });

  it('updates settings and writes one audit record atomically', async () => {
    const updatedRow = {
      ...settingsRow,
      ...requestSettings,
      posterFeePercent: '4.50',
      workerFeePercent: '1.50',
      updatedAt: new Date('2026-10-14T11:00:00.000Z'),
      updatedBy: ADMIN_ID,
    };
    const auditValues = jest.fn().mockResolvedValue(undefined);
    const updateReturning = jest.fn().mockResolvedValue([updatedRow]);
    const updateWhere = jest.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
    const selectForUpdate = jest.fn().mockResolvedValue([settingsRow]);
    const selectWhere = jest.fn().mockReturnValue({ for: selectForUpdate });
    const selectFrom = jest.fn().mockReturnValue({ where: selectWhere });
    const tx = {
      select: jest.fn().mockReturnValue({ from: selectFrom }),
      update: jest.fn().mockReturnValue({ set: updateSet }),
      insert: jest.fn().mockReturnValue({ values: auditValues }),
    };
    mockDb.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));

    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: { authorization: `Bearer ${makeToken(ADMIN_ID, 'admin')}` },
      payload: requestSettings,
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().settings).toEqual({
      ...requestSettings,
      updatedAt: updatedRow.updatedAt.toISOString(),
      updatedBy: ADMIN_ID,
    });
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledWith(platformSettingsHistory);
    expect(auditValues).toHaveBeenCalledWith(expect.objectContaining({
      adminId: ADMIN_ID,
      previousValues: expect.objectContaining({ posterFeePercent: 3, cancelGraceHours: 24 }),
      newValues: expect.objectContaining({ posterFeePercent: 4.5, cancelGraceHours: 12 }),
    }));
  });
});
