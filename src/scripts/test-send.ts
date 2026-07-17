import "dotenv/config";
import nodemailer from "nodemailer";
import { getEnv } from "@/lib/env";
import { buildFooter } from "@/modules/compliance/footer";
import { buildUnsubscribeHeaders } from "@/modules/compliance/unsubscribe";

/**
 * One-shot live send through the configured SYSTEM_SMTP mailbox, with the
 * CAN-SPAM footer + RFC 8058 unsubscribe headers attached — a real end-to-end
 * proof that sending works. Recipient defaults to the from address.
 */
async function main() {
  const env = getEnv();
  const to = process.argv[2] || "project@kakushin.io";
  const fromMatch = env.SYSTEM_MAIL_FROM.match(/<([^>]+)>/);
  const from = fromMatch?.[1] ?? env.SYSTEM_MAIL_FROM;

  if (!env.SYSTEM_SMTP_HOST || !env.SYSTEM_SMTP_USER) {
    throw new Error("SYSTEM_SMTP_* not configured in .env");
  }

  const transport = nodemailer.createTransport({
    host: env.SYSTEM_SMTP_HOST,
    port: env.SYSTEM_SMTP_PORT,
    secure: env.SYSTEM_SMTP_PORT === 465,
    auth: { user: env.SYSTEM_SMTP_USER, pass: env.SYSTEM_SMTP_PASS },
  });

  console.log(`Verifying SMTP connection to ${env.SYSTEM_SMTP_HOST}:${env.SYSTEM_SMTP_PORT} ...`);
  await transport.verify();
  console.log("SMTP connection OK.");

  const unsub = { orgId: "test-org", email: to };
  const footer = buildFooter({
    companyName: env.COMPANY_NAME,
    companyAddress: env.COMPANY_ADDRESS,
    unsub,
  });
  const headers = buildUnsubscribeHeaders(unsub);

  const text = `Hi there,

This is a live test from ColdWave's sending pipeline. If you're reading this in an inbox, SMTP delivery, the CAN-SPAM footer, and the one-click unsubscribe header all work.

— The ColdWave test${footer}`;

  console.log(`Sending test email to ${to} ...`);
  const info = await transport.sendMail({
    from: env.SYSTEM_MAIL_FROM,
    to,
    subject: "ColdWave live send test",
    text,
    headers,
  });

  console.log("\n✅ SENT");
  console.log("  messageId:", info.messageId);
  console.log("  accepted :", info.accepted);
  console.log("  rejected :", info.rejected);
  console.log("  response :", info.response);
  console.log("\nList-Unsubscribe header attached:");
  console.log("  ", headers["List-Unsubscribe"]);
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ SEND FAILED:", err.message);
  process.exit(1);
});
