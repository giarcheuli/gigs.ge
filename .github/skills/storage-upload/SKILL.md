---
name: storage-upload
description: "Cloudflare R2 file storage and image upload for gigs.ge. Use when: uploading gig images, avatars, application attachments, dispute evidence, or invoice PDFs. Also covers EXIF stripping and MIME validation."
---

# File Storage & Uploads

## Provider
- **Service**: Cloudflare R2 (S3-compatible)
- **Dev URL**: `https://pub-0c6dbe3e21874201898c30cb6545b81f.r2.dev`
- **SDK**: `@aws-sdk/client-s3`

## Storage Layout (Key Prefixes)
```
gigs/{gigId}/images/{imageId}.{ext}
users/{userId}/avatar.{ext}
applications/{appId}/attachments/{attachId}.{ext}
disputes/{dealId}/{userId}/{evidenceId}.{ext}
invoices/{userId}/{year}-{month}.pdf
```

## Upload Flow
1. Client sends file via multipart form to API
2. API validates:
   - MIME type against allowlist (`image/jpeg`, `image/png`, `application/pdf`)
   - Magic bytes (first few bytes of file) match declared MIME
   - File size within limits
3. API strips EXIF metadata (for images) using `sharp`
4. API uploads to R2 with the structured key prefix
5. API stores the public URL in the database record

## Size Limits
| Context | Max Files | Max Size Each |
|---------|-----------|---------------|
| Gig images | 10 | 10 MB |
| Application attachments | 5 | 10 MB |
| Dispute evidence | 10 | 10 MB |
| Avatar | 1 | 5 MB |

## Environment Variables
```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=gigs-ge-dev
R2_PUBLIC_URL=https://pub-0c6dbe3e21874201898c30cb6545b81f.r2.dev
```

## Security
- Never serve uploads from the app server filesystem
- All URLs are public-read via R2 public access (no signed URLs needed for v1)
- Validate server-side; never trust client-reported MIME types alone
