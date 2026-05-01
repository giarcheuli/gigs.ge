import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { notifications } from '../../db/schema/index.js';
import { eq, and, isNull, desc, count } from 'drizzle-orm';
import { requireAuth } from '../../plugins/auth.js';
import { paginationSchema } from '@gigs/shared';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  // GET /
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;
    const condition = eq(notifications.recipientId, request.user.id);

    const [rows, countResult] = await Promise.all([
      db.select().from(notifications).where(condition)
        .orderBy(desc(notifications.createdAt)).limit(limit).offset(offset),
      db.select({ value: count() }).from(notifications).where(condition),
    ]);
    const total = Number(countResult[0]?.value ?? 0);
    return reply.send({ data: rows, total, page, limit, hasMore: offset + rows.length < total });
  });

  // PATCH /:id/read
  app.patch('/:id/read', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [updated] = await db.update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.recipientId, request.user.id)))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'Notification not found', statusCode: 404 });
    return reply.send(updated);
  });

  // POST /read-all
  app.post('/read-all', { preHandler: requireAuth }, async (request, reply) => {
    await db.update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.recipientId, request.user.id), isNull(notifications.readAt)));
    return reply.send({ message: 'All notifications marked as read' });
  });
}
