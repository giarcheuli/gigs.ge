import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { contracts } from '../../db/schema/index.js';
import { requireAuth } from '../../middleware/guards.js';

const contractIdParamsSchema = z.object({ id: z.string().uuid() });

export async function contractsRoutes(app: FastifyInstance) {
  app.get('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = contractIdParamsSchema.parse(request.params);

    const contract = await db.query.contracts.findFirst({
      where: eq(contracts.id, params.id),
    });

    if (!contract) {
      return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    }

    const isParty = contract.posterId === request.user.sub || contract.workerId === request.user.sub;
    if (!isParty) {
      return reply.status(403).send({ error: 'You can only view your own contracts', statusCode: 403 });
    }

    return reply.send({ contract });
  });

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

    const [updatedContract] = await db.update(contracts).set({
      ...(isPoster && !contract.posterSignedAt && { posterSignedAt: now }),
      ...(isWorker && !contract.workerSignedAt && { workerSignedAt: now }),
      ...(posterIsSigned && workerIsSigned && { status: 'in_progress' }),
      updatedAt: now,
    }).where(eq(contracts.id, params.id)).returning();

    return reply.send({ contract: updatedContract });
  });
}
