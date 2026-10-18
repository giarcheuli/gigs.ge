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
import { sendPasswordResetEmail, sendVerificationEmail } from '../../lib/auth-email.js';
import {
  authEmailTaskSchema,
  enqueueAuthEmailTask,
  decryptAuthEmailTaskEnvelope,
} from '../../lib/auth-email-queue.js';
import { consumeForgotPasswordRateLimit } from '../../lib/forgot-password-rate-limit.js';

const OTP_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const EMAIL_VERIFICATION_PURPOSE = 'email_verification';
const PASSWORD_RESET_PURPOSE = 'password_reset';

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

    // Email is the required verification channel; phone verification is optional.
    const emailCode = generateOtp();
    const emailCodeHash = await hashOtp(emailCode);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await db.insert(otpCodes).values({
      userId: newUser.id,
      channel: 'email',
      purpose: EMAIL_VERIFICATION_PURPOSE,
      codeHash: emailCodeHash,
      expiresAt,
    });

    const emailResult = await enqueueAuthEmailTask({
      type: 'verification',
      userId: newUser.id,
      credential: emailCode,
      expiresAt: expiresAt.toISOString(),
    });
    if (!emailResult.queued) {
      request.log.error({ event: 'auth_email_enqueue_failed', type: 'verification', reason: emailResult.reason });
    }

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

    // TODO: Send actual verification email in production.
    const devOtp = env.NODE_ENV === 'development' ? { emailCode } : undefined;

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
      emailDeliveryStatus: emailResult.queued
        ? 'queued'
        : env.NODE_ENV === 'development' ? 'development_code' : 'failed',
      ...(!emailResult.queued && env.NODE_ENV !== 'development' && {
        retryAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
      }),
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

    if (channel === 'sms') {
      return reply.status(409).send({
        error: 'Phone verification is optional and is not available yet',
        code: 'PHONE_VERIFICATION_NOT_AVAILABLE',
        statusCode: 409,
      });
    }
    if (channel !== 'email') {
      return reply.status(400).send({ error: 'Query parameter "channel" must be "email"', statusCode: 400 });
    }

    // Find the latest non-expired, unused OTP for this user+channel
    const otp = await db.query.otpCodes.findFirst({
      where: and(
        eq(otpCodes.userId, request.user.sub),
        eq(otpCodes.channel, channel),
        eq(otpCodes.purpose, EMAIL_VERIFICATION_PURPOSE),
        isNull(otpCodes.usedAt),
        gt(otpCodes.expiresAt, new Date()),
      ),
      orderBy: (otpCodes, { desc }) => [desc(otpCodes.createdAt)],
    });

    if (!otp) {
      return reply.status(400).send({
        error: 'No valid email code found. Request a new code to continue.',
        code: 'EMAIL_OTP_EXPIRED',
        statusCode: 400,
      });
    }

    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      return reply.status(429).send({
        error: 'Too many attempts. Request a new code before trying again.',
        code: 'OTP_ATTEMPTS_EXHAUSTED',
        statusCode: 429,
      });
    }

    // Increment attempts
    await db.update(otpCodes).set({ attempts: otp.attempts + 1 }).where(eq(otpCodes.id, otp.id));

    if (!verifyOtpHash(body.code, otp.codeHash)) {
      return reply.status(400).send({
        error: 'That code is incorrect. Check it and try again.',
        code: 'INVALID_OTP',
        statusCode: 400,
      });
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
    if (channel === 'sms') {
      return reply.status(409).send({
        error: 'Phone verification is optional and is not available yet',
        code: 'PHONE_VERIFICATION_NOT_AVAILABLE',
        statusCode: 409,
      });
    }
    if (channel !== 'email') {
      return reply.status(400).send({ error: 'Query parameter "channel" must be "email"', statusCode: 400 });
    }

    const recentCode = await db.query.otpCodes.findFirst({
      where: and(
        eq(otpCodes.userId, request.user.sub),
        eq(otpCodes.channel, 'email'),
        eq(otpCodes.purpose, EMAIL_VERIFICATION_PURPOSE),
        gt(otpCodes.createdAt, new Date(Date.now() - OTP_RESEND_COOLDOWN_MS)),
      ),
      orderBy: (otpCodes, { desc }) => [desc(otpCodes.createdAt)],
    });

    if (recentCode) {
      const retryAfterSeconds = Math.max(1, Math.ceil(
        (recentCode.createdAt.getTime() + OTP_RESEND_COOLDOWN_MS - Date.now()) / 1000,
      ));
      return reply.status(429).send({
        error: `You can request another code in ${retryAfterSeconds} seconds.`,
        code: 'OTP_RESEND_COOLDOWN',
        retryAfterSeconds,
        statusCode: 429,
      });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, request.user.sub),
      columns: { email: true, emailVerified: true },
    });
    if (!user) {
      return reply.status(401).send({ error: 'Account unavailable', statusCode: 401 });
    }
    if (user.emailVerified) {
      return reply.status(409).send({
        error: 'Email is already verified',
        code: 'EMAIL_ALREADY_VERIFIED',
        statusCode: 409,
      });
    }

    const code = generateOtp();
    const codeHash = await hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await db.insert(otpCodes).values({
      userId: request.user.sub,
      channel,
      purpose: EMAIL_VERIFICATION_PURPOSE,
      codeHash,
      expiresAt,
    });

    const emailResult = await enqueueAuthEmailTask({
      type: 'verification',
      userId: request.user.sub,
      credential: code,
      expiresAt: expiresAt.toISOString(),
    });
    const devOtp = env.NODE_ENV === 'development' ? { code } : undefined;

    if (!emailResult.queued && env.NODE_ENV !== 'development') {
      request.log.error({ event: 'auth_email_enqueue_failed', type: 'verification', reason: emailResult.reason });
      return reply.status(503).send({
        error: 'Verification email is temporarily unavailable. Please try again later.',
        code: 'EMAIL_DELIVERY_UNAVAILABLE',
        retryAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
        statusCode: 503,
      });
    }
    if (emailResult.queued) {
      request.log.info({ event: 'auth_email_queued', type: 'verification', deliveryId: emailResult.deliveryId });
    }

    return reply.send({
      message: emailResult.queued ? 'Verification email queued for delivery' : 'Verification code available in development',
      emailDeliveryStatus: emailResult.queued ? 'queued' : 'development_code',
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
    const rateLimit = await consumeForgotPasswordRateLimit(request.ip);
    if (!rateLimit.allowed) {
      return reply.status(429)
        .header('Retry-After', String(rateLimit.retryAfterSeconds))
        .send({
          error: 'Too many password reset requests. Try again later.',
          code: 'FORGOT_PASSWORD_RATE_LIMIT',
          retryAfterSeconds: rateLimit.retryAfterSeconds,
          statusCode: 429,
        });
    }

      const responseStartedAt = Date.now();
      const responseFloorMs = 350 + crypto.randomInt(0, 150);
    const body = forgotPasswordSchema.parse(request.body);

    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email.toLowerCase()),
    });

    // Always return success to prevent email enumeration
    let devToken: { resetToken: string } | undefined;
    if (!user) {
      const enqueueResult = await enqueueAuthEmailTask({ type: 'noop' });
      if (enqueueResult.queued) {
        request.log.info({ event: 'auth_email_queued', type: 'password_reset', deliveryId: enqueueResult.deliveryId });
      } else {
        request.log.error({ event: 'auth_email_enqueue_failed', type: 'password_reset', reason: enqueueResult.reason });
      }
    } else {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = await hashOtp(resetToken);
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

      await db.insert(otpCodes).values({
        userId: user.id,
        channel: 'email',
        purpose: PASSWORD_RESET_PURPOSE,
        codeHash: tokenHash,
        expiresAt,
      });

      const enqueueResult = await enqueueAuthEmailTask({
        type: 'password_reset',
        userId: user.id,
        credential: resetToken,
        expiresAt: expiresAt.toISOString(),
      });
      if (!enqueueResult.queued) {
        request.log.error({ event: 'auth_email_enqueue_failed', type: 'password_reset', reason: enqueueResult.reason });
      } else {
        request.log.info({ event: 'auth_email_queued', type: 'password_reset', deliveryId: enqueueResult.deliveryId });
      }
      if (env.NODE_ENV === 'development') devToken = { resetToken };
    }

    const remainingDelayMs = responseStartedAt + responseFloorMs - Date.now();
    if (remainingDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingDelayMs));
    }

    return reply.send({
      message: 'If that email exists, a reset link has been sent.',
      ...(devToken && { _dev: devToken }),
    });
  });

  // Cloud Tasks retries this signed endpoint; credentials are validated against
  // their current database record before Resend is called.
  app.post('/internal/email-delivery', async (request, reply) => {
    const signature = request.headers['x-gigs-auth-email-signature'];
    const decodedTask = typeof signature === 'string'
      ? decryptAuthEmailTaskEnvelope(request.body, signature, env.JWT_ACCESS_SECRET)
      : null;
    if (!decodedTask) {
      return reply.status(401).send({ error: 'Invalid task signature', statusCode: 401 });
    }

    const { task, deliveryId } = decodedTask;
    if (task.type === 'noop' || new Date(task.expiresAt).getTime() <= Date.now()) {
      return reply.status(204).send();
    }

    const purpose = task.type === 'verification' ? EMAIL_VERIFICATION_PURPOSE : PASSWORD_RESET_PURPOSE;
    const otp = await db.query.otpCodes.findFirst({
      where: and(
        eq(otpCodes.userId, task.userId),
        eq(otpCodes.channel, 'email'),
        eq(otpCodes.purpose, purpose),
        eq(otpCodes.codeHash, await hashOtp(task.credential)),
        isNull(otpCodes.usedAt),
        gt(otpCodes.expiresAt, new Date()),
      ),
    });
    if (!otp) return reply.status(204).send();

    const user = await db.query.users.findFirst({
      where: eq(users.id, task.userId),
      columns: { email: true },
    });
    if (!user) return reply.status(204).send();

    const result = task.type === 'verification'
      ? await sendVerificationEmail(user.email, task.credential, deliveryId)
      : await sendPasswordResetEmail(
          user.email,
          (() => {
            const resetUrl = new URL('/reset-password', env.FRONTEND_URL);
            resetUrl.hash = new URLSearchParams({ token: task.credential }).toString();
            return resetUrl.toString();
          })(),
          deliveryId,
        );

    if (!result.accepted) {
      request.log.error({ event: 'auth_email_delivery_failed', type: task.type, reason: result.reason });
      return reply.status(503).send({ error: 'Email delivery temporarily unavailable', statusCode: 503 });
    }

    request.log.info({ event: 'auth_email_accepted', type: task.type, messageId: result.messageId });
    return reply.status(204).send();
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
        eq(otpCodes.purpose, PASSWORD_RESET_PURPOSE),
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
