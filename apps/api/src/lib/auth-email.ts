import { Resend } from 'resend';
import { env } from '../config/env.js';

type AuthEmailOptions = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type AuthEmailClient = {
  emails: {
    send(options: AuthEmailOptions, requestOptions?: { idempotencyKey?: string }): Promise<{
      data: { id: string } | null;
      error: unknown | null;
    }>;
  };
};

export type AuthEmailResult =
  | { accepted: true; messageId: string }
  | { accepted: false; reason: 'not_configured' | 'provider_error' };

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export function createAuthEmailSender(client: AuthEmailClient | null, from: string) {
  async function send(
    options: Omit<AuthEmailOptions, 'from'>,
    idempotencyKey?: string,
  ): Promise<AuthEmailResult> {
    if (!client) return { accepted: false, reason: 'not_configured' };

    try {
      const { data, error } = await client.emails.send(
        { ...options, from },
        idempotencyKey ? { idempotencyKey } : undefined,
      );
      if (error || !data?.id) return { accepted: false, reason: 'provider_error' };
      return { accepted: true, messageId: data.id };
    } catch {
      return { accepted: false, reason: 'provider_error' };
    }
  }

  return {
    sendVerificationEmail(to: string, code: string, idempotencyKey?: string) {
      return send({
        to,
        subject: 'Verify your gigs.ge email',
        text: `Your gigs.ge verification code is ${code}. It expires in 15 minutes. If you did not create this account, you can ignore this email.`,
        html: `<p>Your gigs.ge verification code is <strong>${escapeHtml(code)}</strong>.</p><p>It expires in 15 minutes. If you did not create this account, you can ignore this email.</p>`,
      }, idempotencyKey);
    },
    sendPasswordResetEmail(to: string, resetUrl: string, idempotencyKey?: string) {
      const safeUrl = escapeHtml(resetUrl);
      return send({
        to,
        subject: 'Reset your gigs.ge password',
        text: `Use this link to reset your gigs.ge password. It expires in 15 minutes. If you did not request a reset, you can ignore this email.\n\n${resetUrl}`,
        html: `<p>Use the link below to reset your gigs.ge password. It expires in 15 minutes.</p><p><a href="${safeUrl}">Reset password</a></p><p>If you did not request a reset, you can ignore this email.</p>`,
      }, idempotencyKey);
    },
  };
}

const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
const authEmailSender = createAuthEmailSender(resendClient, env.EMAIL_FROM);

export const sendVerificationEmail = authEmailSender.sendVerificationEmail;
export const sendPasswordResetEmail = authEmailSender.sendPasswordResetEmail;