jest.mock('../db/index.js', () => ({
  db: {
    query: {
      users: {
        findFirst: jest.fn(),
      },
      otpCodes: {
        findFirst: jest.fn(),
      },
    },
    transaction: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

import { buildApp } from '../app.js';
import { db } from '../db/index.js';
import { hashPassword } from '../lib/auth.js';

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

    mockDb.insert
      .mockReturnValueOnce(mockInsertResult())
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
});