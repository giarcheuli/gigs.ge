import type { FastifyInstance } from 'fastify';
import { and, eq, desc } from 'drizzle-orm';
import { createGigSchema, updateGigSchema } from '@gigs/shared/schemas';
import { db } from '../../db/index.js';
import { gigs } from '../../db/schema/index.js';
import { requireAuth, requireEmailVerified } from '../../middleware/guards.js';
import { loadGigVisibilityContext, optionalGigViewer, presentGig } from '../../lib/gig-visibility.js';

const DEFAULT_GIG_EXPIRY_DAYS = 30;

type GigPricingInput = {
  priceType: 'fixed' | 'range' | 'negotiable';
  priceFixed?: string | null;
  priceRangeMin?: string | null;
  priceRangeMax?: string | null;
};

function validatePricing(pricing: GigPricingInput): string | null {
  // Range and negotiable prices return once negotiation is designed (spec feat-public-gig-board D7).
  if (pricing.priceType !== 'fixed') {
    return 'Only fixed-price gigs can be posted for now';
  }
  if (!pricing.priceFixed || pricing.priceRangeMin || pricing.priceRangeMax) {
    return 'Fixed price gigs require priceFixed and cannot include price ranges';
  }
  return null;
}

export async function gigsRoutes(app: FastifyInstance) {
  app.post('/', { preHandler: [requireEmailVerified] }, async (request, reply) => {
    const body = createGigSchema.parse(request.body);
    const pricingError = validatePricing(body);

    if (pricingError) {
      return reply.status(400).send({ error: pricingError, statusCode: 400 });
    }

    const [gig] = await db.insert(gigs).values({
      posterId: request.user.sub,
      title: body.title,
      shortDescription: body.shortDescription,
      longDescription: body.longDescription ?? null,
      regionId: body.regionId,
      cityId: body.cityId ?? null,
      streetAddress: body.streetAddress ?? null,
      priceType: body.priceType,
      priceFixed: body.priceFixed ?? null,
      priceRangeMin: body.priceRangeMin ?? null,
      priceRangeMax: body.priceRangeMax ?? null,
      availableFrom: body.availableFrom ? new Date(body.availableFrom) : null,
      availableTo: body.availableTo ? new Date(body.availableTo) : null,
      workersNeeded: body.workersNeeded ?? 1,
      visImages: body.visImages ?? 'verified',
      visAddress: body.visAddress ?? 'on_request',
      visContact: body.visContact ?? 'on_request',
      visDates: body.visDates ?? 'verified',
      status: 'draft',
      expiresAt: new Date(Date.now() + DEFAULT_GIG_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    }).returning();

    return reply.status(201).send({ gig });
  });

  app.patch('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = request.params as { id: string };
    const body = updateGigSchema.parse(request.body);

    const existingGig = await db.query.gigs.findFirst({
      where: eq(gigs.id, params.id),
    });

    if (!existingGig) {
      return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    }

    if (existingGig.posterId !== request.user.sub) {
      return reply.status(403).send({ error: 'You can only update your own gigs', statusCode: 403 });
    }

    if (existingGig.status !== 'draft') {
      return reply.status(409).send({ error: 'Only draft gigs can be updated', statusCode: 409 });
    }

    const pricingError = validatePricing({
      priceType: body.priceType ?? (existingGig.priceType as GigPricingInput['priceType']),
      priceFixed: body.priceFixed ?? existingGig.priceFixed,
      priceRangeMin: body.priceRangeMin ?? existingGig.priceRangeMin,
      priceRangeMax: body.priceRangeMax ?? existingGig.priceRangeMax,
    });

    if (pricingError) {
      return reply.status(400).send({ error: pricingError, statusCode: 400 });
    }

    const [gig] = await db.update(gigs).set({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.shortDescription !== undefined && { shortDescription: body.shortDescription }),
      ...(body.longDescription !== undefined && { longDescription: body.longDescription ?? null }),
      ...(body.regionId !== undefined && { regionId: body.regionId }),
      ...(body.cityId !== undefined && { cityId: body.cityId ?? null }),
      ...(body.streetAddress !== undefined && { streetAddress: body.streetAddress ?? null }),
      ...(body.priceType !== undefined && { priceType: body.priceType }),
      ...(body.priceFixed !== undefined && { priceFixed: body.priceFixed ?? null }),
      ...(body.priceRangeMin !== undefined && { priceRangeMin: body.priceRangeMin ?? null }),
      ...(body.priceRangeMax !== undefined && { priceRangeMax: body.priceRangeMax ?? null }),
      ...(body.availableFrom !== undefined && {
        availableFrom: body.availableFrom ? new Date(body.availableFrom) : null,
      }),
      ...(body.availableTo !== undefined && {
        availableTo: body.availableTo ? new Date(body.availableTo) : null,
      }),
      ...(body.workersNeeded !== undefined && { workersNeeded: body.workersNeeded }),
      ...(body.visImages !== undefined && { visImages: body.visImages }),
      ...(body.visAddress !== undefined && { visAddress: body.visAddress }),
      ...(body.visContact !== undefined && { visContact: body.visContact }),
      ...(body.visDates !== undefined && { visDates: body.visDates }),
      updatedAt: new Date(),
    }).where(eq(gigs.id, params.id)).returning();

    return reply.send({ gig });
  });

  app.post('/:id/publish', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = request.params as { id: string };

    const existingGig = await db.query.gigs.findFirst({
      where: eq(gigs.id, params.id),
    });

    if (!existingGig) {
      return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    }

    if (existingGig.posterId !== request.user.sub) {
      return reply.status(403).send({ error: 'You can only publish your own gigs', statusCode: 403 });
    }

    if (existingGig.status !== 'draft') {
      return reply.status(409).send({ error: 'Only draft gigs can be published', statusCode: 409 });
    }

    const [gig] = await db.update(gigs).set({
      status: 'active',
      updatedAt: new Date(),
    }).where(and(eq(gigs.id, params.id), eq(gigs.status, 'draft'))).returning();

    return reply.send({ gig });
  });

  app.get('/mine', { preHandler: [requireAuth] }, async (request, reply) => {
    const data = await db.query.gigs.findMany({
      where: eq(gigs.posterId, request.user.sub),
      orderBy: [desc(gigs.createdAt)],
    });

    return reply.send({ data });
  });

  app.get('/', async (request, reply) => {
    const data = await db.query.gigs.findMany({
      where: eq(gigs.status, 'active'),
      orderBy: [desc(gigs.createdAt)],
      with: { region: true, city: true },
    });

    const viewer = optionalGigViewer(request.headers.authorization);
    const visibility = await loadGigVisibilityContext(viewer, data.map((gig) => gig.id));
    return reply.send({ data: data.map((gig) => presentGig(gig, visibility)) });
  });

  app.get('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = request.params as { id: string };

    const gig = await db.query.gigs.findFirst({
      where: eq(gigs.id, params.id),
      with: { region: true, city: true },
    });

    if (!gig) {
      return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    }

    // Poster can see their own gig regardless of status.
    // All other viewers only see active gigs.
    const viewer = optionalGigViewer(request.headers.authorization);
    if (gig.status !== 'active') {
      if (viewer?.sub !== gig.posterId) {
        return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
      }
    }

    const visibility = await loadGigVisibilityContext(viewer, [gig.id]);
    return reply.send({ gig: presentGig(gig, visibility) });
  });
}
