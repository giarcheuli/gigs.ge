import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const BCRYPT_ROUNDS = 12;

// ── Password ──

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── JWT ──

export interface AccessTokenPayload {
  sub: string; // user id
  role: string;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function signRefreshToken(userId: string, familyId: string): string {
  return jwt.sign({ sub: userId, fid: familyId }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export interface RefreshTokenPayload {
  sub: string;
  fid: string;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

// ── OTP ──

export function generateOtp(): string {
  // 6-digit numeric code
  return String(crypto.randomInt(100000, 999999));
}

export async function hashOtp(code: string): Promise<string> {
  // Use SHA-256 for OTP hashing (fast, one-time use, short-lived)
  return crypto.createHash('sha256').update(code).digest('hex');
}

export function verifyOtpHash(code: string, hash: string): boolean {
  const computed = crypto.createHash('sha256').update(code).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

// ── Token hashing (refresh tokens) ──

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Refresh token expiry ──

export function refreshTokenExpiresAt(): Date {
  // Parse JWT_REFRESH_EXPIRES_IN (e.g. '7d') into milliseconds
  const match = env.JWT_REFRESH_EXPIRES_IN.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid JWT_REFRESH_EXPIRES_IN: ${env.JWT_REFRESH_EXPIRES_IN}`);
  const value = Number(match[1]);
  const unit = match[2];
  const ms = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return new Date(Date.now() + value * ms);
}

// ── Age check ──

export function isAtLeast18(dateOfBirth: string): boolean {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 18;
}
