import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { users, userProfiles, refreshTokens, otpCodes } from '../../db/schema/index.js';
import { eq, and, isNull, gt } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash, randomUUID } from 'crypto';
import { signAccessToken } from '../../plugins/jwt.js';
import { requireAuth } from '../../plugins/auth.js';
import {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  resetPasswordSchema,
} from '@gigs/shared';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /register
  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { email, phone, password, dateOfBirth } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const [user] = await db.insert(users).values({
        email,
        phone,
        passwordHash,
        dateOfBirth,
        emailVerified: false,
        phoneVerified: false,
      }).returning({ id: users.id });

      await db.insert(userProfiles).values({ userId: user.id });

      const otp = generateOtp();
      const codeHash = await bcrypt.hash(otp, 10);
      await db.insert(otpCodes).values({
        userId: user.id,
        channel: 'email',
        codeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      return reply.status(201).send({ message: 'Verification email sent' });
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === '23505') {
        return reply.status(409).send({ error: 'Email or phone already registered', statusCode: 409 });
      }
      throw err;
    }
  });

  // POST /login
  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { email, password } = parsed.data;

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials', statusCode: 401 });
    }
    const valid = await bcrypt.compare(password, user.passwordHash ?? '');
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials', statusCode: 401 });
    }
    if (user.status === 'banned' || user.status === 'suspended') {
      return reply.status(403).send({ error: 'Account suspended or banned', statusCode: 403 });
    }

    await db.update(users).set({ lastAccessedAt: new Date() }).where(eq(users.id, user.id));

    const familyId = randomUUID();
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash,
      familyId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const accessToken = signAccessToken(user.id, user.role ?? 'user');

    reply.setCookie('refresh_token', rawToken, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return reply.send({ accessToken });
  });

  // POST /logout
  app.post('/logout', async (request, reply) => {
    const rawToken = request.cookies['refresh_token'];
    if (rawToken) {
      const tokenHash = sha256(rawToken);
      await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
    }
    reply.clearCookie('refresh_token', { path: '/' });
    return reply.send({ message: 'Logged out' });
  });

  // POST /refresh
  app.post('/refresh', async (request, reply) => {
    const rawToken = request.cookies['refresh_token'];
    if (!rawToken) {
      return reply.status(401).send({ error: 'No refresh token', statusCode: 401 });
    }
    const tokenHash = sha256(rawToken);
    const [record] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
    if (!record) {
      return reply.status(401).send({ error: 'Invalid refresh token', statusCode: 401 });
    }
    if (record.revokedAt !== null) {
      // Token reuse detected — revoke entire family
      await db.update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, record.familyId), isNull(refreshTokens.revokedAt)));
      reply.clearCookie('refresh_token', { path: '/' });
      return reply.status(401).send({ error: 'Token reuse detected', statusCode: 401 });
    }
    if (new Date() > record.expiresAt) {
      return reply.status(401).send({ error: 'Refresh token expired', statusCode: 401 });
    }

    // Rotate: revoke old, create new
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, record.id));

    const [user] = await db.select().from(users).where(eq(users.id, record.userId)).limit(1);
    if (!user) {
      return reply.status(401).send({ error: 'User not found', statusCode: 401 });
    }

    const newRawToken = randomBytes(32).toString('hex');
    const newTokenHash = sha256(newRawToken);
    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: newTokenHash,
      familyId: record.familyId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const accessToken = signAccessToken(user.id, user.role ?? 'user');

    reply.setCookie('refresh_token', newRawToken, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return reply.send({ accessToken });
  });

  // POST /verify/email
  app.post('/verify/email', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = verifyOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { code } = parsed.data;
    const now = new Date();
    const records = await db.select().from(otpCodes)
      .where(and(
        eq(otpCodes.userId, request.user.id),
        eq(otpCodes.channel, 'email'),
        isNull(otpCodes.usedAt),
        gt(otpCodes.expiresAt, now),
      ))
      .orderBy(otpCodes.createdAt)
      .limit(1);

    const record = records[0];
    if (!record) {
      return reply.status(400).send({ error: 'No valid OTP found', statusCode: 400 });
    }
    const valid = await bcrypt.compare(code, record.codeHash);
    if (!valid) {
      return reply.status(400).send({ error: 'Invalid OTP', statusCode: 400 });
    }
    await db.update(otpCodes).set({ usedAt: new Date() }).where(eq(otpCodes.id, record.id));
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, request.user.id));
    return reply.send({ message: 'Email verified' });
  });

  // POST /verify/phone
  app.post('/verify/phone', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = verifyOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { code } = parsed.data;
    const now = new Date();
    const records = await db.select().from(otpCodes)
      .where(and(
        eq(otpCodes.userId, request.user.id),
        eq(otpCodes.channel, 'sms'),
        isNull(otpCodes.usedAt),
        gt(otpCodes.expiresAt, now),
      ))
      .orderBy(otpCodes.createdAt)
      .limit(1);

    const record = records[0];
    if (!record) {
      return reply.status(400).send({ error: 'No valid OTP found', statusCode: 400 });
    }
    const valid = await bcrypt.compare(code, record.codeHash);
    if (!valid) {
      return reply.status(400).send({ error: 'Invalid OTP', statusCode: 400 });
    }
    await db.update(otpCodes).set({ usedAt: new Date() }).where(eq(otpCodes.id, record.id));
    await db.update(users).set({ phoneVerified: true }).where(eq(users.id, request.user.id));
    return reply.send({ message: 'Phone verified' });
  });

  // POST /resend-otp
  app.post('/resend-otp', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as { channel?: unknown };
    const channel = body?.channel;
    if (channel !== 'email' && channel !== 'sms') {
      return reply.status(400).send({ error: 'Invalid channel', statusCode: 400 });
    }
    const otp = generateOtp();
    const codeHash = await bcrypt.hash(otp, 10);
    await db.insert(otpCodes).values({
      userId: request.user.id,
      channel,
      codeHash,
      attempts: 0,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    return reply.send({ message: 'OTP sent' });
  });

  // POST /forgot-password
  app.post('/forgot-password', async (request, reply) => {
    const body = request.body as { email?: unknown };
    const email = body?.email;
    if (typeof email !== 'string') {
      return reply.send({ message: 'If that email is registered, reset instructions have been sent' });
    }
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (user) {
      const resetToken = randomBytes(32).toString('hex');
      const tokenHash = sha256(resetToken);
      await db.insert(otpCodes).values({
        userId: user.id,
        channel: 'email',
        codeHash: tokenHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
    }
    return reply.send({ message: 'If that email is registered, reset instructions have been sent' });
  });

  // POST /reset-password
  app.post('/reset-password', async (request, reply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { token, password } = parsed.data;
    const tokenHash = sha256(token);
    const now = new Date();
    const records = await db.select().from(otpCodes)
      .where(and(
        eq(otpCodes.codeHash, tokenHash),
        isNull(otpCodes.usedAt),
        gt(otpCodes.expiresAt, now),
      ))
      .orderBy(otpCodes.createdAt)
      .limit(1);

    const record = records[0];
    if (!record) {
      return reply.status(400).send({ error: 'Invalid or expired reset token', statusCode: 400 });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, record.userId));
    await db.update(otpCodes).set({ usedAt: new Date() }).where(eq(otpCodes.id, record.id));
    return reply.send({ message: 'Password reset successful' });
  });
}
