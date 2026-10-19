import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { MAX_FILE_SIZE_BYTES } from '@gigs/shared/constants';
import { env } from './config/env.js';
import { authRoutes } from './routes/auth/index.js';
import { gigsRoutes } from './routes/gigs/index.js';
import { gigImagesRoutes } from './routes/gigs/images.js';
import { applicationsRoutes } from './routes/applications/index.js';
import { contractsRoutes } from './routes/contracts/index.js';
import { regionsRoutes } from './routes/regions/index.js';
import { notificationsRoutes } from './routes/notifications/index.js';
import { adminSettingsRoutes } from './routes/admin/settings.js';

export async function buildApp() {
  const app = Fastify({
    trustProxy: 2,
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' && {
        transport: { target: 'pino-pretty' },
      }),
    },
  });

  // ── Security ──
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: [env.FRONTEND_URL, env.ADMIN_URL],
    credentials: true,
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 } });

  // ── Rate Limiting ──
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // ── Error Handler ──
  app.setErrorHandler((error, _request, reply) => {
    // Matched by name because @gigs/shared may resolve its own zod copy.
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        error: 'Invalid request',
        statusCode: 400,
        details: (error as unknown as { issues: unknown }).issues,
      });
    }

    const statusCode = error.statusCode ?? 500;
    const message = statusCode >= 500 && env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : error.message;

    app.log.error(error);

    reply.status(statusCode).send({
      error: message,
      statusCode,
    });
  });

  // ── Health Check ──
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // ── API Routes ──
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(gigsRoutes, { prefix: '/api/v1/gigs' });
  await app.register(gigImagesRoutes, { prefix: '/api/v1/gigs' });
  await app.register(applicationsRoutes, { prefix: '/api/v1/applications' });
  await app.register(contractsRoutes, { prefix: '/api/v1/contracts' });
  await app.register(regionsRoutes, { prefix: '/api/v1/regions' });
  await app.register(notificationsRoutes, { prefix: '/api/v1/notifications' });
  await app.register(adminSettingsRoutes, { prefix: '/api/v1/admin' });

  return app;
}
