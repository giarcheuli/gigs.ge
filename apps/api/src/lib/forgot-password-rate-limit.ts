import { createHmac } from 'node:crypto';
import { lt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { authRateLimitBuckets } from '../db/schema/index.js';
import { env } from '../config/env.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 5;

export type ForgotPasswordRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type IncrementCounter = (bucketKey: string, expiresAt: Date) => Promise<number>;

export function createForgotPasswordRateLimiter(incrementCounter: IncrementCounter) {
  return async (ip: string, nowMs = Date.now()): Promise<ForgotPasswordRateLimitResult> => {
    const windowStartMs = Math.floor(nowMs / WINDOW_MS) * WINDOW_MS;
    const windowEndMs = windowStartMs + WINDOW_MS;
    const bucketKey = createHmac('sha256', env.JWT_ACCESS_SECRET)
      .update(`${ip}:${windowStartMs}`)
      .digest('hex');
    const count = await incrementCounter(bucketKey, new Date(windowEndMs));

    if (count <= MAX_REQUESTS) return { allowed: true };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000)),
    };
  };
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