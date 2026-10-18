import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { CloudTasksClient } from '@google-cloud/tasks';
import { z } from 'zod';
import { env } from '../config/env.js';

export const authEmailTaskSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('verification'),
    userId: z.string().uuid(),
    credential: z.string().regex(/^\d{6}$/),
    expiresAt: z.string().datetime(),
  }).strict(),
  z.object({
    type: z.literal('password_reset'),
    userId: z.string().uuid(),
    credential: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.string().datetime(),
  }).strict(),
  z.object({ type: z.literal('noop') }).strict(),
]);

export type AuthEmailTask = z.infer<typeof authEmailTaskSchema>;
export type AuthEmailTaskEnvelope = {
  deliveryId: string;
  iv: string;
  ciphertext: string;
  authTag: string;
};
export type AuthEmailTaskInput = AuthEmailTask;

const authEmailTaskEnvelopeSchema = z.object({
  deliveryId: z.string().uuid(),
  iv: z.string().regex(/^[A-Za-z0-9_-]+$/),
  ciphertext: z.string().regex(/^[A-Za-z0-9_-]+$/),
  authTag: z.string().regex(/^[A-Za-z0-9_-]+$/),
}).strict();

type TaskClient = Pick<CloudTasksClient, 'queuePath' | 'createTask'>;

export type AuthEmailTaskQueueResult =
  | { queued: true; deliveryId: string }
  | { queued: false; reason: 'not_configured' | 'queue_error' };

const canonicalJson = (value: Record<string, string>) => JSON.stringify(
  Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))),
);

const deriveKey = (secret: string, purpose: 'encryption' | 'signing') => createHmac('sha256', secret)
  .update(`gigs.ge/auth-email/${purpose}/v1`)
  .digest();

export function createAuthEmailTaskEnvelope(
  input: AuthEmailTaskInput,
  signingSecret: string,
  deliveryId = randomUUID(),
): AuthEmailTaskEnvelope {
  const task = authEmailTaskSchema.parse(input);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(signingSecret, 'encryption'), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(task), 'utf8'),
    cipher.final(),
  ]);

  return {
    deliveryId,
    iv: iv.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
  };
}

export function signAuthEmailTaskEnvelope(envelope: AuthEmailTaskEnvelope, signingSecret: string): string {
  return createHmac('sha256', deriveKey(signingSecret, 'signing')).update(canonicalJson(envelope)).digest('hex');
}

export function decryptAuthEmailTaskEnvelope(
  value: unknown,
  signature: string,
  signingSecret: string,
): { deliveryId: string; task: AuthEmailTask } | null {
  const parsedEnvelope = authEmailTaskEnvelopeSchema.safeParse(value);
  if (!parsedEnvelope.success || !/^[a-f0-9]{64}$/.test(signature)) return null;

  const envelope = parsedEnvelope.data;
  const expected = Buffer.from(signAuthEmailTaskEnvelope(envelope, signingSecret), 'hex');
  const received = Buffer.from(signature, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(signingSecret, 'encryption'), Buffer.from(envelope.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const parsedTask = authEmailTaskSchema.safeParse(JSON.parse(plaintext));
    return parsedTask.success ? { deliveryId: envelope.deliveryId, task: parsedTask.data } : null;
  } catch {
    return null;
  }
}

export function createAuthEmailTaskQueue(
  client: TaskClient,
  config: {
    projectId: string;
    location: string;
    queueName: string;
    targetUrl: string;
    signingSecret: string;
  },
) {
  return {
    async enqueue(input: AuthEmailTaskInput): Promise<AuthEmailTaskQueueResult> {
      if (!config.projectId || !config.location || !config.queueName || !config.targetUrl || !config.signingSecret) {
        return { queued: false, reason: 'not_configured' };
      }

      const deliveryId = randomUUID();
      const envelope = createAuthEmailTaskEnvelope(input, config.signingSecret, deliveryId);
      const body = JSON.stringify(envelope);
      const signature = signAuthEmailTaskEnvelope(envelope, config.signingSecret);

      try {
        await client.createTask({
          parent: client.queuePath(config.projectId, config.location, config.queueName),
          task: {
            dispatchDeadline: { seconds: 30 },
            httpRequest: {
              httpMethod: 'POST',
              url: config.targetUrl,
              headers: {
                'Content-Type': 'application/json',
                'X-Gigs-Auth-Email-Signature': signature,
              },
              body: Buffer.from(body),
            },
          },
        });
        return { queued: true, deliveryId };
      } catch {
        return { queued: false, reason: 'queue_error' };
      }
    },
  };
}

const taskClient = new CloudTasksClient();
const taskQueue = createAuthEmailTaskQueue(taskClient, {
  projectId: env.GCP_PROJECT_ID,
  location: env.AUTH_EMAIL_TASK_LOCATION,
  queueName: env.AUTH_EMAIL_TASK_QUEUE,
  targetUrl: env.AUTH_EMAIL_TASK_TARGET_URL,
  signingSecret: env.JWT_ACCESS_SECRET,
});

export const enqueueAuthEmailTask = taskQueue.enqueue;