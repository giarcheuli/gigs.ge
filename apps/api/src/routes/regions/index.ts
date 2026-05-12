import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { regions } from '../../db/schema/index.js';
import { asc } from 'drizzle-orm';

export async function regionsRoutes(app: FastifyInstance) {
  /**
   * GET /regions
   * Public — returns all regions with their cities, sorted alphabetically.
   * Used by gig creation / profile forms for the region/city dropdowns.
   */
  app.get('/', async (_request, reply) => {
    const data = await db.query.regions.findMany({
      orderBy: [asc(regions.nameEn)],
      with: {
        cities: {
          orderBy: (cities, { asc }) => [asc(cities.nameEn)],
        },
      },
    });

    return reply.send({ data });
  });
}
