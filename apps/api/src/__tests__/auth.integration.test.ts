jest.mock('../db/index.js', () => ({
  db: {
    query: {
      users: {
        findFirst: jest.fn(),
      },
      otpCodes: {
        findFirst: jest.fn(),
      },
      refreshTokens: {
        findFirst: jest.fn(),
      },
    },
    transaction: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('../lib/auth-email.js', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({ accepted: true, messageId: 'verification-1' }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ accepted: true, messageId: 'reset-1' }),
}));

jest.mock('../lib/auth-email-queue.js', () => {
  const actual = jest.requireActual('../lib/auth-email-queue.js');
  return {
    ...actual,
    enqueueAuthEmailTask: jest.fn().mockResolvedValue({ queued: true, deliveryId: 'delivery-1' }),
  };
});

jest.mock('../lib/forgot-password-rate-limit.js', () => ({
  consumeAuthIpRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  consumeForgotPasswordRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));

import crypto from 'node:crypto';
import { buildApp } from '../app.js';
import { db } from '../db/index.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../lib/auth-email.js';
import {
  createAuthEmailTaskEnvelope,
  enqueueAuthEmailTask,
  signAuthEmailTaskEnvelope,
} from '../lib/auth-email-queue.js';
import { consumeAuthIpRateLimit, consumeForgotPasswordRateLimit } from '../lib/forgot-password-rate-limit.js';
import { hashPassword, signAccessToken, signRefreshToken, hashToken } from '../lib/auth.js';

type MockUser = {
  id: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  passwordHash: string;
};

const mockDb = db as unknown as {
  query: {
    users: {
      findFirst: jest.Mock;
    };
    otpCodes: {
      findFirst: jest.Mock;
    };
    refreshTokens: {
      findFirst: jest.Mock;
    };
  };
  transaction: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
};

const makeUser = (overrides: Partial<MockUser> = {}): MockUser => ({
  id: '11111111-1111-1111-1111-111111111111',
  email: 'worker@example.com',
  phone: '+995555123456',
  role: 'user',
  status: 'active',
  emailVerified: false,
  phoneVerified: false,
  passwordHash: '$2a$12$e0NRn6sQxBrq3wM7gL3ObOlW1E0uK0s8AjtKoa6HgMHqmpYyqn1nK',
  ...overrides,
});

const mockInsertResult = () => ({
  values: jest.fn().mockResolvedValue(undefined),
});

const mockUpdateResult = () => ({
  set: jest.fn().mockReturnValue({
    where: jest.fn().mockResolvedValue(undefined),
  }),
});

describe('Auth Routes Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.insert.mockReset();
    mockDb.update.mockReset();
    mockDb.transaction.mockReset();
    mockDb.query.users.findFirst.mockReset();
    mockDb.query.otpCodes.findFirst.mockReset();
    mockDb.query.refreshTokens.findFirst.mockReset();
  });

  it('registers a user and sets the refresh token cookie', async () => {
    const newUser = makeUser();

    mockDb.query.users.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: jest.fn()
          .mockReturnValueOnce({
            values: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([newUser]),
            }),
          })
          .mockReturnValueOnce({
            values: jest.fn().mockResolvedValue(undefined),
          }),
      };

      return callback(tx);
    });

    const otpInsert = mockInsertResult();
    mockDb.insert
      .mockReturnValueOnce(otpInsert)
      .mockReturnValueOnce(mockInsertResult());

    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'worker@example.com',
        phone: '+995555123456',
        password: 'Password123',
        dateOfBirth: '1990-01-01',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(201);
    expect(response.cookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'refresh_token', httpOnly: true }),
      ]),
    );

    expect(response.json()).toEqual(
      expect.objectContaining({
        accessToken: expect.any(String),
        user: expect.objectContaining({
          id: newUser.id,
          email: newUser.email,
          phone: newUser.phone,
        }),
      }),
    );
    expect(otpInsert.values).toHaveBeenCalledWith(expect.objectContaining({ channel: 'email' }));
    expect(otpInsert.values).toHaveBeenCalledTimes(1);
    expect(otpInsert.values).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'email_verification' }));
    expect(enqueueAuthEmailTask).toHaveBeenCalledWith(expect.objectContaining({
      type: 'verification',
      userId: newUser.id,
      credential: expect.any(String),
      expiresAt: expect.any(String),
    }));
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect(response.json().emailDeliveryStatus).toBe('queued');
  });

  it('keeps registration successful but reports failed email delivery without exposing the code', async () => {
    const newUser = makeUser();
    mockDb.query.users.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: jest.fn()
          .mockReturnValueOnce({
            values: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([newUser]) }),
          })
          .mockReturnValueOnce({ values: jest.fn().mockResolvedValue(undefined) }),
      };
      return callback(tx);
    });
    mockDb.insert.mockReturnValueOnce(mockInsertResult()).mockReturnValueOnce(mockInsertResult());
    jest.mocked(enqueueAuthEmailTask).mockResolvedValueOnce({ queued: false, reason: 'queue_error' });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'worker@example.com',
        phone: '+995555123456',
        password: 'Password123',
        dateOfBirth: '1990-01-01',
      },
    });
    await app.close();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      emailDeliveryStatus: 'failed',
      retryAfterSeconds: 60,
    });
    expect(response.json()).not.toHaveProperty('_dev');
  });

  it('rejects underage registration before touching the database', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'teen@example.com',
        phone: '+995555000111',
        password: 'Password123',
        dateOfBirth: '2010-01-01',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'Must be at least 18 years old',
      statusCode: 400,
    });
    expect(mockDb.query.users.findFirst).not.toHaveBeenCalled();
  });

  it('rejects duplicate email registration', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUser());

    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'worker@example.com',
        phone: '+995555123456',
        password: 'Password123',
        dateOfBirth: '1990-01-01',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'Email already registered',
      statusCode: 409,
    });
  });

  it('logs in an existing user and updates lastAccessedAt', async () => {
    const user = makeUser({
      passwordHash: await hashPassword('Password123'),
    });

    mockDb.query.users.findFirst.mockResolvedValueOnce(user);
    mockDb.update.mockReturnValueOnce(mockUpdateResult());
    mockDb.insert.mockReturnValueOnce(mockInsertResult());

    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: user.email,
        password: 'Password123',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.cookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'refresh_token', httpOnly: true }),
      ]),
    );
    expect(response.json()).toEqual(
      expect.objectContaining({
        accessToken: expect.any(String),
        user: expect.objectContaining({ id: user.id, email: user.email }),
      }),
    );
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid login credentials', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(null);

    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'missing@example.com',
        password: 'Password123',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'Invalid email or password',
      statusCode: 401,
    });
  });

  it('enforces the shared auth IP limit before looking up login credentials', async () => {
    jest.mocked(consumeAuthIpRateLimit).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 60,
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'worker@example.com', password: 'WrongPassword123' },
    });
    await app.close();

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: 'AUTH_RATE_LIMIT', retryAfterSeconds: 60 });
    expect(mockDb.query.users.findFirst).not.toHaveBeenCalled();
  });
});

// ── Helper used across the remaining suites ──────────────────────────────────
const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

const makeAccessToken = (overrides: Record<string, unknown> = {}) =>
  signAccessToken({
    sub: TEST_USER_ID,
    role: 'user',
    status: 'active',
    emailVerified: false,
    phoneVerified: false,
    ...overrides,
  } as Parameters<typeof signAccessToken>[0]);

// ── refresh ───────────────────────────────────────────────────────────────────
describe('Auth Routes Integration — refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.insert.mockReset();
    mockDb.update.mockReset();
    mockDb.transaction.mockReset();
    mockDb.query.users.findFirst.mockReset();
    mockDb.query.otpCodes.findFirst.mockReset();
    mockDb.query.refreshTokens.findFirst.mockReset();
  });

  it('returns new access token and rotates the refresh cookie', async () => {
    const familyId = 'fam-aaa';
    const refreshToken = signRefreshToken(TEST_USER_ID, familyId);
    const storedToken = { id: 'tok-aaa', userId: TEST_USER_ID, familyId, tokenHash: hashToken(refreshToken) };

    mockDb.query.refreshTokens.findFirst.mockResolvedValueOnce(storedToken);
    mockDb.update.mockReturnValueOnce(mockUpdateResult());
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUser());
    mockDb.insert.mockReturnValueOnce(mockInsertResult());

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refresh_token: refreshToken },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accessToken: expect.any(String) });
    expect(response.cookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'refresh_token', httpOnly: true }),
      ]),
    );
  });

  it('returns 401 when no refresh cookie is present', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh' });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'No refresh token', statusCode: 401 });
  });

  it('returns 401 for a tampered refresh token', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refresh_token: 'not.a.valid.jwt' },
    });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Invalid or expired refresh token', statusCode: 401 });
  });

  it('revokes the token family and returns 401 on token reuse', async () => {
    const refreshToken = signRefreshToken(TEST_USER_ID, 'fam-reuse');

    mockDb.query.refreshTokens.findFirst.mockResolvedValueOnce(null);
    mockDb.update.mockReturnValueOnce(mockUpdateResult());

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refresh_token: refreshToken },
    });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'Token reuse detected. All sessions revoked.',
      statusCode: 401,
    });
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });
});

// ── logout ────────────────────────────────────────────────────────────────────
describe('Auth Routes Integration — logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.insert.mockReset();
    mockDb.update.mockReset();
    mockDb.transaction.mockReset();
    mockDb.query.users.findFirst.mockReset();
    mockDb.query.otpCodes.findFirst.mockReset();
    mockDb.query.refreshTokens.findFirst.mockReset();
  });

  it('revokes the refresh token and clears the cookie', async () => {
    const refreshToken = signRefreshToken(TEST_USER_ID, 'fam-logout');
    mockDb.update.mockReturnValueOnce(mockUpdateResult());

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { refresh_token: refreshToken },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'Logged out' });
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it('succeeds without a refresh cookie', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'Logged out' });
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

// ── verify-otp ────────────────────────────────────────────────────────────────
describe('Auth Routes Integration — verify-otp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.insert.mockReset();
    mockDb.update.mockReset();
    mockDb.transaction.mockReset();
    mockDb.query.users.findFirst.mockReset();
    mockDb.query.otpCodes.findFirst.mockReset();
    mockDb.query.refreshTokens.findFirst.mockReset();
  });

  const authHeaders = () => ({ authorization: `Bearer ${makeAccessToken()}` });

  it('returns 401 without an Authorization header', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-otp?channel=email',
      payload: { code: '123456' },
    });
    await app.close();

    expect(response.statusCode).toBe(401);
  });

  it('returns 400 for an invalid channel value', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-otp?channel=fax',
      headers: authHeaders(),
      payload: { code: '123456' },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: expect.stringContaining('channel') });
  });

  it('does not offer phone verification while SMS delivery is unavailable', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-otp?channel=sms',
      headers: authHeaders(),
      payload: { code: '123456' },
    });
    await app.close();

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'Phone verification is optional and is not available yet',
      code: 'PHONE_VERIFICATION_NOT_AVAILABLE',
      statusCode: 409,
    });
    expect(mockDb.query.otpCodes.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 when no valid OTP record exists', async () => {
    mockDb.query.otpCodes.findFirst.mockResolvedValueOnce(null);

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-otp?channel=email',
      headers: authHeaders(),
      payload: { code: '123456' },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'No valid email code found. Request a new code to continue.',
      code: 'EMAIL_OTP_EXPIRED',
      statusCode: 400,
    });
  });

  it('returns 429 when the attempt limit is exceeded', async () => {
    mockDb.query.otpCodes.findFirst.mockResolvedValueOnce({
      id: 'otp-001',
      attempts: 5,
      codeHash: crypto.createHash('sha256').update('123456').digest('hex'),
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-otp?channel=email',
      headers: authHeaders(),
      payload: { code: '123456' },
    });
    await app.close();

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      error: 'Too many attempts. Request a new code before trying again.',
      code: 'OTP_ATTEMPTS_EXHAUSTED',
      statusCode: 429,
    });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns 400 for an incorrect OTP code', async () => {
    mockDb.query.otpCodes.findFirst.mockResolvedValueOnce({
      id: 'otp-002',
      attempts: 0,
      codeHash: crypto.createHash('sha256').update('123456').digest('hex'),
    });
    mockDb.update.mockReturnValueOnce(mockUpdateResult());

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-otp?channel=email',
      headers: authHeaders(),
      payload: { code: '999999' },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'That code is incorrect. Check it and try again.',
      code: 'INVALID_OTP',
      statusCode: 400,
    });
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it('marks email as verified for a correct OTP', async () => {
    const validCode = '654321';
    mockDb.query.otpCodes.findFirst.mockResolvedValueOnce({
      id: 'otp-003',
      attempts: 0,
      codeHash: crypto.createHash('sha256').update(validCode).digest('hex'),
    });
    mockDb.update
      .mockReturnValueOnce(mockUpdateResult())
      .mockReturnValueOnce(mockUpdateResult())
      .mockReturnValueOnce(mockUpdateResult());

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-otp?channel=email',
      headers: authHeaders(),
      payload: { code: validCode },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ verified: true, channel: 'email' });
    expect(mockDb.update).toHaveBeenCalledTimes(3);
  });
});

describe('Auth Routes Integration — resend-otp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.insert.mockReset();
    mockDb.query.otpCodes.findFirst.mockReset();
    mockDb.query.users.findFirst.mockReset();
  });

  const authHeaders = () => ({ authorization: `Bearer ${makeAccessToken()}` });

  it('does not create phone codes while phone verification is unavailable', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/resend-otp?channel=sms',
      headers: authHeaders(),
    });
    await app.close();

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'PHONE_VERIFICATION_NOT_AVAILABLE' });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('enforces the 60-second email resend cooldown', async () => {
    mockDb.query.otpCodes.findFirst.mockResolvedValueOnce({
      createdAt: new Date(Date.now() - 30_000),
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/resend-otp?channel=email',
      headers: authHeaders(),
    });
    await app.close();

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: 'OTP_RESEND_COOLDOWN' });
    expect(response.json().retryAfterSeconds).toBeGreaterThan(0);
    expect(response.json().retryAfterSeconds).toBeLessThanOrEqual(30);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('creates an email code when no recent code exists', async () => {
    mockDb.query.otpCodes.findFirst.mockResolvedValueOnce(null);
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUser());
    const insertResult = mockInsertResult();
    mockDb.insert.mockReturnValueOnce(insertResult);

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/resend-otp?channel=email',
      headers: authHeaders(),
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().message).toBe('Verification email queued for delivery');
    expect(insertResult.values).toHaveBeenCalledWith(expect.objectContaining({
      userId: TEST_USER_ID,
      channel: 'email',
      purpose: 'email_verification',
    }));
    expect(enqueueAuthEmailTask).toHaveBeenCalledWith(expect.objectContaining({
      type: 'verification',
      userId: TEST_USER_ID,
      credential: expect.any(String),
    }));
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('returns a safe retry response when email delivery fails', async () => {
    mockDb.query.otpCodes.findFirst.mockResolvedValueOnce(null);
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUser());
    mockDb.insert.mockReturnValueOnce(mockInsertResult());
    jest.mocked(enqueueAuthEmailTask).mockResolvedValueOnce({ queued: false, reason: 'queue_error' });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/resend-otp?channel=email',
      headers: authHeaders(),
    });
    await app.close();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: 'EMAIL_DELIVERY_UNAVAILABLE',
      retryAfterSeconds: 60,
    });
    expect(response.json()).not.toHaveProperty('_dev');
  });
});

// ── forgot-password ───────────────────────────────────────────────────────────
describe('Auth Routes Integration — forgot-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.insert.mockReset();
    mockDb.update.mockReset();
    mockDb.transaction.mockReset();
    mockDb.query.users.findFirst.mockReset();
    mockDb.query.otpCodes.findFirst.mockReset();
    mockDb.query.refreshTokens.findFirst.mockReset();
  });

  it('returns success without leaking whether the email is registered', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(null);

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'nobody@example.com' },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: 'If that email exists, a reset link has been sent.',
    });
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(enqueueAuthEmailTask).toHaveBeenCalledWith({ type: 'noop' });
  });

  it('keeps known and unknown reset requests on the same minimum response-time floor', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(makeUser());
    mockDb.insert.mockReturnValueOnce(mockInsertResult());

    const app = await buildApp();
    const request = async (email: string) => {
      const startedAt = Date.now();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: { email },
      });
      return { response, durationMs: Date.now() - startedAt };
    };
    const unknown = await request('nobody@example.com');
    const known = await request('worker@example.com');
    await app.close();

    expect(unknown.response.json()).toEqual(known.response.json());
    expect(unknown.durationMs).toBeGreaterThanOrEqual(350);
    expect(known.durationMs).toBeGreaterThanOrEqual(350);
    expect(Math.abs(unknown.durationMs - known.durationMs)).toBeLessThan(250);
  });

  it('stores a reset token when the email is registered', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUser());
    const insertResult = mockInsertResult();
    mockDb.insert.mockReturnValueOnce(insertResult);

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'worker@example.com' },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      message: 'If that email exists, a reset link has been sent.',
    });
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(enqueueAuthEmailTask).toHaveBeenCalledWith(expect.objectContaining({
      type: 'password_reset',
      userId: TEST_USER_ID,
      credential: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(insertResult.values).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'password_reset' }));
  });

  it('keeps the generic response when reset email delivery fails', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUser());
    mockDb.insert.mockReturnValueOnce(mockInsertResult());
    jest.mocked(enqueueAuthEmailTask).mockResolvedValueOnce({ queued: false, reason: 'queue_error' });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'worker@example.com' },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: 'If that email exists, a reset link has been sent.',
    });
  });

  it('rate-limits forgot-password requests by IP', async () => {
    mockDb.query.users.findFirst.mockResolvedValue(null);
    jest.mocked(consumeForgotPasswordRateLimit).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 900,
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'nobody@example.com' },
    });
    await app.close();

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: 'FORGOT_PASSWORD_RATE_LIMIT', retryAfterSeconds: 900 });
    expect(enqueueAuthEmailTask).not.toHaveBeenCalled();
  });

  it('uses the caller IP after Cloud Run proxy hops instead of a forged forwarded value', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(null);
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      headers: { 'x-forwarded-for': '198.51.100.99, 203.0.113.44, 35.191.1.1' },
      payload: { email: 'nobody@example.com' },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(consumeForgotPasswordRateLimit).toHaveBeenCalledWith('203.0.113.44');
  });
});

describe('Auth Routes Integration — internal email task', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.users.findFirst.mockReset();
    mockDb.query.otpCodes.findFirst.mockReset();
  });

  it('rejects an unsigned task without querying credentials or sending email', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/internal/email-delivery',
      payload: { type: 'noop', deliveryId: crypto.randomUUID() },
    });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(mockDb.query.otpCodes.findFirst).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('sends only a signed, current verification task with its delivery id as idempotency key', async () => {
    const task = {
      type: 'verification' as const,
      userId: TEST_USER_ID,
      credential: '123456',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const envelope = createAuthEmailTaskEnvelope(task, process.env.JWT_ACCESS_SECRET ?? 'test-secret', crypto.randomUUID());
    mockDb.query.otpCodes.findFirst.mockResolvedValueOnce({ id: 'otp-current' });
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUser());

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/internal/email-delivery',
      headers: { 'x-gigs-auth-email-signature': signAuthEmailTaskEnvelope(envelope, process.env.JWT_ACCESS_SECRET ?? 'test-secret') },
      payload: envelope,
    });
    await app.close();

    expect(response.statusCode).toBe(204);
    expect(sendVerificationEmail).toHaveBeenCalledWith('worker@example.com', '123456', envelope.deliveryId);
  });

  it('acknowledges an expired task without querying or sending', async () => {
    const envelope = createAuthEmailTaskEnvelope({
      type: 'verification',
      userId: TEST_USER_ID,
      credential: '123456',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    }, process.env.JWT_ACCESS_SECRET ?? 'test-secret');

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/internal/email-delivery',
      headers: { 'x-gigs-auth-email-signature': signAuthEmailTaskEnvelope(envelope, process.env.JWT_ACCESS_SECRET ?? 'test-secret') },
      payload: envelope,
    });
    await app.close();

    expect(response.statusCode).toBe(204);
    expect(mockDb.query.otpCodes.findFirst).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('sends reset links only for a signed, current reset task', async () => {
    const resetToken = 'a1b2c3d4'.repeat(8);
    const envelope = createAuthEmailTaskEnvelope({
      type: 'password_reset',
      userId: TEST_USER_ID,
      credential: resetToken,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }, process.env.JWT_ACCESS_SECRET ?? 'test-secret');
    mockDb.query.otpCodes.findFirst.mockResolvedValueOnce({ id: 'otp-reset-current' });
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUser());

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/internal/email-delivery',
      headers: { 'x-gigs-auth-email-signature': signAuthEmailTaskEnvelope(envelope, process.env.JWT_ACCESS_SECRET ?? 'test-secret') },
      payload: envelope,
    });
    await app.close();

    expect(response.statusCode).toBe(204);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      'worker@example.com',
      expect.stringContaining(`#token=${resetToken}`),
      envelope.deliveryId,
    );
  });
});

// ── reset-password ────────────────────────────────────────────────────────────
describe('Auth Routes Integration — reset-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.insert.mockReset();
    mockDb.update.mockReset();
    mockDb.transaction.mockReset();
    mockDb.query.users.findFirst.mockReset();
    mockDb.query.otpCodes.findFirst.mockReset();
    mockDb.query.refreshTokens.findFirst.mockReset();
  });

  it('returns 400 for an invalid or expired reset token', async () => {
    mockDb.query.otpCodes.findFirst.mockResolvedValueOnce(null);

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: 'deadbeef'.repeat(8), password: 'NewPass123' },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'Invalid or expired reset token',
      statusCode: 400,
    });
  });

  it('updates the password and revokes all sessions for a valid token', async () => {
    const resetToken = 'a1b2c3d4'.repeat(8);
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    mockDb.query.otpCodes.findFirst.mockResolvedValueOnce({
      id: 'otp-reset-001',
      userId: TEST_USER_ID,
      codeHash: tokenHash,
    });
    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: jest.fn()
          .mockReturnValueOnce({
            set: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([{ userId: TEST_USER_ID }]),
              }),
            }),
          })
          .mockReturnValueOnce(mockUpdateResult())
          .mockReturnValueOnce(mockUpdateResult()),
      };
      return callback(tx);
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: resetToken, password: 'NewPassword123' },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'Password reset successful. Please log in.' });
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects a reset token if another request claimed it first', async () => {
    const resetToken = 'a1b2c3d4'.repeat(8);
    mockDb.query.otpCodes.findFirst.mockResolvedValueOnce({
      id: 'otp-reset-race',
      userId: TEST_USER_ID,
      codeHash: crypto.createHash('sha256').update(resetToken).digest('hex'),
    });
    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }),
          }),
        }),
      };
      return callback(tx);
    });

    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: resetToken, password: 'NewPassword123' },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Invalid or expired reset token', statusCode: 400 });
  });
});

// ── me ────────────────────────────────────────────────────────────────────────
describe('Auth Routes Integration — me', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.insert.mockReset();
    mockDb.update.mockReset();
    mockDb.transaction.mockReset();
    mockDb.query.users.findFirst.mockReset();
    mockDb.query.otpCodes.findFirst.mockReset();
    mockDb.query.refreshTokens.findFirst.mockReset();
  });

  it('returns 401 without an Authorization header', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    await app.close();

    expect(response.statusCode).toBe(401);
  });

  it('returns the current user for a valid access token', async () => {
    const user = makeUser({ emailVerified: true, phoneVerified: true });
    mockDb.query.users.findFirst.mockResolvedValueOnce(user);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${makeAccessToken({ emailVerified: true, phoneVerified: true })}`,
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ id: user.id, email: user.email, role: user.role }),
      }),
    );
  });

  it('returns 404 when the user no longer exists in the database', async () => {
    mockDb.query.users.findFirst.mockResolvedValueOnce(null);

    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${makeAccessToken()}` },
    });
    await app.close();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'User not found', statusCode: 404 });
  });
});