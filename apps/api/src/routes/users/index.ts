import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { users, userProfiles, gigs, applications, contracts, invoices, reviews } from '../../db/schema/index.js';
import { eq, and, or, desc, count } from 'drizzle-orm';
import { requireAuth } from '../../plugins/auth.js';
import { updateProfileSchema, paginationSchema } from '@gigs/shared';

export async function userRoutes(app: FastifyInstance): Promise<void> {
  // GET /me
  app.get('/me', { preHandler: requireAuth }, async (request, reply) => {
    const { passwordHash: _, ...userWithoutPassword } = request.user;
    return reply.send(userWithoutPassword);
  });

  // PATCH /me
  app.patch('/me', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as { email?: string; phone?: string };
    const updates: Record<string, unknown> = {};
    if (body.email !== undefined) updates['email'] = body.email;
    if (body.phone !== undefined) updates['phone'] = body.phone;
    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'No fields to update', statusCode: 400 });
    }
    try {
      const [updated] = await db.update(users)
        .set(updates)
        .where(eq(users.id, request.user.id))
        .returning();
      const { passwordHash: _, ...userWithoutPassword } = updated;
      return reply.send(userWithoutPassword);
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === '23505') {
        return reply.status(409).send({ error: 'Email or phone already in use', statusCode: 409 });
      }
      throw err;
    }
  });

  // GET /me/profile
  app.get('/me/profile', { preHandler: requireAuth }, async (request, reply) => {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, request.user.id)).limit(1);
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found', statusCode: 404 });
    }
    return reply.send(profile);
  });

  // PUT /me/profile
  app.put('/me/profile', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const data = parsed.data;
    await db.insert(userProfiles).values({
      userId: request.user.id,
      ...data,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: userProfiles.userId,
      set: { ...data, updatedAt: new Date() },
    });
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, request.user.id)).limit(1);
    return reply.send(profile);
  });

  // GET /me/gigs
  app.get('/me/gigs', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
      db.select().from(gigs).where(eq(gigs.posterId, request.user.id))
        .orderBy(desc(gigs.createdAt)).limit(limit).offset(offset),
      db.select({ value: count() }).from(gigs).where(eq(gigs.posterId, request.user.id)),
    ]);
    const total = Number(countResult[0]?.value ?? 0);
    return reply.send({ data: rows, total, page, limit, hasMore: offset + rows.length < total });
  });

  // GET /me/work
  app.get('/me/work', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
      db.select({ application: applications, gig: gigs })
        .from(applications)
        .innerJoin(gigs, eq(applications.gigId, gigs.id))
        .where(eq(applications.applicantId, request.user.id))
        .orderBy(desc(applications.createdAt))
        .limit(limit).offset(offset),
      db.select({ value: count() }).from(applications).where(eq(applications.applicantId, request.user.id)),
    ]);
    const total = Number(countResult[0]?.value ?? 0);
    return reply.send({ data: rows, total, page, limit, hasMore: offset + rows.length < total });
  });

  // GET /me/contracts
  app.get('/me/contracts', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;
    const condition = or(eq(contracts.posterId, request.user.id), eq(contracts.workerId, request.user.id))!;

    const [rows, countResult] = await Promise.all([
      db.select().from(contracts).where(condition)
        .orderBy(desc(contracts.createdAt)).limit(limit).offset(offset),
      db.select({ value: count() }).from(contracts).where(condition),
    ]);
    const total = Number(countResult[0]?.value ?? 0);
    return reply.send({ data: rows, total, page, limit, hasMore: offset + rows.length < total });
  });

  // GET /me/invoices
  app.get('/me/invoices', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
      db.select().from(invoices).where(eq(invoices.userId, request.user.id))
        .orderBy(desc(invoices.createdAt)).limit(limit).offset(offset),
      db.select({ value: count() }).from(invoices).where(eq(invoices.userId, request.user.id)),
    ]);
    const total = Number(countResult[0]?.value ?? 0);
    return reply.send({ data: rows, total, page, limit, hasMore: offset + rows.length < total });
  });

  // GET /me/invoices/:id
  app.get('/me/invoices/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [invoice] = await db.select().from(invoices)
      .where(eq(invoices.id, id)).limit(1);
    if (!invoice || invoice.userId !== request.user.id) {
      return reply.status(404).send({ error: 'Invoice not found', statusCode: 404 });
    }
    return reply.send(invoice);
  });

  // GET /me/invoices/:id/pdf
  app.get('/me/invoices/:id/pdf', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [invoice] = await db.select().from(invoices)
      .where(eq(invoices.id, id)).limit(1);
    if (!invoice || invoice.userId !== request.user.id) {
      return reply.status(404).send({ error: 'Invoice not found', statusCode: 404 });
    }
    if (!invoice.pdfUrl) {
      return reply.status(404).send({ error: 'PDF not available', statusCode: 404 });
    }
    return reply.send({ pdfUrl: invoice.pdfUrl });
  });

  // POST /me/avatar
  app.post('/me/avatar', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as { avatarUrl?: unknown };
    if (typeof body.avatarUrl !== 'string') {
      return reply.status(400).send({ error: 'avatarUrl is required', statusCode: 400 });
    }
    await db.insert(userProfiles).values({
      userId: request.user.id,
      avatarUrl: body.avatarUrl,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: userProfiles.userId,
      set: { avatarUrl: body.avatarUrl, updatedAt: new Date() },
    });
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, request.user.id)).limit(1);
    return reply.send(profile);
  });

  // GET /:id/profile
  app.get('/:id/profile', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, id)).limit(1);
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found', statusCode: 404 });
    }
    return reply.send(profile);
  });

  // GET /:id/reviews
  app.get('/:id/reviews', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', statusCode: 400, details: parsed.error.issues });
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;
    const condition = and(eq(reviews.targetId, id), eq(reviews.status, 'published'))!;

    const [rows, countResult] = await Promise.all([
      db.select().from(reviews).where(condition)
        .orderBy(desc(reviews.createdAt)).limit(limit).offset(offset),
      db.select({ value: count() }).from(reviews).where(condition),
    ]);
    const total = Number(countResult[0]?.value ?? 0);
    return reply.send({ data: rows, total, page, limit, hasMore: offset + rows.length < total });
  });
}
