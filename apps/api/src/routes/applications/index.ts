import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { gigs, applications, applicationAttachments } from '../../db/schema/index.js';
import { eq, and, count, desc } from 'drizzle-orm';
import { requireAuth, requireVerified } from '../../plugins/auth.js';
import { createApplicationSchema, updateApplicationSchema, paginationSchema, MAX_APPLICATION_ATTACHMENTS } from '@gigs/shared';

export async function applicationRoutes(app: FastifyInstance): Promise<void> {
  // POST /gigs/:gigId/applications
  app.post('/gigs/:gigId/applications', { preHandler: requireVerified }, async (request, reply) => {
    const { gigId } = request.params as { gigId: string };
    const [gig] = await db.select().from(gigs).where(eq(gigs.id, gigId)).limit(1);
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.status !== 'active') return reply.status(400).send({ error: 'Gig is not active', statusCode: 400 });

    const parsed = createApplicationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    try {
      const [application] = await db.insert(applications).values({
        gigId,
        applicantId: request.user.id,
        message: parsed.data.message ?? null,
        status: 'pending',
      }).returning();
      return reply.status(201).send(application);
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === '23505') {
        return reply.status(409).send({ error: 'Already applied to this gig', statusCode: 409 });
      }
      throw err;
    }
  });

  // GET /gigs/:gigId/applications
  app.get('/gigs/:gigId/applications', { preHandler: requireAuth }, async (request, reply) => {
    const { gigId } = request.params as { gigId: string };
    const [gig] = await db.select().from(gigs).where(eq(gigs.id, gigId)).limit(1);
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.posterId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });

    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
      db.select().from(applications).where(eq(applications.gigId, gigId))
        .orderBy(desc(applications.createdAt)).limit(limit).offset(offset),
      db.select({ value: count() }).from(applications).where(eq(applications.gigId, gigId)),
    ]);
    const total = Number(countResult[0]?.value ?? 0);
    return reply.send({ data: rows, total, page, limit, hasMore: offset + rows.length < total });
  });

  // PATCH /gigs/:gigId/applications/:appId
  app.patch('/gigs/:gigId/applications/:appId', { preHandler: requireAuth }, async (request, reply) => {
    const { gigId, appId } = request.params as { gigId: string; appId: string };
    const [gig] = await db.select().from(gigs).where(eq(gigs.id, gigId)).limit(1);
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.posterId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });

    const parsed = updateApplicationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const [application] = await db.select().from(applications)
      .where(and(eq(applications.id, appId), eq(applications.gigId, gigId))).limit(1);
    if (!application) return reply.status(404).send({ error: 'Application not found', statusCode: 404 });

    const [updated] = await db.update(applications)
      .set({ status: parsed.data.status, rejectionReason: parsed.data.rejectionReason ?? null, updatedAt: new Date() })
      .where(eq(applications.id, appId))
      .returning();
    return reply.send(updated);
  });

  // DELETE /gigs/:gigId/applications/:appId
  app.delete('/gigs/:gigId/applications/:appId', { preHandler: requireAuth }, async (request, reply) => {
    const { gigId, appId } = request.params as { gigId: string; appId: string };
    const [application] = await db.select().from(applications)
      .where(and(eq(applications.id, appId), eq(applications.gigId, gigId))).limit(1);
    if (!application) return reply.status(404).send({ error: 'Application not found', statusCode: 404 });
    if (application.applicantId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    if (application.status !== 'pending') return reply.status(400).send({ error: 'Can only withdraw pending applications', statusCode: 400 });

    const [updated] = await db.update(applications)
      .set({ status: 'withdrawn', updatedAt: new Date() })
      .where(eq(applications.id, appId))
      .returning();
    return reply.send(updated);
  });

  // POST /gigs/:gigId/applications/:appId/attachments
  app.post('/gigs/:gigId/applications/:appId/attachments', { preHandler: requireAuth }, async (request, reply) => {
    const { gigId, appId } = request.params as { gigId: string; appId: string };
    const [application] = await db.select().from(applications)
      .where(and(eq(applications.id, appId), eq(applications.gigId, gigId))).limit(1);
    if (!application) return reply.status(404).send({ error: 'Application not found', statusCode: 404 });
    if (application.applicantId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });

    const countResult = await db.select({ value: count() }).from(applicationAttachments)
      .where(eq(applicationAttachments.applicationId, appId));
    if (Number(countResult[0]?.value ?? 0) >= MAX_APPLICATION_ATTACHMENTS) {
      return reply.status(422).send({ error: `Maximum ${MAX_APPLICATION_ATTACHMENTS} attachments allowed`, statusCode: 422 });
    }

    const body = request.body as { url?: unknown; filename?: unknown; mimeType?: unknown; sizeBytes?: unknown };
    if (typeof body.url !== 'string' || typeof body.filename !== 'string' || typeof body.mimeType !== 'string' || typeof body.sizeBytes !== 'number') {
      return reply.status(400).send({ error: 'url, filename, mimeType, and sizeBytes are required', statusCode: 400 });
    }

    const [attachment] = await db.insert(applicationAttachments).values({
      applicationId: appId,
      url: body.url,
      filename: body.filename,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    }).returning();
    return reply.status(201).send(attachment);
  });

  // DELETE /gigs/:gigId/applications/:appId/attachments/:attId
  app.delete('/gigs/:gigId/applications/:appId/attachments/:attId', { preHandler: requireAuth }, async (request, reply) => {
    const { gigId, appId, attId } = request.params as { gigId: string; appId: string; attId: string };
    const [application] = await db.select().from(applications)
      .where(and(eq(applications.id, appId), eq(applications.gigId, gigId))).limit(1);
    if (!application) return reply.status(404).send({ error: 'Application not found', statusCode: 404 });
    if (application.applicantId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });

    const [attachment] = await db.select().from(applicationAttachments)
      .where(and(eq(applicationAttachments.id, attId), eq(applicationAttachments.applicationId, appId))).limit(1);
    if (!attachment) return reply.status(404).send({ error: 'Attachment not found', statusCode: 404 });

    await db.delete(applicationAttachments).where(eq(applicationAttachments.id, attId));
    return reply.status(204).send();
  });
}
