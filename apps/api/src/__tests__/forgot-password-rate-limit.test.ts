import {
  createAuthIpRateLimiter,
  createForgotPasswordRateLimiter,
} from '../lib/forgot-password-rate-limit.js';

describe('forgot-password rate limit', () => {
  it('limits five requests per IP in a shared fixed window without storing the raw IP', async () => {
    const increments = new Map<string, number>();
    const incrementCounter = jest.fn(async (key: string) => {
      const count = (increments.get(key) ?? 0) + 1;
      increments.set(key, count);
      return count;
    });
    const limiter = createForgotPasswordRateLimiter(incrementCounter);
    const now = Date.UTC(2026, 9, 19, 12, 1, 0);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(limiter('203.0.113.8', now)).resolves.toEqual({ allowed: true });
    }
    await expect(limiter('203.0.113.8', now)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 14 * 60,
    });
    expect(incrementCounter.mock.calls[0][0]).not.toContain('203.0.113.8');
    expect(await limiter('203.0.113.9', now)).toEqual({ allowed: true });
    expect(await limiter('203.0.113.8', now + 15 * 60 * 1000)).toEqual({ allowed: true });
  });

  it('limits auth endpoints to ten requests per IP per minute', async () => {
    const counts = new Map<string, number>();
    const limiter = createAuthIpRateLimiter(async (key) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return count;
    });
    const now = Date.UTC(2026, 9, 19, 12, 0, 15);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(limiter('203.0.113.8', now)).resolves.toEqual({ allowed: true });
    }
    await expect(limiter('203.0.113.8', now)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 45,
    });
  });
});