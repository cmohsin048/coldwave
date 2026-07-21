import nodemailer, { type Transporter } from "nodemailer";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * System (transactional) mail — password resets, receipts — sent through the
 * SYSTEM_SMTP_* mailbox, NOT through org sending mailboxes (those are for
 * campaigns and are rate-limited/warmed).
 */

let transport: Transporter | null = null;

export function isSystemMailConfigured(): boolean {
  const env = getEnv();
  return !!(env.SYSTEM_SMTP_HOST && env.SYSTEM_SMTP_USER);
}

function getTransport(): Transporter {
  if (transport) return transport;
  const env = getEnv();
  transport = nodemailer.createTransport({
    host: env.SYSTEM_SMTP_HOST,
    port: env.SYSTEM_SMTP_PORT,
    secure: env.SYSTEM_SMTP_PORT === 465,
    auth: { user: env.SYSTEM_SMTP_USER, pass: env.SYSTEM_SMTP_PASS },
  });
  return transport;
}

/** Send a system email. Returns false (never throws) when not configured or on failure. */
export async function sendSystemEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  if (!isSystemMailConfigured()) {
    logger.warn("system mail not configured — email not sent", {
      subject: params.subject,
    });
    return false;
  }
  try {
    await getTransport().sendMail({
      from: getEnv().SYSTEM_MAIL_FROM,
      to: params.to,
      subject: params.subject,
      text: params.text,
    });
    return true;
  } catch (err) {
    logger.error("system mail send failed", {
      subject: params.subject,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
