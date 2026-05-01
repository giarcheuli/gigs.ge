import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { createGigSchema, updateGigSchema } from '@gigs/shared/schemas';
import { db } from '../../db/index.js';
import { gigs } from '../../db/schema/index.js';
import { requireAuth, requireVerified } from '../../middleware/guards.js';

const DEFAULT_GIG_EXPIRY_DAYS = 30;

type GigPricingInput = {
  priceType: 'fixed' | 'range' | 'negotiable';
  priceFixed?: string | null;
  priceRangeMin?: string | null;
  priceRangeMax?: string | null;
};

function validatePricing(pricing: GigPricingInput): string | null {
  if (pricing.priceType === 'fixed') {
    if (!pricing.priceFixed || pricing.priceRangeMin || pricing.priceRangeMax) {
      return 'Fixed price gigs require priceFixed and cannot include price ranges';
    }
    return null;
  }

  if (pricing.priceType === 'range') {
    if (!pricing.priceRangeMin || !pricing.priceRangeMax || pricing.priceFixed) {
      return 'Range price gigs require priceRangeMin and priceRangeMax and cannot include priceFixed';
    }

    if (Number(pricing.priceRangeMin) > Number(pricing.priceRangeMax)) {
      return 'priceRangeMin must be less than or equal to priceRangeMax';
    }

    return null;
  }

  if (pricing.priceFixed || pricing.priceRangeMin || pricing.priceRangeMax) {
    return 'Negotiable gigs cannot include fixed or range prices';
  }

  return null;
}

export async function gigsRoutes(app: FastifyInstance) {
  app.post('/', { preHandler: [requireVerified] }, async (request, reply) => {
    const body = createGigSchema.parse(request.body);
    const pricingError = validatePricing(body);

    if (pricingError) {
      return reply.status(400).send({ error: pricingError, statusCode: 400 });
    }

    const [gig] = await db.insert(gigs).values({
      posterId: request.user.sub,
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
      visImages: body.visImages ?? 'verified',
      visPrice: body.visPrice ?? 'public',
      visCity: body.visCity ?? 'verified',
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
      ...(body.visImages !== undefined && { visImages: body.visImages }),
      ...(body.visPrice !== undefined && { visPrice: body.visPrice }),
      ...(body.visCity !== undefined && { visCity: body.visCity }),
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

  app.get('/', async (_request, reply) => {
    const data = await db.query.gigs.findMany({
      where: eq(gigs.status, 'active'),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    return reply.send({ data });
  });

  app.get('/:id', async (request, reply) => {
    const params = request.params as { id: string };

    const gig = await db.query.gigs.findFirst({
      where: and(eq(gigs.id, params.id), eq(gigs.status, 'active')),
    });

    if (!gig) {
      return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    }

    return reply.send({ gig });
  });
}
