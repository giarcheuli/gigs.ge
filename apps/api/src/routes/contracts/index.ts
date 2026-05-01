import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  contracts,
  contractAppendices,
  disputeEvidence,
  applications,
  gigs,
  billingLedger,
  reviews,
} from '../../db/schema/index.js';
import { eq, and, count, desc } from 'drizzle-orm';
import { requireAuth, requireVerified } from '../../plugins/auth.js';
import {
  createContractSchema,
  updateContractDraftSchema,
  createAppendixSchema,
  resolveAppendixSchema,
  submitEvidenceSchema,
  createReviewSchema,
  GRACE_PERIOD_MS,
  DISPUTE_ARBITER_UNLOCK_MS,
  REVIEW_WINDOW_MS,
  MAX_APPENDICES_PER_CONTRACT,
  POSTER_FEE_RATE,
  WORKER_FEE_RATE,
} from '@gigs/shared';

export async function contractRoutes(app: FastifyInstance): Promise<void> {
  // POST /
  app.post('/', { preHandler: requireVerified }, async (request, reply) => {
    const parsed = createContractSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { applicationId } = parsed.data;

    const [application] = await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1);
    if (!application) return reply.status(404).send({ error: 'Application not found', statusCode: 404 });
    if (application.status !== 'accepted') return reply.status(400).send({ error: 'Application must be accepted', statusCode: 400 });

    const [gig] = await db.select().from(gigs).where(eq(gigs.id, application.gigId)).limit(1);
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.posterId !== request.user.id) return reply.status(403).send({ error: 'Only gig owner can create contract', statusCode: 403 });

    const [contract] = await db.insert(contracts).values({
      applicationId,
      gigId: application.gigId,
      posterId: gig.posterId,
      workerId: application.applicantId,
      agreedStartAt: new Date(),
      status: 'draft',
      feeEligible: true,
    }).returning();
    return reply.status(201).send(contract);
  });

  // GET /:id
  app.get('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!contract) return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    if (contract.posterId !== request.user.id && contract.workerId !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    }
    return reply.send(contract);
  });

  // PATCH /:id
  app.patch('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!contract) return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    if (contract.posterId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    if (contract.status !== 'draft') return reply.status(400).send({ error: 'Contract must be in draft status', statusCode: 400 });

    const parsed = updateContractDraftSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const data = parsed.data;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.agreedPrice !== undefined) updateData['agreedPrice'] = data.agreedPrice;
    if (data.agreedStartAt !== undefined) updateData['agreedStartAt'] = new Date(data.agreedStartAt);
    if (data.dueAt !== undefined) updateData['dueAt'] = data.dueAt ? new Date(data.dueAt) : null;

    const [updated] = await db.update(contracts).set(updateData).where(eq(contracts.id, id)).returning();
    return reply.send(updated);
  });

  // POST /:id/sign
  app.post('/:id/sign', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!contract) return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });

    const isPoster = request.user.id === contract.posterId;
    const isWorker = request.user.id === contract.workerId;
    if (!isPoster && !isWorker) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (isPoster) updateData['posterSignedAt'] = new Date();
    if (isWorker) updateData['workerSignedAt'] = new Date();

    const newPosterSignedAt = isPoster ? new Date() : contract.posterSignedAt;
    const newWorkerSignedAt = isWorker ? new Date() : contract.workerSignedAt;
    if (newPosterSignedAt && newWorkerSignedAt) {
      updateData['status'] = 'in_progress';
    }

    const [updated] = await db.update(contracts).set(updateData).where(eq(contracts.id, id)).returning();
    return reply.send(updated);
  });

  // POST /:id/reject
  app.post('/:id/reject', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!contract) return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    if (contract.workerId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    if (contract.status !== 'draft') return reply.status(400).send({ error: 'Contract must be in draft status', statusCode: 400 });

    const [updated] = await db.update(contracts)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(contracts.id, id)).returning();
    return reply.send(updated);
  });

  // POST /:id/complete
  app.post('/:id/complete', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!contract) return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });

    const isPoster = request.user.id === contract.posterId;
    const isWorker = request.user.id === contract.workerId;
    if (!isPoster && !isWorker) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    if (contract.status !== 'in_progress' && contract.status !== 'pending_completion') {
      return reply.status(400).send({ error: 'Invalid contract status', statusCode: 400 });
    }

    // Half-time rule
    if (contract.dueAt) {
      const halfTime = contract.agreedStartAt.getTime() + (contract.dueAt.getTime() - contract.agreedStartAt.getTime()) / 2;
      if (Date.now() < halfTime) {
        return reply.status(422).send({ error: 'Too early to mark complete', statusCode: 422 });
      }
    }

    if (contract.status === 'pending_completion' && contract.completionMarkedBy !== request.user.id) {
      // Other party confirms — complete the contract
      const now = new Date();
      await db.update(contracts)
        .set({ status: 'completed', completedAt: now, updatedAt: now })
        .where(eq(contracts.id, id));

      if (contract.feeEligible && contract.agreedPrice) {
        // Convert to cents first to avoid floating-point drift, then round fees before converting back.
        const priceInCents = Math.round(parseFloat(contract.agreedPrice || '0') * 100);
        const posterFee = (Math.round(priceInCents * POSTER_FEE_RATE) / 100).toFixed(2);
        const workerFee = (Math.round(priceInCents * WORKER_FEE_RATE) / 100).toFixed(2);
        await db.insert(billingLedger).values([
          {
            userId: contract.posterId,
            contractId: contract.id,
            amount: posterFee,
            type: 'poster_fee',
            status: 'pending',
          },
          {
            userId: contract.workerId,
            contractId: contract.id,
            amount: workerFee,
            type: 'worker_fee',
            status: 'pending',
          },
        ]);
      }
      const [updated] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
      return reply.send(updated);
    }

    // First party marks complete
    const [updated] = await db.update(contracts)
      .set({
        status: 'pending_completion',
        completionMarkedBy: request.user.id,
        completionMarkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, id)).returning();
    return reply.send(updated);
  });

  // POST /:id/not-done
  app.post('/:id/not-done', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!contract) return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    if (contract.posterId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    if (contract.status !== 'pending_completion') return reply.status(400).send({ error: 'Contract must be pending_completion', statusCode: 400 });

    const [updated] = await db.update(contracts)
      .set({ status: 'disputed', disputedAt: new Date(), updatedAt: new Date() })
      .where(eq(contracts.id, id)).returning();
    return reply.send(updated);
  });

  // POST /:id/quit
  app.post('/:id/quit', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!contract) return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    if (contract.workerId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    if (contract.status !== 'in_progress' && contract.status !== 'pending_completion') {
      return reply.status(400).send({ error: 'Invalid contract status', statusCode: 400 });
    }

    const [updated] = await db.update(contracts)
      .set({ status: 'quit', quitAt: new Date(), updatedAt: new Date() })
      .where(eq(contracts.id, id)).returning();
    return reply.send(updated);
  });

  // POST /:id/cancel
  app.post('/:id/cancel', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!contract) return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });

    const isPoster = request.user.id === contract.posterId;
    const isWorker = request.user.id === contract.workerId;
    if (!isPoster && !isWorker) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    if (contract.status !== 'draft' && contract.status !== 'in_progress') {
      return reply.status(400).send({ error: 'Cannot cancel contract in current status', statusCode: 400 });
    }

    // Grace period: 24h from when both parties signed (contract entered in_progress).
    // Use the later of the two signatures so the window starts when the contract actually became active.
    const contractStartedAt = (contract.posterSignedAt && contract.workerSignedAt)
      ? new Date(Math.max(contract.posterSignedAt.getTime(), contract.workerSignedAt.getTime()))
      : contract.createdAt;
    const withinGrace = Date.now() - contractStartedAt.getTime() <= GRACE_PERIOD_MS;
    const [updated] = await db.update(contracts)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        feeEligible: withinGrace ? false : contract.feeEligible,
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, id)).returning();
    return reply.send(updated);
  });

  // POST /:id/appendices
  app.post('/:id/appendices', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!contract) return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    if (contract.posterId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    if (contract.status !== 'in_progress') return reply.status(400).send({ error: 'Contract must be in_progress', statusCode: 400 });

    const parsed = createAppendixSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }

    const countResult = await db.select({ value: count() }).from(contractAppendices)
      .where(eq(contractAppendices.contractId, id));
    const appendixCount = Number(countResult[0]?.value ?? 0);
    if (appendixCount >= MAX_APPENDICES_PER_CONTRACT) {
      return reply.status(422).send({ error: `Maximum ${MAX_APPENDICES_PER_CONTRACT} appendices allowed`, statusCode: 422 });
    }

    const data = parsed.data;
    const [appendix] = await db.insert(contractAppendices).values({
      contractId: id,
      proposedBy: request.user.id,
      description: data.description,
      additionalCompensation: data.additionalCompensation ?? null,
      newDueAt: data.newDueAt ? new Date(data.newDueAt) : null,
      newStartAt: data.newStartAt ? new Date(data.newStartAt) : null,
      status: 'proposed',
      appendixNumber: appendixCount + 1,
    }).returning();
    return reply.status(201).send(appendix);
  });

  // PATCH /:id/appendices/:appxId
  app.patch('/:id/appendices/:appxId', { preHandler: requireAuth }, async (request, reply) => {
    const { id, appxId } = request.params as { id: string; appxId: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!contract) return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    if (contract.workerId !== request.user.id) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });

    const [appendix] = await db.select().from(contractAppendices)
      .where(and(eq(contractAppendices.id, appxId), eq(contractAppendices.contractId, id))).limit(1);
    if (!appendix) return reply.status(404).send({ error: 'Appendix not found', statusCode: 404 });
    if (appendix.status !== 'proposed') return reply.status(400).send({ error: 'Appendix must be in proposed status', statusCode: 400 });

    const parsed = resolveAppendixSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }

    const now = new Date();
    await db.update(contractAppendices)
      .set({ status: parsed.data.status, resolvedAt: now })
      .where(eq(contractAppendices.id, appxId));

    if (parsed.data.status === 'accepted') {
      const contractUpdate: Record<string, unknown> = { updatedAt: now };
      if (appendix.additionalCompensation) {
        // Use cents-based arithmetic to avoid floating-point drift across multiple appendices.
        const currentCents = Math.round(parseFloat(contract.agreedPrice ?? '0') * 100);
        const additionalCents = Math.round(parseFloat(appendix.additionalCompensation ?? '0') * 100);
        contractUpdate['agreedPrice'] = ((currentCents + additionalCents) / 100).toFixed(2);
      }
      if (appendix.newDueAt) contractUpdate['dueAt'] = appendix.newDueAt;
      if (appendix.newStartAt) contractUpdate['agreedStartAt'] = appendix.newStartAt;
      await db.update(contracts).set(contractUpdate).where(eq(contracts.id, id));
    }

    const [updated] = await db.select().from(contractAppendices).where(eq(contractAppendices.id, appxId)).limit(1);
    return reply.send(updated);
  });

  // POST /:id/evidence
  app.post('/:id/evidence', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!contract) return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });

    const isPoster = request.user.id === contract.posterId;
    const isWorker = request.user.id === contract.workerId;
    if (!isPoster && !isWorker) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    if (contract.status !== 'disputed' && contract.status !== 'arbitration') {
      return reply.status(400).send({ error: 'Contract must be disputed or in arbitration', statusCode: 400 });
    }

    const parsed = submitEvidenceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }

    const [evidence] = await db.insert(disputeEvidence).values({
      contractId: id,
      userId: request.user.id,
      description: parsed.data.description,
    }).returning();
    return reply.status(201).send(evidence);
  });

  // POST /:id/escalate
  app.post('/:id/escalate', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!contract) return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });

    const isPoster = request.user.id === contract.posterId;
    const isWorker = request.user.id === contract.workerId;
    if (!isPoster && !isWorker) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    if (contract.status !== 'disputed') return reply.status(400).send({ error: 'Contract must be disputed', statusCode: 400 });
    if (!contract.disputedAt) return reply.status(400).send({ error: 'Invalid dispute state', statusCode: 400 });

    if (Date.now() - contract.disputedAt.getTime() < DISPUTE_ARBITER_UNLOCK_MS) {
      return reply.status(422).send({ error: 'Must wait 24 hours before escalating to arbitration', statusCode: 422 });
    }

    const [updated] = await db.update(contracts)
      .set({ status: 'arbitration', updatedAt: new Date() })
      .where(eq(contracts.id, id)).returning();
    return reply.send(updated);
  });

  // POST /:id/reviews
  app.post('/:id/reviews', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!contract) return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });

    const isPoster = request.user.id === contract.posterId;
    const isWorker = request.user.id === contract.workerId;
    if (!isPoster && !isWorker) return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    if (contract.status !== 'completed' && contract.status !== 'auto_resolved') {
      return reply.status(400).send({ error: 'Contract must be completed or auto_resolved', statusCode: 400 });
    }

    const refDate = contract.completedAt ?? contract.arbiterDecidedAt;
    if (!refDate) return reply.status(400).send({ error: 'Invalid contract state', statusCode: 400 });
    if (Date.now() - refDate.getTime() > REVIEW_WINDOW_MS) {
      return reply.status(422).send({ error: 'Review window has expired', statusCode: 422 });
    }

    const existing = await db.select().from(reviews)
      .where(and(eq(reviews.contractId, id), eq(reviews.reviewerId, request.user.id))).limit(1);
    if (existing.length > 0) return reply.status(409).send({ error: 'Already reviewed', statusCode: 409 });

    const parsed = createReviewSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }

    const targetId = isPoster ? contract.workerId : contract.posterId;
    const now = new Date();
    const [review] = await db.insert(reviews).values({
      contractId: id,
      reviewerId: request.user.id,
      targetId,
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null,
      status: 'published',
      publishedAt: now,
    }).returning();
    return reply.status(201).send(review);
  });

  // GET /:id/appendices
  app.get('/:id/appendices', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!contract) return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    if (contract.posterId !== request.user.id && contract.workerId !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden', statusCode: 403 });
    }
    const rows = await db.select().from(contractAppendices)
      .where(eq(contractAppendices.contractId, id))
      .orderBy(desc(contractAppendices.appendixNumber));
    return reply.send(rows);
  });
}
