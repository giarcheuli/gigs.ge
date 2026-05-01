import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { gigs, gigImages, gigFlags, infoRequests, contracts } from '../../db/schema/index.js';
import { eq, and, desc, count, inArray } from 'drizzle-orm';
import { requireAuth, requireVerified } from '../../plugins/auth.js';
import {
  createGigSchema,
  updateGigSchema,
  createFlagSchema,
  createInfoRequestSchema,
  resolveInfoRequestSchema,
  paginationSchema,
  ACTIVE_CONTRACT_STATUSES,
  MAX_GIG_IMAGES,
  MAX_GIG_EXPIRY_DAYS,
} from '@gigs/shared';

export async function gigRoutes(app: FastifyInstance): Promise<void> {
  // GET /
  app.get('/', async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; regionId?: string; cityId?: string };
    const parsed = paginationSchema.safeParse(query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const conditions = [eq(gigs.status, 'active')];
    if (query.regionId) conditions.push(eq(gigs.regionId, parseInt(query.regionId)));
    if (query.cityId) conditions.push(eq(gigs.cityId, parseInt(query.cityId)));

    const condition = and(...conditions)!;
    const [rows, countResult] = await Promise.all([
      db.select().from(gigs).where(condition).orderBy(desc(gigs.createdAt)).limit(limit).offset(offset),
      db.select({ value: count() }).from(gigs).where(condition),
    ]);
    const total = Number(countResult[0]?.value ?? 0);
    return reply.send({ data: rows, total, page, limit, hasMore: offset + rows.length < total });
  });

  // GET /:id
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [gig] = await db.select().from(gigs).where(eq(gigs.id, id)).limit(1);
    if (!gig) {
      return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    }
    const images = await db.select().from(gigImages).where(eq(gigImages.gigId, id));
    return reply.send({ ...gig, images });
  });

  // POST /
  app.post('/', { preHandler: requireVerified }, async (request, reply) => {
    const parsed = createGigSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const data = parsed.data;
    const expiresAt = new Date(Date.now() + MAX_GIG_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const [gig] = await db.insert(gigs).values({
      ...data,
      availableFrom: data.availableFrom ? new Date(data.availableFrom) : null,
      availableTo: data.availableTo ? new Date(data.availableTo) : null,
      posterId: request.user.id,
      status: 'draft',
      expiresAt,
    }).returning();
    return reply.status(201).send(gig);
  });

  // PATCH /:id
  app.patch('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [gig] = await db.select().from(gigs).where(eq(gigs.id, id)).limit(1);
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.posterId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    if (gig.status !== 'draft') return reply.status(400).send({ error: 'Gig must be in draft status', statusCode: 400 });

    const parsed = updateGigSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const [updated] = await db.update(gigs).set({
        ...parsed.data,
        availableFrom: parsed.data.availableFrom ? new Date(parsed.data.availableFrom) : null,
        availableTo: parsed.data.availableTo ? new Date(parsed.data.availableTo) : null,
        updatedAt: new Date(),
      })
      .where(eq(gigs.id, id)).returning();
    return reply.send(updated);
  });

  // POST /:id/publish
  app.post('/:id/publish', { preHandler: requireVerified }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [gig] = await db.select().from(gigs).where(eq(gigs.id, id)).limit(1);
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.posterId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    if (gig.status !== 'draft') return reply.status(400).send({ error: 'Gig must be in draft status', statusCode: 400 });

    const [updated] = await db.update(gigs).set({ status: 'active', updatedAt: new Date() })
      .where(eq(gigs.id, id)).returning();
    return reply.send(updated);
  });

  // POST /:id/shelve
  app.post('/:id/shelve', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [gig] = await db.select().from(gigs).where(eq(gigs.id, id)).limit(1);
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.posterId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    if (gig.status !== 'active') return reply.status(400).send({ error: 'Gig must be active', statusCode: 400 });

    const [updated] = await db.update(gigs).set({ status: 'shelf', updatedAt: new Date() })
      .where(eq(gigs.id, id)).returning();
    return reply.send(updated);
  });

  // POST /:id/reactivate
  app.post('/:id/reactivate', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [gig] = await db.select().from(gigs).where(eq(gigs.id, id)).limit(1);
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.posterId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    if (gig.status !== 'shelf') return reply.status(400).send({ error: 'Gig must be shelved', statusCode: 400 });

    const [updated] = await db.update(gigs).set({ status: 'active', updatedAt: new Date() })
      .where(eq(gigs.id, id)).returning();
    return reply.send(updated);
  });

  // POST /:id/archive
  app.post('/:id/archive', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [gig] = await db.select().from(gigs).where(eq(gigs.id, id)).limit(1);
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.posterId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });

    const activeContracts = await db.select({ value: count() }).from(contracts)
      .where(and(
        eq(contracts.gigId, id),
        inArray(contracts.status, [...ACTIVE_CONTRACT_STATUSES] as string[]),
      ));
    if (Number(activeContracts[0]?.value ?? 0) > 0) {
      return reply.status(400).send({ error: 'Cannot archive gig with active contracts', statusCode: 400 });
    }

    const [updated] = await db.update(gigs).set({ status: 'archived', updatedAt: new Date() })
      .where(eq(gigs.id, id)).returning();
    return reply.send(updated);
  });

  // DELETE /:id
  app.delete('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [gig] = await db.select().from(gigs).where(eq(gigs.id, id)).limit(1);
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.posterId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });

    const [updated] = await db.update(gigs).set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(gigs.id, id)).returning();
    return reply.send(updated);
  });

  // POST /:id/images
  app.post('/:id/images', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [gig] = await db.select().from(gigs).where(eq(gigs.id, id)).limit(1);
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.posterId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });

    const countResult = await db.select({ value: count() }).from(gigImages).where(eq(gigImages.gigId, id));
    if (Number(countResult[0]?.value ?? 0) >= MAX_GIG_IMAGES) {
      return reply.status(422).send({ error: `Maximum ${MAX_GIG_IMAGES} images allowed`, statusCode: 422 });
    }

    const body = request.body as { url?: unknown; isPreview?: unknown; sortOrder?: unknown };
    if (typeof body.url !== 'string') {
      return reply.status(400).send({ error: 'url is required', statusCode: 400 });
    }

    const [image] = await db.insert(gigImages).values({
      gigId: id,
      url: body.url,
      isPreview: typeof body.isPreview === 'boolean' ? body.isPreview : false,
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
    }).returning();
    return reply.status(201).send(image);
  });

  // DELETE /:id/images/:imgId
  app.delete('/:id/images/:imgId', { preHandler: requireAuth }, async (request, reply) => {
    const { id, imgId } = request.params as { id: string; imgId: string };
    const [gig] = await db.select().from(gigs).where(eq(gigs.id, id)).limit(1);
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.posterId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });

    const [image] = await db.select().from(gigImages).where(and(eq(gigImages.id, imgId), eq(gigImages.gigId, id))).limit(1);
    if (!image) return reply.status(404).send({ error: 'Image not found', statusCode: 404 });

    await db.delete(gigImages).where(eq(gigImages.id, imgId));
    return reply.status(204).send();
  });

  // POST /:id/flags
  app.post('/:id/flags', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createFlagSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    try {
      const [flag] = await db.insert(gigFlags).values({
        gigId: id,
        reporterId: request.user.id,
        reason: parsed.data.reason,
      }).returning();
      return reply.status(201).send(flag);
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === '23505') {
        return reply.status(409).send({ error: 'Already reported', statusCode: 409 });
      }
      throw err;
    }
  });

  // POST /:id/info-requests
  app.post('/:id/info-requests', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createInfoRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    try {
      const [req] = await db.insert(infoRequests).values({
        gigId: id,
        requesterId: request.user.id,
        field: parsed.data.field,
      }).returning();
      return reply.status(201).send(req);
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === '23505') {
        return reply.status(409).send({ error: 'Info request already submitted', statusCode: 409 });
      }
      throw err;
    }
  });

  // GET /:id/info-requests
  app.get('/:id/info-requests', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [gig] = await db.select().from(gigs).where(eq(gigs.id, id)).limit(1);
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.posterId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });

    const rows = await db.select().from(infoRequests).where(eq(infoRequests.gigId, id));
    return reply.send(rows);
  });

  // PATCH /:id/info-requests/:reqId
  app.patch('/:id/info-requests/:reqId', { preHandler: requireAuth }, async (request, reply) => {
    const { id, reqId } = request.params as { id: string; reqId: string };
    const [gig] = await db.select().from(gigs).where(eq(gigs.id, id)).limit(1);
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.posterId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });

    const parsed = resolveInfoRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }

    const [updated] = await db.update(infoRequests)
      .set({ status: parsed.data.status, resolvedAt: new Date() })
      .where(and(eq(infoRequests.id, reqId), eq(infoRequests.gigId, id)))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'Info request not found', statusCode: 404 });
    return reply.send(updated);
  });
}
