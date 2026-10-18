import { createAuthEmailSender, type AuthEmailClient } from '../lib/auth-email.js';

describe('auth email sender', () => {
  it('sends a verification code as text and HTML from the configured sender', async () => {
    const send = jest.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const client = { emails: { send } } as AuthEmailClient;
    const sender = createAuthEmailSender(client, 'noreply@gigs.ge');

    await expect(sender.sendVerificationEmail('worker@example.com', '123456'))
      .resolves.toEqual({ accepted: true, messageId: 'email-1' });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: 'noreply@gigs.ge',
      to: 'worker@example.com',
      subject: 'Verify your gigs.ge email',
      text: expect.stringContaining('123456'),
      html: expect.stringContaining('<strong>123456</strong>'),
    }));
  });

  it('sends reset links as escaped HTML and plain text', async () => {
    const send = jest.fn().mockResolvedValue({ data: { id: 'email-2' }, error: null });
    const sender = createAuthEmailSender({ emails: { send } } as AuthEmailClient, 'noreply@gigs.ge');
    const resetUrl = 'https://dev.gigs.ge/reset-password#token=abc123';

    await expect(sender.sendPasswordResetEmail('worker@example.com', resetUrl))
      .resolves.toEqual({ accepted: true, messageId: 'email-2' });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Reset your gigs.ge password',
      text: expect.stringContaining(resetUrl),
      html: expect.stringContaining(`href="${resetUrl}"`),
    }));
  });

  it('returns a safe failure when the provider reports an error or is not configured', async () => {
    const send = jest.fn().mockResolvedValue({ data: null, error: new Error('provider detail') });
    const sender = createAuthEmailSender({ emails: { send } } as AuthEmailClient, 'noreply@gigs.ge');
    const unconfiguredSender = createAuthEmailSender(null, 'noreply@gigs.ge');

    await expect(sender.sendVerificationEmail('worker@example.com', '123456'))
      .resolves.toEqual({ accepted: false, reason: 'provider_error' });
    await expect(unconfiguredSender.sendVerificationEmail('worker@example.com', '123456'))
      .resolves.toEqual({ accepted: false, reason: 'not_configured' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});