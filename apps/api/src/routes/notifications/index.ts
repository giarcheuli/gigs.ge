import type { FastifyInstance } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { notifications } from '../../db/schema/index.js';
import { requireAuth } from '../../middleware/guards.js';

const notificationIdParamsSchema = z.object({ id: z.string().uuid() });

export async function notificationsRoutes(app: FastifyInstance) {
  /**
   * GET /notifications
   * Returns all unread notifications for the current user, newest first.
   */
  app.get('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const data = await db.query.notifications.findMany({
      where: and(
        eq(notifications.recipientId, request.user.sub),
        isNull(notifications.readAt)
      ),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    return reply.send({ data, unreadCount: data.length });
  });

  /**
   * GET /notifications/all
   * Returns all notifications for the current user (read and unread), newest first.
   */
  app.get('/all', { preHandler: [requireAuth] }, async (request, reply) => {
    const data = await db.query.notifications.findMany({
      where: eq(notifications.recipientId, request.user.sub),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    const unreadCount = data.filter(n => !n.readAt).length;
    return reply.send({ data, unreadCount });
  });

  /**
   * POST /notifications/:id/read
   * Marks a notification as read.
   */
  app.post('/:id/read', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = notificationIdParamsSchema.parse(request.params);

    const notification = await db.query.notifications.findFirst({
      where: eq(notifications.id, params.id),
    });

    if (!notification) {
      return reply.status(404).send({ error: 'Notification not found', statusCode: 404 });
    }

    if (notification.recipientId !== request.user.sub) {
      return reply.status(403).send({ error: 'You can only read your own notifications', statusCode: 403 });
    }

    const [updated] = await db.update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.id, params.id))
      .returning();

    return reply.send({ notification: updated });
  });

  /**
   * POST /notifications/read-all
   * Marks all unread notifications as read for the current user.
   */
  app.post('/read-all', { preHandler: [requireAuth] }, async (request, reply) => {
    await db.update(notifications)
      .set({ readAt: new Date() })
      .where(and(
        eq(notifications.recipientId, request.user.sub),
        isNull(notifications.readAt)
      ));

    return reply.send({ success: true });
  });
}
