import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { messages } from '../../db/schema/index.js';
import { eq, and, or, desc, count } from 'drizzle-orm';
import { requireAuth } from '../../plugins/auth.js';
import { sendMessageSchema, paginationSchema } from '@gigs/shared';

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  // GET /inbox
  app.get('/inbox', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;
    const condition = eq(messages.recipientId, request.user.id);

    const [rows, countResult] = await Promise.all([
      db.select().from(messages).where(condition)
        .orderBy(desc(messages.createdAt)).limit(limit).offset(offset),
      db.select({ value: count() }).from(messages).where(condition),
    ]);
    const total = Number(countResult[0]?.value ?? 0);
    return reply.send({ data: rows, total, page, limit, hasMore: offset + rows.length < total });
  });

  // GET /sent
  app.get('/sent', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;
    const condition = eq(messages.senderId, request.user.id);

    const [rows, countResult] = await Promise.all([
      db.select().from(messages).where(condition)
        .orderBy(desc(messages.createdAt)).limit(limit).offset(offset),
      db.select({ value: count() }).from(messages).where(condition),
    ]);
    const total = Number(countResult[0]?.value ?? 0);
    return reply.send({ data: rows, total, page, limit, hasMore: offset + rows.length < total });
  });

  // POST /
  app.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = sendMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { recipientId, body } = parsed.data;
    const [message] = await db.insert(messages).values({
      senderId: request.user.id,
      recipientId,
      body,
    }).returning();
    return reply.status(201).send(message);
  });

  // GET /:id
  app.get('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [message] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    if (!message) return reply.status(404).send({ error: 'Message not found', statusCode: 404 });
    if (message.senderId !== request.user.id && message.recipientId !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    }
    return reply.send(message);
  });

  // PATCH /:id/read
  app.patch('/:id/read', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [message] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    if (!message) return reply.status(404).send({ error: 'Message not found', statusCode: 404 });
    if (message.recipientId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });

    const [updated] = await db.update(messages)
      .set({ readAt: new Date() })
      .where(and(eq(messages.id, id), eq(messages.recipientId, request.user.id)))
      .returning();
    return reply.send(updated);
  });
}

// Suppress unused import warning
void or;
