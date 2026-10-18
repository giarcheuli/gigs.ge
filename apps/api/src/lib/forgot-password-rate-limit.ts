import { createHmac } from 'node:crypto';
import { lt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { authRateLimitBuckets } from '../db/schema/index.js';
import { env } from '../config/env.js';

export type IpRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type IncrementCounter = (bucketKey: string, expiresAt: Date) => Promise<number>;

export function createIpRateLimiter(
  incrementCounter: IncrementCounter,
  config: { scope: string; maxRequests: number; windowMs: number },
) {
  return async (ip: string, nowMs = Date.now()): Promise<IpRateLimitResult> => {
    const windowStartMs = Math.floor(nowMs / config.windowMs) * config.windowMs;
    const windowEndMs = windowStartMs + config.windowMs;
    const bucketKey = createHmac('sha256', env.JWT_ACCESS_SECRET)
      .update(`${config.scope}:${ip}:${windowStartMs}`)
      .digest('hex');
    const count = await incrementCounter(bucketKey, new Date(windowEndMs));

    if (count <= config.maxRequests) return { allowed: true };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000)),
    };
  };
}

export function createForgotPasswordRateLimiter(incrementCounter: IncrementCounter) {
  return createIpRateLimiter(incrementCounter, {
    scope: 'forgot-password',
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
  });
}

export function createAuthIpRateLimiter(incrementCounter: IncrementCounter) {
  return createIpRateLimiter(incrementCounter, {
    scope: 'auth',
    maxRequests: 10,
    windowMs: 60 * 1000,
  });
}

const incrementDatabaseCounter: IncrementCounter = async (bucketKey, expiresAt) => {
  const now = new Date();
  await db.delete(authRateLimitBuckets).where(lt(authRateLimitBuckets.expiresAt, now));

  const [bucket] = await db.insert(authRateLimitBuckets)
    .values({ bucketKey, count: 1, expiresAt })
    .onConflictDoUpdate({
      target: authRateLimitBuckets.bucketKey,
      set: { count: sql`${authRateLimitBuckets.count} + 1` },
    })
    .returning({ count: authRateLimitBuckets.count });

  return bucket.count;
};

export const consumeForgotPasswordRateLimit = createForgotPasswordRateLimiter(incrementDatabaseCounter);
export const consumeAuthIpRateLimit = createAuthIpRateLimiter(incrementDatabaseCounter);