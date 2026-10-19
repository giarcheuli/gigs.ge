import { Storage } from '@google-cloud/storage';
import { env } from '../config/env.js';

// Cloud Run authenticates as the environment's runtime service account, so no keys are needed.
let storage: Storage | null = null;
const bucket = () => (storage ??= new Storage()).bucket(env.MEDIA_BUCKET);

export function mediaStorageConfigured(): boolean {
  return Boolean(env.MEDIA_BUCKET);
}

export async function putMediaObject(objectName: string, data: Buffer, contentType: string): Promise<string> {
  await bucket().file(objectName).save(data, {
    resumable: false,
    contentType,
    metadata: { cacheControl: 'public, max-age=31536000, immutable' },
  });
  return `https://storage.googleapis.com/${env.MEDIA_BUCKET}/${objectName}`;
}

export async function deleteMediaObjects(objectNames: string[]): Promise<void> {
  await Promise.all(objectNames.map((name) => bucket().file(name).delete({ ignoreNotFound: true })));
}
