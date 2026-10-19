import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { applications, contractCancellationRequests, contracts, notifications } from '../../db/schema/index.js';
import { users } from '../../db/schema/users.js';
import { requireAuth } from '../../middleware/guards.js';
import { loadGigVisibilityContext, presentGig } from '../../lib/gig-visibility.js';

const contractIdParamsSchema = z.object({ id: z.string().uuid() });
const cancellationRequestParamsSchema = z.object({ id: z.string().uuid(), requestId: z.string().uuid() });
const cancellationRequestBodySchema = z.object({
  reason: z.string().trim().max(1000).optional(),
}).strict();

type CancellationRequestRecord = typeof contractCancellationRequests.$inferSelect;

async function notifyCancellation(
  app: FastifyInstance,
  cancellationRequest: CancellationRequestRecord,
  type: string,
  recipientIds = [cancellationRequest.requesterId, cancellationRequest.recipientId],
) {
  const entries = [...new Set(recipientIds)].map((recipientId) => ({
    recipientId,
    type,
    payload: { contractId: cancellationRequest.contractId, requestId: cancellationRequest.id },
  }));

  try {
    await db.insert(notifications).values(entries);
  } catch (error) {
    app.log.warn({ err: error, cancellationRequestId: cancellationRequest.id }, 'Cancellation notification failed; retrying once');
    try {
      await db.insert(notifications).values(entries);
    } catch (retryError) {
      app.log.error({ err: retryError, cancellationRequestId: cancellationRequest.id }, 'Cancellation notification retry failed');
    }
  }
}

/**
 * Returns true when the half-time rule allows marking complete or raising a dispute.
 * UAT accounts (@uat.gigs.ge) always bypass this restriction.
 */
function isHalfTimePassed(
  contract: { agreedStartAt: Date; dueAt: Date | null },
  userEmail: string,
): boolean {
  if (userEmail.endsWith('@uat.gigs.ge')) return true;
  if (!contract.dueAt) return true; // no due date → no restriction
  const start = contract.agreedStartAt.getTime();
  const due = contract.dueAt.getTime();
  const halfway = start + (due - start) / 2;
  return Date.now() >= halfway;
}

/** Fetch the email for a given user ID. */
async function getUserEmail(userId: string): Promise<string | null> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return user?.email ?? null;
}

export async function contractsRoutes(app: FastifyInstance) {
  // ── GET /:id ───────────────────────────────────────────────────────────────
  app.get('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = contractIdParamsSchema.parse(request.params);

    const contract = await db.query.contracts.findFirst({
      where: eq(contracts.id, params.id),
      with: {
        gig: true,
        application: true,
        cancellationRequests: true,
      },
    });

    if (!contract) {
      return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    }

    const isParty =
      contract.posterId === request.user.sub || contract.workerId === request.user.sub;
    if (!isParty) {
      return reply.status(403).send({ error: 'You can only view your own contracts', statusCode: 403 });
    }

    const visibility = await loadGigVisibilityContext(request.user, [contract.gigId]);
    const { cancellationRequests: requestHistory = [], ...contractData } = contract;
    const requests = requestHistory ?? [];
    const pendingRequest = requests.find((item) => item.status === 'pending');
    let cancellationRequest = pendingRequest ?? requests
      .filter((item) => item.status !== 'pending')
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;

    if (pendingRequest && contract.status !== 'in_progress') {
      const now = new Date();
      const [superseded] = await db.update(contractCancellationRequests)
        .set({ status: 'superseded', resolvedAt: now })
        .where(and(
          eq(contractCancellationRequests.id, pendingRequest.id),
          eq(contractCancellationRequests.status, 'pending'),
        ))
        .returning();

      if (superseded) {
        await notifyCancellation(app, superseded, 'cancellation_superseded');
        cancellationRequest = superseded;
      }
    }

    return reply.send({
      contract: { ...contractData, gig: presentGig(contract.gig, visibility) },
      cancellationRequest,
    });
  });

  // ── POST /:id/sign ─────────────────────────────────────────────────────────
  app.post('/:id/sign', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = contractIdParamsSchema.parse(request.params);

    const contract = await db.query.contracts.findFirst({
      where: eq(contracts.id, params.id),
    });

    if (!contract) {
      return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    }

    const isPoster = contract.posterId === request.user.sub;
    const isWorker = contract.workerId === request.user.sub;

    if (!isPoster && !isWorker) {
      return reply.status(403).send({ error: 'You can only sign your own contracts', statusCode: 403 });
    }

    if (contract.status !== 'draft') {
      return reply.status(409).send({ error: 'Only draft contracts can be signed', statusCode: 409 });
    }

    const now = new Date();
    const posterIsSigned = Boolean(contract.posterSignedAt || isPoster);
    const workerIsSigned = Boolean(contract.workerSignedAt || isWorker);

    const [updatedContract] = await db
      .update(contracts)
      .set({
        ...(isPoster && !contract.posterSignedAt && { posterSignedAt: now }),
        ...(isWorker && !contract.workerSignedAt && { workerSignedAt: now }),
        ...(posterIsSigned && workerIsSigned && { status: 'in_progress' }),
        updatedAt: now,
      })
      .where(eq(contracts.id, params.id))
      .returning();

    return reply.send({ contract: updatedContract });
  });

  // ── POST /:id/mark-complete ────────────────────────────────────────────────
  // Worker (in_progress)        → pending_completion
  // Poster (pending_completion) → completed
  app.post('/:id/mark-complete', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = contractIdParamsSchema.parse(request.params);

    const contract = await db.query.contracts.findFirst({
      where: eq(contracts.id, params.id),
    });

    if (!contract) {
      return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    }

    const isPoster = contract.posterId === request.user.sub;
    const isWorker = contract.workerId === request.user.sub;

    if (!isPoster && !isWorker) {
      return reply.status(403).send({ error: 'Access denied', statusCode: 403 });
    }

    const userEmail = (await getUserEmail(request.user.sub)) ?? '';

    if (isWorker) {
      if (contract.status !== 'in_progress') {
        return reply.status(409).send({ error: 'Contract must be in progress for worker to mark complete', statusCode: 409 });
      }
      if (!isHalfTimePassed(contract, userEmail)) {
        return reply.status(409).send({ error: 'Half-time rule: too early to mark complete', statusCode: 409 });
      }
      const now = new Date();
      const [updated] = await db
        .update(contracts)
        .set({ status: 'pending_completion', completionMarkedBy: request.user.sub, completionMarkedAt: now, updatedAt: now })
        .where(eq(contracts.id, params.id))
        .returning();
      return reply.send({ contract: updated });
    }

    // isPoster
    if (contract.status !== 'pending_completion') {
      return reply.status(409).send({ error: 'Contract must be pending completion for poster to confirm', statusCode: 409 });
    }
    const now = new Date();
    const [updated] = await db
      .update(contracts)
      .set({ status: 'completed', completedAt: now, updatedAt: now })
      .where(eq(contracts.id, params.id))
      .returning();
    return reply.send({ contract: updated });
  });

  // ── POST /:id/dispute ──────────────────────────────────────────────────────
  // Poster only. From in_progress (after half-time) or pending_completion → disputed.
  app.post('/:id/dispute', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = contractIdParamsSchema.parse(request.params);

    const contract = await db.query.contracts.findFirst({
      where: eq(contracts.id, params.id),
    });

    if (!contract) {
      return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    }

    if (contract.posterId !== request.user.sub) {
      return reply.status(403).send({ error: 'Only the poster can raise a dispute', statusCode: 403 });
    }

    if (contract.status !== 'in_progress' && contract.status !== 'pending_completion') {
      return reply.status(409).send({ error: 'Contract must be in progress or pending completion to dispute', statusCode: 409 });
    }

    const userEmail = (await getUserEmail(request.user.sub)) ?? '';
    if (contract.status === 'in_progress' && !isHalfTimePassed(contract, userEmail)) {
      return reply.status(409).send({ error: 'Half-time rule: too early to raise a dispute', statusCode: 409 });
    }

    const now = new Date();
    const [updated] = await db
      .update(contracts)
      .set({ status: 'disputed', disputedAt: now, updatedAt: now })
      .where(eq(contracts.id, params.id))
      .returning();
    return reply.send({ contract: updated });
  });

  app.post('/:id/cancellation-requests', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = contractIdParamsSchema.parse(request.params);
    const body = cancellationRequestBodySchema.parse(request.body ?? {});

    const result = await db.transaction(async (tx) => {
      const [contract] = await tx.select().from(contracts)
        .where(eq(contracts.id, params.id))
        .for('update');

      if (!contract) return { error: 'Contract not found', statusCode: 404 as const };
      const isPoster = contract.posterId === request.user.sub;
      const isWorker = contract.workerId === request.user.sub;
      if (!isPoster && !isWorker) return { error: 'Access denied', statusCode: 403 as const };
      if (contract.status !== 'in_progress') {
        return { error: 'Only in-progress contracts can request cancellation', statusCode: 409 as const };
      }

      const [pending] = await tx.select().from(contractCancellationRequests)
        .where(and(
          eq(contractCancellationRequests.contractId, contract.id),
          eq(contractCancellationRequests.status, 'pending'),
        ))
        .for('update');

      if (pending) {
        return {
          error: 'A cancellation request is already pending for this contract',
          code: 'CANCELLATION_REQUEST_PENDING',
          statusCode: 409 as const,
        };
      }

      const [cancellationRequest] = await tx.insert(contractCancellationRequests).values({
        contractId: contract.id,
        requesterId: request.user.sub,
        recipientId: isPoster ? contract.workerId : contract.posterId,
        reason: body.reason || null,
      }).returning();

      return { cancellationRequest };
    });

    if ('error' in result) {
      const { error, statusCode, ...details } = result;
      const responseStatus = statusCode ?? 500;
      return reply.status(responseStatus).send({ error, statusCode: responseStatus, ...details });
    }

    await notifyCancellation(app, result.cancellationRequest, 'cancellation_requested', [result.cancellationRequest.recipientId]);
    return reply.status(201).send(result);
  });

  app.post('/:id/cancellation-requests/:requestId/:decision', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = cancellationRequestParamsSchema.extend({
      decision: z.enum(['accept', 'decline']),
    }).parse(request.params);

    const result = await db.transaction(async (tx) => {
      const [contract] = await tx.select().from(contracts)
        .where(eq(contracts.id, params.id))
        .for('update');

      if (!contract) return { error: 'Contract not found', statusCode: 404 as const };
      if (contract.posterId !== request.user.sub && contract.workerId !== request.user.sub) {
        return { error: 'Access denied', statusCode: 403 as const };
      }

      const [cancellationRequest] = await tx.select().from(contractCancellationRequests)
        .where(and(
          eq(contractCancellationRequests.id, params.requestId),
          eq(contractCancellationRequests.contractId, contract.id),
        ))
        .for('update');

      if (!cancellationRequest) return { error: 'Cancellation request not found', statusCode: 404 as const };
      if (cancellationRequest.recipientId !== request.user.sub) {
        return { error: 'Only the recipient can respond to this request', statusCode: 403 as const };
      }
      if (cancellationRequest.status !== 'pending') {
        return { error: 'This cancellation request is no longer pending', statusCode: 409 as const };
      }

      const now = new Date();
      if (contract.status !== 'in_progress') {
        const [superseded] = await tx.update(contractCancellationRequests)
          .set({ status: 'superseded', resolvedAt: now })
          .where(and(
            eq(contractCancellationRequests.id, cancellationRequest.id),
            eq(contractCancellationRequests.status, 'pending'),
          ))
          .returning();

        if (superseded) {
          return {
            error: 'This contract changed before the cancellation request was answered',
            code: 'CANCELLATION_REQUEST_SUPERSEDED',
            statusCode: 409 as const,
            supersededRequest: superseded,
          };
        }
        return { error: 'This contract changed before the cancellation request was answered', code: 'CANCELLATION_REQUEST_SUPERSEDED', statusCode: 409 as const };
      }

      let cancelledContract: typeof contracts.$inferSelect | undefined;
      if (params.decision === 'accept') {
        [cancelledContract] = await tx.update(contracts).set({
          status: 'cancelled',
          cancelledAt: now,
          feeEligible: false,
          updatedAt: now,
        }).where(and(
          eq(contracts.id, contract.id),
          eq(contracts.status, 'in_progress'),
        )).returning();

        if (!cancelledContract) {
          return { error: 'This contract changed before cancellation could complete', code: 'CANCELLATION_REQUEST_SUPERSEDED', statusCode: 409 as const };
        }

        await tx.update(applications)
          .set({ status: 'rejected', updatedAt: now })
          .where(eq(applications.id, contract.applicationId));
      }

      const status = params.decision === 'accept' ? 'accepted' : 'declined';
      const [resolvedRequest] = await tx.update(contractCancellationRequests)
        .set({ status, respondedBy: request.user.sub, resolvedAt: now })
        .where(and(
          eq(contractCancellationRequests.id, cancellationRequest.id),
          eq(contractCancellationRequests.status, 'pending'),
        ))
        .returning();

      if (!resolvedRequest) {
        return { error: 'This cancellation request is no longer pending', statusCode: 409 as const };
      }

      return { ...(cancelledContract && { contract: cancelledContract }), cancellationRequest: resolvedRequest };
    });

    if ('error' in result) {
      if ('supersededRequest' in result && result.supersededRequest) {
        await notifyCancellation(app, result.supersededRequest, 'cancellation_superseded');
      }
      const { error, statusCode, ...details } = result;
      const responseStatus = statusCode ?? 500;
      return reply.status(responseStatus).send({ error, statusCode: responseStatus, ...details });
    }

    if (result.cancellationRequest) {
      await notifyCancellation(app, result.cancellationRequest, `cancellation_${result.cancellationRequest.status}`);
    }
    return reply.send(result);
  });

  app.delete('/:id/cancellation-requests/:requestId', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = cancellationRequestParamsSchema.parse(request.params);
    const result = await db.transaction(async (tx) => {
      const [contract] = await tx.select().from(contracts)
        .where(eq(contracts.id, params.id))
        .for('update');

      if (!contract) return { error: 'Contract not found', statusCode: 404 as const };
      if (contract.posterId !== request.user.sub && contract.workerId !== request.user.sub) {
        return { error: 'Access denied', statusCode: 403 as const };
      }

      const [cancellationRequest] = await tx.select().from(contractCancellationRequests)
        .where(and(
          eq(contractCancellationRequests.id, params.requestId),
          eq(contractCancellationRequests.contractId, contract.id),
        ))
        .for('update');

      if (!cancellationRequest) return { error: 'Cancellation request not found', statusCode: 404 as const };
      if (cancellationRequest.requesterId !== request.user.sub) {
        return { error: 'Only the requester can withdraw this request', statusCode: 403 as const };
      }
      if (cancellationRequest.status !== 'pending') {
        return { error: 'This cancellation request is no longer pending', statusCode: 409 as const };
      }

      const now = new Date();
      const [withdrawn] = await tx.update(contractCancellationRequests)
        .set({ status: 'withdrawn', respondedBy: request.user.sub, resolvedAt: now })
        .where(and(
          eq(contractCancellationRequests.id, cancellationRequest.id),
          eq(contractCancellationRequests.status, 'pending'),
        ))
        .returning();

      if (!withdrawn) return { error: 'This cancellation request is no longer pending', statusCode: 409 as const };

      return { cancellationRequest: withdrawn };
    });

    if ('error' in result) {
      const { error, statusCode, ...details } = result;
      const responseStatus = statusCode ?? 500;
      return reply.status(responseStatus).send({ error, statusCode: responseStatus, ...details });
    }

    await notifyCancellation(app, result.cancellationRequest, 'cancellation_withdrawn');
    return reply.send(result);
  });

  // Keep the old route safe for clients that have not refreshed yet.
  app.post('/:id/cancel', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = contractIdParamsSchema.parse(request.params);

    const contract = await db.query.contracts.findFirst({
      where: eq(contracts.id, params.id),
    });

    if (!contract) {
      return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    }

    const isParty =
      contract.posterId === request.user.sub || contract.workerId === request.user.sub;
    if (!isParty) {
      return reply.status(403).send({ error: 'Access denied', statusCode: 403 });
    }

    return reply.status(409).send({
      error: 'Cancellation requires agreement from both parties. Send a cancellation request instead.',
      code: 'MUTUAL_CANCELLATION_REQUIRED',
      statusCode: 409,
    });
  });

  // ── POST /:id/quit ─────────────────────────────────────────────────────────
  // Worker only, from in_progress → quit.
  // If < 24h since signing: no fee (feeEligible = false).
  app.post('/:id/quit', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = contractIdParamsSchema.parse(request.params);

    const contract = await db.query.contracts.findFirst({
      where: eq(contracts.id, params.id),
    });

    if (!contract) {
      return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    }

    if (contract.workerId !== request.user.sub) {
      return reply.status(403).send({ error: 'Only the worker can quit a contract', statusCode: 403 });
    }

    if (contract.status !== 'in_progress') {
      return reply.status(409).send({ error: 'Only in-progress contracts can be quit', statusCode: 409 });
    }

    // The grace clock starts when the second party activates the contract.
    const signedAt = contract.posterSignedAt && contract.workerSignedAt
      ? new Date(Math.max(contract.posterSignedAt.getTime(), contract.workerSignedAt.getTime()))
      : contract.workerSignedAt ?? contract.posterSignedAt;
    const quitNoFee = signedAt !== null && Date.now() - signedAt.getTime() < 24 * 60 * 60 * 1000;

    const now = new Date();
    const [updated] = await db
      .update(contracts)
      .set({
        status: 'quit',
        quitAt: now,
        feeEligible: !quitNoFee,
        updatedAt: now,
      })
      .where(eq(contracts.id, params.id))
      .returning();
    return reply.send({ contract: updated, quitNoFee });
  });
}
