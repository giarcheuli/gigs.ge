import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { verifyAccessToken } from './jwt.js';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Unauthorized', statusCode: 401 });
  }
  const token = authHeader.slice(7);
  let payload: { userId: string; role: string };
  try {
    payload = verifyAccessToken(token);
  } catch {
    return reply.status(401).send({ error: 'Invalid or expired token', statusCode: 401 });
  }
  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user) {
    return reply.status(401).send({ error: 'User not found', statusCode: 401 });
  }
  if (user.status === 'banned' || user.status === 'suspended') {
    return reply.status(403).send({ error: 'Account suspended or banned', statusCode: 403 });
  }
  request.user = user;
}

export async function requireVerified(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;
  if (!request.user.emailVerified || !request.user.phoneVerified) {
    return reply.status(403).send({ error: 'Email and phone verification required', statusCode: 403 });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;
  if (request.user.role !== 'admin') {
    return reply.status(403).send({ error: 'Admin access required', statusCode: 403 });
  }
}
