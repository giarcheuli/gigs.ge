import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../lib/auth.js';
import type { AccessTokenPayload } from '../lib/auth.js';

// Extend Fastify request with user context
declare module 'fastify' {
  interface FastifyRequest {
    user: AccessTokenPayload;
  }
}

/**
 * Require any authenticated user (valid access token).
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing or invalid authorization header', statusCode: 401 });
  }

  try {
    const token = header.slice(7);
    request.user = verifyAccessToken(token);
  } catch {
    return reply.status(401).send({ error: 'Invalid or expired access token', statusCode: 401 });
  }
}

/**
 * Require authenticated + both email and phone verified.
 */
export async function requireVerified(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (reply.sent) return;

  if (!request.user.emailVerified || !request.user.phoneVerified) {
    return reply.status(403).send({ error: 'Email and phone verification required', statusCode: 403 });
  }
}

/**
 * Require authenticated + admin role.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (reply.sent) return;

  if (request.user.role !== 'admin') {
    return reply.status(403).send({ error: 'Admin access required', statusCode: 403 });
  }
}
