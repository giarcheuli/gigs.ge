import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { users, gigs, contracts, gigFlags, invoices } from '../../db/schema/index.js';
import { eq, desc, count } from 'drizzle-orm';
import { requireAdmin } from '../../plugins/auth.js';
import {
  adminUpdateUserSchema,
  adminResolveDisputeSchema,
  adminMarkInvoicePaidSchema,
  paginationSchema,
} from '@gigs/shared';
import { GIG_STATUSES, FLAG_STATUSES } from '@gigs/shared/constants';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // GET /users
  app.get('/users', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
      db.select().from(users).orderBy(desc(users.createdAt)).limit(limit).offset(offset),
      db.select({ value: count() }).from(users),
    ]);
    const total = Number(countResult[0]?.value ?? 0);
    const data = rows.map(({ passwordHash: _, ...u }) => u);
    return reply.send({ data, total, page, limit, hasMore: offset + rows.length < total });
  });

  // GET /users/:id
  app.get('/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) return reply.status(404).send({ error: 'User not found', statusCode: 404 });
    const { passwordHash: _, ...userWithoutPassword } = user;
    return reply.send(userWithoutPassword);
  });

  // PATCH /users/:id
  app.patch('/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = adminUpdateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const [updated] = await db.update(users).set(parsed.data).where(eq(users.id, id)).returning();
    if (!updated) return reply.status(404).send({ error: 'User not found', statusCode: 404 });
    const { passwordHash: _, ...userWithoutPassword } = updated;
    return reply.send(userWithoutPassword);
  });

  // GET /gigs
  app.get('/gigs', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
      db.select().from(gigs).orderBy(desc(gigs.createdAt)).limit(limit).offset(offset),
      db.select({ value: count() }).from(gigs),
    ]);
    const total = Number(countResult[0]?.value ?? 0);
    return reply.send({ data: rows, total, page, limit, hasMore: offset + rows.length < total });
  });

  // GET /gigs/:id
  app.get('/gigs/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [gig] = await db.select().from(gigs).where(eq(gigs.id, id)).limit(1);
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    return reply.send(gig);
  });

  // PATCH /gigs/:id
  app.patch('/gigs/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { status?: string };
    if (!body.status) return reply.status(400).send({ error: 'status is required', statusCode: 400 });
    if (!(GIG_STATUSES as readonly string[]).includes(body.status)) {
      return reply.status(400).send({ error: `Invalid gig status. Must be one of: ${GIG_STATUSES.join(', ')}`, statusCode: 400 });
    }
    const [updated] = await db.update(gigs)
      .set({ status: body.status as typeof gigs.$inferInsert['status'], updatedAt: new Date() })
      .where(eq(gigs.id, id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    return reply.send(updated);
  });

  // GET /contracts
  app.get('/contracts', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
      db.select().from(contracts).orderBy(desc(contracts.createdAt)).limit(limit).offset(offset),
      db.select({ value: count() }).from(contracts),
    ]);
    const total = Number(countResult[0]?.value ?? 0);
    return reply.send({ data: rows, total, page, limit, hasMore: offset + rows.length < total });
  });

  // GET /contracts/:id
  app.get('/contracts/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    if (!contract) return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    return reply.send(contract);
  });

  // PATCH /contracts/:id/resolve
  app.patch('/contracts/:id/resolve', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = adminResolveDisputeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const [updated] = await db.update(contracts)
      .set({
        arbiterDecision: parsed.data.decision,
        arbiterNotes: parsed.data.notes ?? null,
        arbiterDecidedAt: new Date(),
        status: 'auto_resolved',
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Contract not found', statusCode: 404 });
    return reply.send(updated);
  });

  // GET /flags
  app.get('/flags', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;
    const query = request.query as { status?: string };

    const conditions = [];
    if (query.status) conditions.push(eq(gigFlags.status, query.status));

    const whereClause = conditions.length > 0 ? conditions[0] : undefined;
    const [rows, countResult] = await Promise.all([
      db.select().from(gigFlags)
        .where(whereClause)
        .orderBy(desc(gigFlags.createdAt)).limit(limit).offset(offset),
      db.select({ value: count() }).from(gigFlags).where(whereClause),
    ]);
    const total = Number(countResult[0]?.value ?? 0);
    return reply.send({ data: rows, total, page, limit, hasMore: offset + rows.length < total });
  });

  // PATCH /flags/:id
  app.patch('/flags/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { status?: string };
    if (!body.status) return reply.status(400).send({ error: 'status is required', statusCode: 400 });
    if (!(FLAG_STATUSES as readonly string[]).includes(body.status)) {
      return reply.status(400).send({ error: `Invalid flag status. Must be one of: ${FLAG_STATUSES.join(', ')}`, statusCode: 400 });
    }
    const [updated] = await db.update(gigFlags)
      .set({ status: body.status, reviewedAt: new Date(), reviewedBy: request.user.id })
      .where(eq(gigFlags.id, id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Flag not found', statusCode: 404 });
    return reply.send(updated);
  });

  // GET /invoices
  app.get('/invoices', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
      db.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(limit).offset(offset),
      db.select({ value: count() }).from(invoices),
    ]);
    const total = Number(countResult[0]?.value ?? 0);
    return reply.send({ data: rows, total, page, limit, hasMore: offset + rows.length < total });
  });

  // PATCH /invoices/:id
  app.patch('/invoices/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = adminMarkInvoicePaidSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date();
    const [updated] = await db.update(invoices)
      .set({ status: 'paid', paidAt, markedPaidBy: request.user.id })
      .where(eq(invoices.id, id)).returning();
    if (!updated) return reply.status(404).send({ error: 'Invoice not found', statusCode: 404 });
    return reply.send(updated);
  });
}
