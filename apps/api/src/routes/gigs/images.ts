import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { MAX_GIG_IMAGES } from '@gigs/shared/constants';
import { db } from '../../db/index.js';
import { gigImages, gigs } from '../../db/schema/index.js';
import { requireAuth } from '../../middleware/guards.js';
import { gigImageObjectNames, processGigImage } from '../../lib/gig-images.js';
import { deleteMediaObjects, mediaStorageConfigured, putMediaObject } from '../../lib/media-storage.js';

const gigParamsSchema = z.object({ id: z.string().uuid() });
const imageParamsSchema = z.object({ id: z.string().uuid(), imageId: z.string().uuid() });
const UPLOADABLE_GIG_STATUSES = new Set(['draft', 'active']);

export async function gigImagesRoutes(app: FastifyInstance) {
  app.post('/:id/images', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = gigParamsSchema.parse(request.params);

    if (!mediaStorageConfigured()) {
      return reply.status(503).send({
        error: 'Photo uploads are not available right now',
        code: 'MEDIA_STORAGE_UNAVAILABLE',
        statusCode: 503,
      });
    }

    const gig = await db.query.gigs.findFirst({ where: eq(gigs.id, params.id) });
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.posterId !== request.user.sub) {
      return reply.status(403).send({ error: 'You can only add photos to your own gig', statusCode: 403 });
    }
    if (!UPLOADABLE_GIG_STATUSES.has(gig.status)) {
      return reply.status(409).send({ error: 'Photos can only be changed on draft or active gigs', statusCode: 409 });
    }

    const file = await request.file();
    if (!file) return reply.status(400).send({ error: 'No file uploaded', statusCode: 400 });

    let input: Buffer;
    try {
      input = await file.toBuffer();
    } catch (error) {
      if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.status(413).send({ error: 'Photos must be 10 MB or smaller', code: 'IMAGE_TOO_LARGE', statusCode: 413 });
      }
      throw error;
    }

    const processed = await processGigImage(input);
    if (!processed) {
      return reply.status(400).send({ error: 'Upload a JPEG, PNG, or WebP image', code: 'UNSUPPORTED_IMAGE', statusCode: 400 });
    }

    const storageKey = `gigs/${gig.id}/images/${randomUUID()}`;
    const [fullName, thumbName] = gigImageObjectNames(storageKey);
    const [url, thumbUrl] = await Promise.all([
      putMediaObject(fullName, processed.full, 'image/webp'),
      putMediaObject(thumbName, processed.thumb, 'image/webp'),
    ]);

    // Lock the gig row so two parallel uploads cannot both pass the photo limit.
    const image = await db.transaction(async (tx) => {
      await tx.select({ id: gigs.id }).from(gigs).where(eq(gigs.id, gig.id)).for('update');
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` })
        .from(gigImages)
        .where(eq(gigImages.gigId, gig.id));
      if (count >= MAX_GIG_IMAGES) return null;

      const [created] = await tx.insert(gigImages).values({
        gigId: gig.id,
        url,
        thumbUrl,
        storageKey,
        isPreview: count === 0,
        sortOrder: count,
      }).returning();
      return created;
    });

    if (!image) {
      await deleteMediaObjects([fullName, thumbName]);
      return reply.status(409).send({
        error: `A gig can have at most ${MAX_GIG_IMAGES} photos`,
        code: 'IMAGE_LIMIT_REACHED',
        statusCode: 409,
      });
    }

    return reply.status(201).send({
      image: { id: image.id, url: image.url, thumbUrl: image.thumbUrl, isPreview: image.isPreview },
    });
  });

  app.delete('/:id/images/:imageId', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = imageParamsSchema.parse(request.params);

    const gig = await db.query.gigs.findFirst({ where: eq(gigs.id, params.id) });
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.posterId !== request.user.sub) {
      return reply.status(403).send({ error: 'You can only remove photos from your own gig', statusCode: 403 });
    }

    const image = await db.query.gigImages.findFirst({
      where: and(eq(gigImages.id, params.imageId), eq(gigImages.gigId, gig.id)),
    });
    if (!image) return reply.status(404).send({ error: 'Photo not found', statusCode: 404 });

    await db.transaction(async (tx) => {
      await tx.delete(gigImages).where(eq(gigImages.id, image.id));
      if (image.isPreview) {
        const [next] = await tx.select({ id: gigImages.id })
          .from(gigImages)
          .where(eq(gigImages.gigId, gig.id))
          .orderBy(asc(gigImages.sortOrder))
          .limit(1);
        if (next) await tx.update(gigImages).set({ isPreview: true }).where(eq(gigImages.id, next.id));
      }
    });

    if (image.storageKey) await deleteMediaObjects(gigImageObjectNames(image.storageKey));
    return reply.status(204).send();
  });

  app.post('/:id/images/:imageId/cover', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = imageParamsSchema.parse(request.params);

    const gig = await db.query.gigs.findFirst({ where: eq(gigs.id, params.id) });
    if (!gig) return reply.status(404).send({ error: 'Gig not found', statusCode: 404 });
    if (gig.posterId !== request.user.sub) {
      return reply.status(403).send({ error: 'You can only change photos on your own gig', statusCode: 403 });
    }

    const image = await db.query.gigImages.findFirst({
      where: and(eq(gigImages.id, params.imageId), eq(gigImages.gigId, gig.id)),
    });
    if (!image) return reply.status(404).send({ error: 'Photo not found', statusCode: 404 });

    await db.transaction(async (tx) => {
      await tx.update(gigImages).set({ isPreview: false }).where(eq(gigImages.gigId, gig.id));
      await tx.update(gigImages).set({ isPreview: true }).where(eq(gigImages.id, image.id));
    });

    return reply.send({ image: { id: image.id, url: image.url, thumbUrl: image.thumbUrl, isPreview: true } });
  });
}
