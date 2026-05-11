import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, gt } from 'drizzle-orm';
import crypto from 'node:crypto';
import { registerSchema, loginSchema, verifyOtpSchema, forgotPasswordSchema, resetPasswordSchema } from '@gigs/shared/schemas';
import { db } from '../../db/index.js';
import { users, userProfiles, refreshTokens, otpCodes } from '../../db/schema/index.js';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  refreshTokenExpiresAt,
  generateOtp,
  hashOtp,
  verifyOtpHash,
  isAtLeast18,
} from '../../lib/auth.js';
import type { AccessTokenPayload } from '../../lib/auth.js';
import { requireAuth } from '../../middleware/guards.js';
import { env } from '../../config/env.js';

const OTP_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const MAX_OTP_ATTEMPTS = 5;

export async function authRoutes(app: FastifyInstance) {
  // ── POST /register ──
  app.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);

    // Age check
    if (!isAtLeast18(body.dateOfBirth)) {
      return reply.status(400).send({ error: 'Must be at least 18 years old', statusCode: 400 });
    }

    // Check uniqueness
    const existingEmail = await db.query.users.findFirst({
      where: eq(users.email, body.email.toLowerCase()),
    });
    if (existingEmail) {
      return reply.status(409).send({ error: 'Email already registered', statusCode: 409 });
    }

    const existingPhone = await db.query.users.findFirst({
      where: eq(users.phone, body.phone),
    });
    if (existingPhone) {
      return reply.status(409).send({ error: 'Phone number already registered', statusCode: 409 });
    }

    const passwordHash = await hashPassword(body.password);

    // Create user + empty profile in a transaction
    const [newUser] = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({
        email: body.email.toLowerCase(),
        phone: body.phone,
        passwordHash,
        dateOfBirth: body.dateOfBirth,
      }).returning();

      await tx.insert(userProfiles).values({ userId: user.id });

      return [user];
    });

    // Generate OTPs for email and phone
    const emailCode = generateOtp();
    const smsCode = generateOtp();
    const emailCodeHash = await hashOtp(emailCode);
    const smsCodeHash = await hashOtp(smsCode);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await db.insert(otpCodes).values([
      { userId: newUser.id, channel: 'email', codeHash: emailCodeHash, expiresAt },
      { userId: newUser.id, channel: 'sms', codeHash: smsCodeHash, expiresAt },
    ]);

    // Issue tokens
    const payload: AccessTokenPayload = {
      sub: newUser.id,
      role: newUser.role,
      status: newUser.status,
      emailVerified: newUser.emailVerified,
      phoneVerified: newUser.phoneVerified,
    };
    const accessToken = signAccessToken(payload);
    const familyId = crypto.randomUUID();
    const refreshToken = signRefreshToken(newUser.id, familyId);

    await db.insert(refreshTokens).values({
      userId: newUser.id,
      tokenHash: hashToken(refreshToken),
      familyId,
      expiresAt: refreshTokenExpiresAt(),
    });

    // Set refresh token as httpOnly cookie
    reply.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });

    // TODO: Send actual email/SMS in production
    // v1 PoC: return OTP codes in dev mode
    const devOtp = env.NODE_ENV === 'development' ? { emailCode, smsCode } : undefined;

    return reply.status(201).send({
      accessToken,
      user: {
        id: newUser.id,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        emailVerified: newUser.emailVerified,
        phoneVerified: newUser.phoneVerified,
      },
      ...(devOtp && { _dev: devOtp }),
    });
  });

  // ── POST /login ──
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email.toLowerCase()),
    });
    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password', statusCode: 401 });
    }

    // Check account status
    if (user.status === 'banned' || user.status === 'suspended') {
      return reply.status(403).send({ error: `Account is ${user.status}`, statusCode: 403 });
    }

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid email or password', statusCode: 401 });
    }

    // Update last accessed
    await db.update(users).set({ lastAccessedAt: new Date() }).where(eq(users.id, user.id));

    // Issue tokens
    const payload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
    };
    const accessToken = signAccessToken(payload);
    const familyId = crypto.randomUUID();
    const refreshToken = signRefreshToken(user.id, familyId);

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      familyId,
      expiresAt: refreshTokenExpiresAt(),
    });

    reply.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.send({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
      },
    });
  });

  // ── POST /verify-otp ──
  app.post('/verify-otp', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = verifyOtpSchema.parse(request.body);
    const channel = (request.query as { channel?: string }).channel;

    if (channel !== 'email' && channel !== 'sms') {
      return reply.status(400).send({ error: 'Query parameter "channel" must be "email" or "sms"', statusCode: 400 });
    }

    // Find the latest non-expired, unused OTP for this user+channel
    const otp = await db.query.otpCodes.findFirst({
      where: and(
        eq(otpCodes.userId, request.user.sub),
        eq(otpCodes.channel, channel),
        isNull(otpCodes.usedAt),
        gt(otpCodes.expiresAt, new Date()),
      ),
      orderBy: (otpCodes, { desc }) => [desc(otpCodes.createdAt)],
    });

    if (!otp) {
      return reply.status(400).send({ error: 'No valid OTP found. Please request a new one.', statusCode: 400 });
    }

    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      return reply.status(429).send({ error: 'Too many attempts. Please request a new code.', statusCode: 429 });
    }

    // Increment attempts
    await db.update(otpCodes).set({ attempts: otp.attempts + 1 }).where(eq(otpCodes.id, otp.id));

    if (!verifyOtpHash(body.code, otp.codeHash)) {
      return reply.status(400).send({ error: 'Invalid verification code', statusCode: 400 });
    }

    // Mark OTP as used
    await db.update(otpCodes).set({ usedAt: new Date() }).where(eq(otpCodes.id, otp.id));

    // Mark user as verified for this channel
    const updateField = channel === 'email' ? { emailVerified: true } : { phoneVerified: true };
    await db.update(users).set(updateField).where(eq(users.id, request.user.sub));

    return reply.send({ verified: true, channel });
  });

  // ── POST /resend-otp ──
  app.post('/resend-otp', { preHandler: [requireAuth] }, async (request, reply) => {
    const channel = (request.query as { channel?: string }).channel;
    if (channel !== 'email' && channel !== 'sms') {
      return reply.status(400).send({ error: 'Query parameter "channel" must be "email" or "sms"', statusCode: 400 });
    }

    const code = generateOtp();
    const codeHash = await hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await db.insert(otpCodes).values({
      userId: request.user.sub,
      channel,
      codeHash,
      expiresAt,
    });

    // TODO: Send actual email/SMS in production
    const devOtp = env.NODE_ENV === 'development' ? { code } : undefined;

    return reply.send({
      message: `Verification code sent via ${channel}`,
      ...(devOtp && { _dev: devOtp }),
    });
  });

  // ── POST /refresh ──
  app.post('/refresh', async (request, reply) => {
    const token = request.cookies.refresh_token;
    if (!token) {
      return reply.status(401).send({ error: 'No refresh token', statusCode: 401 });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      return reply.status(401).send({ error: 'Invalid or expired refresh token', statusCode: 401 });
    }

    const tokenHash = hashToken(token);

    // Find the token in DB
    const stored = await db.query.refreshTokens.findFirst({
      where: and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
      ),
    });

    if (!stored) {
      // Token reuse detected — revoke entire family
      await db.update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.familyId, decoded.fid));

      reply.clearCookie('refresh_token', { path: '/api/v1/auth' });
      return reply.status(401).send({ error: 'Token reuse detected. All sessions revoked.', statusCode: 401 });
    }

    // Revoke the used token
    await db.update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, stored.id));

    // Get fresh user data
    const user = await db.query.users.findFirst({
      where: eq(users.id, decoded.sub),
    });

    if (!user || user.status === 'banned' || user.status === 'suspended') {
      reply.clearCookie('refresh_token', { path: '/api/v1/auth' });
      return reply.status(401).send({ error: 'Account unavailable', statusCode: 401 });
    }

    // Issue new token pair (same family)
    const payload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
    };
    const accessToken = signAccessToken(payload);
    const newRefreshToken = signRefreshToken(user.id, stored.familyId);

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: hashToken(newRefreshToken),
      familyId: stored.familyId,
      expiresAt: refreshTokenExpiresAt(),
    });

    reply.setCookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.send({ accessToken });
  });

  // ── POST /logout ──
  app.post('/logout', async (request, reply) => {
    const token = request.cookies.refresh_token;
    if (token) {
      const tokenHash = hashToken(token);
      await db.update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, tokenHash));
    }

    reply.clearCookie('refresh_token', { path: '/api/v1/auth' });
    return reply.send({ message: 'Logged out' });
  });

  // ── POST /forgot-password ──
  app.post('/forgot-password', async (request, reply) => {
    const body = forgotPasswordSchema.parse(request.body);

    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email.toLowerCase()),
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return reply.send({ message: 'If that email exists, a reset link has been sent.' });
    }

    // Generate a reset token (stored as OTP with 'email' channel, special prefix)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await hashOtp(resetToken);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await db.insert(otpCodes).values({
      userId: user.id,
      channel: 'email',
      codeHash: tokenHash,
      expiresAt,
    });

    // TODO: Send actual reset email with link containing resetToken
    const devToken = env.NODE_ENV === 'development' ? { resetToken } : undefined;

    return reply.send({
      message: 'If that email exists, a reset link has been sent.',
      ...(devToken && { _dev: devToken }),
    });
  });

  // ── POST /reset-password ──
  app.post('/reset-password', async (request, reply) => {
    const body = resetPasswordSchema.parse(request.body);

    // Find the OTP record matching this token
    const tokenHash = await hashOtp(body.token);

    const otp = await db.query.otpCodes.findFirst({
      where: and(
        eq(otpCodes.codeHash, tokenHash),
        eq(otpCodes.channel, 'email'),
        isNull(otpCodes.usedAt),
        gt(otpCodes.expiresAt, new Date()),
      ),
      orderBy: (otpCodes, { desc }) => [desc(otpCodes.createdAt)],
    });

    if (!otp) {
      return reply.status(400).send({ error: 'Invalid or expired reset token', statusCode: 400 });
    }

    const passwordHash = await hashPassword(body.password);

    await db.transaction(async (tx) => {
      // Mark token as used
      await tx.update(otpCodes).set({ usedAt: new Date() }).where(eq(otpCodes.id, otp.id));

      // Update password
      await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, otp.userId));

      // Revoke all refresh tokens for this user
      await tx.update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, otp.userId), isNull(refreshTokens.revokedAt)));
    });

    return reply.send({ message: 'Password reset successful. Please log in.' });
  });

  // ── GET /me ──
  app.get('/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, request.user.sub),
      columns: {
        id: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        emailVerified: true,
        phoneVerified: true,
        dateOfBirth: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found', statusCode: 404 });
    }

    return reply.send({ user });
  });
}
