import type { FastifyInstance } from 'fastify';
import { platformSettingsSchema } from '@gigs/shared';
import { requireAdmin } from '../../middleware/guards.js';
import { getPlatformSettings, updatePlatformSettings } from '../../lib/platform-settings.js';

export async function adminSettingsRoutes(app: FastifyInstance) {
  app.get('/settings', { preHandler: [requireAdmin] }, async (_request, reply) => {
    return reply.send({ settings: await getPlatformSettings() });
  });

  app.patch('/settings', { preHandler: [requireAdmin] }, async (request, reply) => {
    const parsed = platformSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid platform settings',
        statusCode: 400,
        details: parsed.error.flatten(),
      });
    }

    const settings = await updatePlatformSettings(request.user.sub, parsed.data);
    return reply.send({ settings });
  });
}