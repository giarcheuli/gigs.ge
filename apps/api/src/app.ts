import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { authRoutes } from './routes/auth/index.js';
import { userRoutes } from './routes/users/index.js';
import { gigRoutes } from './routes/gigs/index.js';
import { applicationRoutes } from './routes/applications/index.js';
import { contractRoutes } from './routes/contracts/index.js';
import { notificationRoutes } from './routes/notifications/index.js';
import { messageRoutes } from './routes/messages/index.js';
import { adminRoutes } from './routes/admin/index.js';

export async function buildApp() {
  const app = Fastify({
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

  // ── Rate Limiting ──
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // ── Error Handler ──
  app.setErrorHandler((error, _request, reply) => {
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
  await app.register(userRoutes, { prefix: '/api/v1/users' });
  await app.register(gigRoutes, { prefix: '/api/v1/gigs' });
  await app.register(applicationRoutes, { prefix: '/api/v1' });
  await app.register(contractRoutes, { prefix: '/api/v1/contracts' });
  await app.register(notificationRoutes, { prefix: '/api/v1/notifications' });
  await app.register(messageRoutes, { prefix: '/api/v1/messages' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });

  return app;
}
