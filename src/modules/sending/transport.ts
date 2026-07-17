import nodemailer, { type Transporter } from "nodemailer";
import type { Mailbox } from "@/db/schema";
import { openSecrets } from "@/modules/mailboxes/credentials";
import { withRetry } from "@/lib/retry";

/**
 * Build a nodemailer transport for a connected mailbox using its decrypted
 * SMTP credentials. Transports are cached per mailbox to reuse pooled
 * connections.
 */

const cache = new Map<string, Transporter>();

export function getTransport(mailbox: Mailbox): Transporter {
  const cached = cache.get(mailbox.id);
  if (cached) return cached;

  if (!mailbox.smtpHost || !mailbox.encryptedCredentials) {
    throw new Error(`Mailbox ${mailbox.email} is missing SMTP configuration`);
  }
  const secrets = openSecrets(mailbox.encryptedCredentials);

  const transport = nodemailer.createTransport({
    host: mailbox.smtpHost,
    port: mailbox.smtpPort ?? 587,
    secure: mailbox.smtpSecure ?? false, // true for 465, false for 587 (STARTTLS)
    auth: secrets.oauth
      ? {
          type: "OAuth2",
          user: mailbox.email,
          accessToken: secrets.oauth.accessToken,
          refreshToken: secrets.oauth.refreshToken,
        }
      : {
          user: mailbox.email,
          pass: secrets.smtpPass,
        },
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
  });

  cache.set(mailbox.id, transport);
  return transport;
}

export interface SendArgs {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}

export interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

/** Send one email through a mailbox transport, with retry on transient errors. */
export async function sendViaMailbox(
  mailbox: Mailbox,
  args: SendArgs
): Promise<SendResult> {
  const transport = getTransport(mailbox);
  return withRetry(
    async () => {
      const info = await transport.sendMail({
        from: `${mailbox.fromName ?? ""} <${args.from}>`.trim(),
        to: args.to,
        subject: args.subject,
        text: args.text,
        html: args.html,
        headers: args.headers,
        messageId: args.messageId,
        inReplyTo: args.inReplyTo,
        references: args.references,
      });
      return {
        messageId: info.messageId,
        accepted: (info.accepted as string[]) ?? [],
        rejected: (info.rejected as string[]) ?? [],
      };
    },
    {
      label: `smtp:${mailbox.email}`,
      retries: 3,
      isRetryable: (err) => {
        // Retry on connection/greeting/timeout errors, not on hard 5xx rejects.
        const code = (err as { code?: string }).code;
        const respCode = (err as { responseCode?: number }).responseCode;
        if (respCode && respCode >= 500 && respCode < 600) return false;
        return (
          code === "ETIMEDOUT" ||
          code === "ECONNRESET" ||
          code === "ESOCKET" ||
          code === "ECONNECTION" ||
          code === "EDNS"
        );
      },
    }
  );
}

/** Verify a mailbox's SMTP credentials/connection (used on connect). */
export async function verifyMailboxConnection(
  mailbox: Mailbox
): Promise<{ ok: boolean; error?: string }> {
  try {
    const transport = getTransport(mailbox);
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Drop a cached transport (e.g. after credential rotation). */
export function invalidateTransport(mailboxId: string) {
  cache.get(mailboxId)?.close();
  cache.delete(mailboxId);
}
