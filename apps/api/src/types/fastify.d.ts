import type { InferSelectModel } from 'drizzle-orm';
import { users } from '../db/schema/users.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: InferSelectModel<typeof users>;
  }
}
