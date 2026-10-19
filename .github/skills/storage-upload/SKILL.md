---
name: storage-upload
description: "Google Cloud Storage file storage and image upload for gigs.ge. Use when: uploading gig images, avatars, application attachments, dispute evidence, or invoice PDFs. Also covers EXIF stripping and MIME validation."
---

# File Storage & Uploads

## Provider
- **Service**: Google Cloud Storage (same GCP project `gigsge` as everything else, so no extra account or keys)
- **Buckets**: `gigsge-dev-media` (dev.gigs.ge), `gigsge-uat-media` (uat.gigs.ge). Public read, uniform access.
- **Access**: each environment's API runtime service account has `roles/storage.objectAdmin` on its own bucket only
- **SDK**: `@google-cloud/storage` with application default credentials, wrapped in `apps/api/src/lib/media-storage.ts`
- **Public URL**: `https://storage.googleapis.com/{bucket}/{objectName}`
- **Spec**: `docs/specs/feat-gig-photos.md`

## Storage Layout (Key Prefixes)
```
gigs/{gigId}/images/{uuid}.webp         # full size, max 1600px
gigs/{gigId}/images/{uuid}-thumb.webp   # 600x600 cover crop
users/{userId}/avatar.{ext}
applications/{appId}/attachments/{attachId}.{ext}
disputes/{dealId}/{userId}/{evidenceId}.{ext}
invoices/{userId}/{year}-{month}.pdf
```

The `gig_images.storage_key` column holds the prefix without extension so both objects can be deleted.

## Upload Flow (gig photos, implemented)
1. Client sends one file per request as multipart (`POST /api/v1/gigs/:id/images`, field `file`)
2. `@fastify/multipart` enforces the size limit (413 above it)
3. `sharp` decodes the bytes: anything that is not a real JPEG, PNG, or WebP is rejected (400), whatever MIME the client claimed
4. `sharp` applies EXIF rotation, resizes, and re-encodes to WebP. Output carries no metadata (GPS, camera, etc.) because `withMetadata()` is never called
5. API uploads both objects, then inserts the row inside a transaction that locks the gig and re-checks the photo limit
6. If the limit check fails, the just-uploaded objects are deleted

Reuse `processGigImage()` from `apps/api/src/lib/gig-images.ts` as the template for avatars and evidence.

## Size Limits
| Context | Max Files | Max Size Each |
|---------|-----------|---------------|
| Gig images | 10 (`MAX_GIG_IMAGES`) | 10 MB (`MAX_FILE_SIZE_BYTES`) |
| Application attachments | 5 | 10 MB |
| Dispute evidence | 10 | 10 MB |
| Avatar | 1 | 5 MB |

## Environment Variables
```env
MEDIA_BUCKET=gigsge-dev-media   # empty = uploads answer 503 (local dev default)
```
Cloud Build passes it from the trigger substitution `_MEDIA_BUCKET`.

## Testing
Mock `../lib/media-storage.js` in Jest. Assert on the buffers passed to `putMediaObject` (for example with `sharp(buffer).metadata()`) rather than calling Cloud Storage.

## Security
- Never serve uploads from the app server filesystem
- Gig photos are public-read by URL (unguessable UUID names). Private files such as dispute evidence and invoices must go to a separate non-public bucket with signed URLs
- Validate server-side by decoding the content; never trust client-reported MIME types
