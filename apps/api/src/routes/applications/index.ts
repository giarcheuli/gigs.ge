import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createApplicationSchema } from '@gigs/shared/schemas';
import { db } from '../../db/index.js';
import { applications, contracts, gigs, notifications } from '../../db/schema/index.js';
import { requireAuth, requireVerified } from '../../middleware/guards.js';

const gigIdParamsSchema = z.object({ id: z.string().uuid() });
const applicationIdParamsSchema = z.object({ id: z.string().uuid() });
const createApplicationInputSchema = createApplicationSchema.extend({
  gigId: z.string().uuid(),
});

export async function applicationsRoutes(app: FastifyInstance) {
  app.post('/', { preHandler: [requireVerified] }, async (request, reply) => {
    const body = createApplicationInputSchema.parse(request.body);

    const gig = await db.query.gigs.findFirst({
      where: and(eq(gigs.id, body.gigId), eq(gigs.status, 'active')),
    });

    if (!gig) {
      return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    }

    if (gig.posterId === request.user.sub) {
      return reply.status(409).send({ error: 'You cannot apply to your own gig', statusCode: 409 });
    }

    const existingApplication = await db.query.applications.findFirst({
      where: and(eq(applications.gigId, body.gigId), eq(applications.applicantId, request.user.sub)),
    });

    if (existingApplication) {
      return reply.status(409).send({ error: 'Application already exists for this gig', statusCode: 409 });
    }

    const [application] = await db.insert(applications).values({
      gigId: body.gigId,
      applicantId: request.user.sub,
      message: body.message ?? null,
      status: 'pending',
    }).returning();

    // Create notification for the gig poster
    await db.insert(notifications).values({
      recipientId: gig.posterId,
      type: 'application_submitted',
      payload: {
        applicationId: application.id,
        gigId: gig.id,
        gigName: gig.shortDescription,
        applicantId: request.user.sub,
      },
    });

    return reply.status(201).send({ application });
  });

  app.get('/gig/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = gigIdParamsSchema.parse(request.params);

    const gig = await db.query.gigs.findFirst({
      where: eq(gigs.id, params.id),
    });

    if (!gig) {
      return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    }

    if (gig.posterId !== request.user.sub) {
      return reply.status(403).send({ error: 'You can only view applications for your own gig', statusCode: 403 });
    }

    const data = await db.query.applications.findMany({
      where: eq(applications.gigId, params.id),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    return reply.send({ data });
  });

  app.post('/:id/accept', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = applicationIdParamsSchema.parse(request.params);

    const application = await db.query.applications.findFirst({
      where: eq(applications.id, params.id),
    });

    if (!application) {
      return reply.status(404).send({ error: 'Application not found', statusCode: 404 });
    }

    const gig = await db.query.gigs.findFirst({
      where: eq(gigs.id, application.gigId),
    });

    if (!gig) {
      return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    }

    if (gig.posterId !== request.user.sub) {
      return reply.status(403).send({ error: 'You can only accept applications for your own gig', statusCode: 403 });
    }

    if (gig.status !== 'active') {
      return reply.status(409).send({ error: 'Applications can only be accepted on active gigs', statusCode: 409 });
    }

    if (application.status !== 'pending') {
      return reply.status(409).send({ error: 'Only pending applications can be accepted', statusCode: 409 });
    }

    if (gig.priceType !== 'fixed' || !gig.priceFixed) {
      return reply.status(409).send({
        error: 'Only fixed-price gigs are currently supported for contract acceptance',
        statusCode: 409,
      });
    }

    const existingContract = await db.query.contracts.findFirst({
      where: eq(contracts.applicationId, application.id),
    });

    if (existingContract) {
      return reply.status(409).send({ error: 'Application has already been accepted', statusCode: 409 });
    }

    const [acceptedApplication, contract] = await db.transaction(async (tx) => {
      const [updatedApplication] = await tx.update(applications)
        .set({ status: 'accepted', updatedAt: new Date() })
        .where(eq(applications.id, application.id))
        .returning();

      const [createdContract] = await tx.insert(contracts).values({
        applicationId: application.id,
        gigId: application.gigId,
        posterId: gig.posterId,
        workerId: application.applicantId,
        agreedPrice: gig.priceFixed,
        agreedStartAt: gig.availableFrom ?? new Date(),
        dueAt: gig.availableTo,
        status: 'draft',
      }).returning();

      return [updatedApplication, createdContract] as const;
    });

    return reply.send({ application: acceptedApplication, contract });
  });

  /**
   * GET /applications/mine
   * Returns all applications submitted by the current user, with gig info.
   */
  app.get('/mine', { preHandler: [requireAuth] }, async (request, reply) => {
    const data = await db.query.applications.findMany({
      where: eq(applications.applicantId, request.user.sub),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      with: {
        gig: true,
        contract: true,
      },
    });

    return reply.send({ data });
  });

  /**
   * DELETE /applications/:id
   * Worker withdraws their own pending application.
   */
  app.delete('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = applicationIdParamsSchema.parse(request.params);

    const application = await db.query.applications.findFirst({
      where: eq(applications.id, params.id),
    });

    if (!application) {
      return reply.status(404).send({ error: 'Application not found', statusCode: 404 });
    }

    if (application.applicantId !== request.user.sub) {
      return reply.status(403).send({ error: 'You can only withdraw your own applications', statusCode: 403 });
    }

    if (application.status !== 'pending') {
      return reply.status(409).send({ error: 'Only pending applications can be withdrawn', statusCode: 409 });
    }

    const [updated] = await db
      .update(applications)
      .set({ status: 'withdrawn', updatedAt: new Date() })
      .where(eq(applications.id, params.id))
      .returning();

    return reply.send({ application: updated });
  });
}
