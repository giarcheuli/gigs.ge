import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signAccessToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(userId: string, familyId: string): string {
  return jwt.sign({ userId, familyId }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): { userId: string; role: string } {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as {
    userId: string;
    role: string;
    iat: number;
    exp: number;
  };
  return { userId: payload.userId, role: payload.role };
}

export function verifyRefreshToken(token: string): { userId: string; familyId: string } {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as {
    userId: string;
    familyId: string;
    iat: number;
    exp: number;
  };
  return { userId: payload.userId, familyId: payload.familyId };
}
