import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { contracts } from '../../db/schema/index.js';
import { users } from '../../db/schema/users.js';
import { requireAuth } from '../../middleware/guards.js';

const contractIdParamsSchema = z.object({ id: z.string().uuid() });

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

    return reply.send({ contract });
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

  // ── POST /:id/cancel ───────────────────────────────────────────────────────
  // Either party from in_progress → cancelled.
  // Fee waived when both signed less than 24h ago (grace period).
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

    if (contract.status !== 'in_progress') {
      return reply.status(409).send({ error: 'Only in-progress contracts can be cancelled', statusCode: 409 });
    }

    // Grace period: if both signed less than 24h ago, waive fees.
    const bothSignedAt = contract.posterSignedAt && contract.workerSignedAt
      ? Math.max(contract.posterSignedAt.getTime(), contract.workerSignedAt.getTime())
      : null;
    const withinGrace = bothSignedAt !== null && Date.now() - bothSignedAt < 24 * 60 * 60 * 1000;

    const now = new Date();
    const [updated] = await db
      .update(contracts)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        feeEligible: !withinGrace,
        updatedAt: now,
      })
      .where(eq(contracts.id, params.id))
      .returning();
    return reply.send({ contract: updated, withinGrace });
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

    // Worker quit < 24h after signing → no fee.
    const signedAt = contract.workerSignedAt ?? contract.posterSignedAt;
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
