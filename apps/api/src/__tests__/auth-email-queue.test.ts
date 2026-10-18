import {
  createAuthEmailTaskQueue,
  decryptAuthEmailTaskEnvelope,
} from '../lib/auth-email-queue.js';
import type { CloudTasksClient } from '@google-cloud/tasks';

describe('auth email task queue', () => {
  const config = {
    projectId: 'gigsge-test',
    location: 'us-central1',
    queueName: 'auth-email-test',
    targetUrl: 'https://api.example.test/api/v1/auth/internal/email-delivery',
    signingSecret: 'test-signing-secret',
  };

  it('enqueues a signed task with a stable delivery id', async () => {
    const createTask = jest.fn().mockResolvedValue([{}]);
    const client = {
      queuePath: jest.fn().mockReturnValue('projects/gigsge-test/locations/us-central1/queues/auth-email-test'),
      createTask,
    } as unknown as CloudTasksClient;
    const queue = createAuthEmailTaskQueue(client, config);

    const result = await queue.enqueue({
      type: 'verification',
      userId: '11111111-1111-1111-1111-111111111111',
      credential: '123456',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(result.queued).toBe(true);
    if (!result.queued) return;
    const request = createTask.mock.calls[0][0];
    const envelope = JSON.parse(Buffer.from(request.task.httpRequest.body).toString()) as Record<string, unknown>;
    expect(request.parent).toBe('projects/gigsge-test/locations/us-central1/queues/auth-email-test');
    expect(JSON.stringify(envelope)).not.toContain('123456');
    expect(envelope).toMatchObject({ deliveryId: result.deliveryId });
    expect(decryptAuthEmailTaskEnvelope(
      envelope,
      request.task.httpRequest.headers['X-Gigs-Auth-Email-Signature'],
      config.signingSecret,
    )).toMatchObject({
      deliveryId: result.deliveryId,
      task: { type: 'verification', credential: '123456' },
    });
    expect(decryptAuthEmailTaskEnvelope(
      { ...envelope, ciphertext: `${envelope.ciphertext}a` },
      request.task.httpRequest.headers['X-Gigs-Auth-Email-Signature'],
      config.signingSecret,
    )).toBeNull();
  });

  it('returns a safe result when no queue is configured or enqueue fails', async () => {
    const createTask = jest.fn().mockRejectedValue(new Error('internal project details'));
    const client = { queuePath: jest.fn(), createTask } as unknown as CloudTasksClient;
    const configuredQueue = createAuthEmailTaskQueue(client, config);
    const missingQueue = createAuthEmailTaskQueue(client, { ...config, queueName: '' });

    await expect(configuredQueue.enqueue({ type: 'noop' }))
      .resolves.toEqual({ queued: false, reason: 'queue_error' });
    await expect(missingQueue.enqueue({ type: 'noop' }))
      .resolves.toEqual({ queued: false, reason: 'not_configured' });
  });
});