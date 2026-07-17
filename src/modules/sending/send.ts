import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  messages,
  messageEvents,
  mailboxes,
  leads,
  organizations,
  sendingDomains,
  type Mailbox,
  type Lead,
} from "@/db/schema";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { render } from "@/modules/spintax";
import { runSpamCheck } from "@/modules/spam/engine";
import { buildUnsubscribeHeaders } from "@/modules/compliance/unsubscribe";
import { ensureFooter } from "@/modules/compliance/footer";
import { isSuppressed, addSuppression } from "./suppression";
import { sendViaMailbox } from "./transport";
import { consumeRateLimit } from "./rate-limiter";
import { injectTracking } from "./tracking";
import { recordUsage } from "@/modules/billing/usage";
import {
  bumpVariantCounter,
  maybeSelectWinner,
} from "@/modules/campaigns/variants";
import { emailDomain, normalizeEmail } from "@/lib/utils";

export interface SendStepArgs {
  orgId: string;
  campaignId: string;
  stepId: string;
  /** A/B variant being sent, when the step has variants. */
  variantId?: string | null;
  enrollmentId: string;
  leadId: string;
  mailbox: Mailbox;
  subjectTemplate: string;
  bodyTemplate: string;
  trackOpens: boolean;
  trackClicks: boolean;
}

export type SendOutcome =
  | { status: "sent"; messageId: string }
  | { status: "skipped"; reason: string }
  | { status: "blocked"; reason: string; spamScore: number }
  | { status: "failed"; error: string };

/**
 * Compose, compliance-gate, spam-gate, and send a single sequence-step email.
 * This is the unit the campaign worker invokes for each due enrollment.
 */
export async function sendSequenceStep(
  args: SendStepArgs
): Promise<SendOutcome> {
  const env = getEnv();

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, args.leadId),
  });
  if (!lead?.email) return { status: "skipped", reason: "lead has no email" };

  // Compliance: never send to a suppressed / unsubscribed address.
  if (await isSuppressed(args.orgId, lead.email, args.campaignId)) {
    return { status: "skipped", reason: "suppressed" };
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, args.orgId),
  });

  // Render subject/body (merge fields + spintax) with a per-recipient seed.
  const ctx = mergeContext(lead);
  const seed = `${lead.id}:${args.stepId}`;
  const subject = render(args.subjectTemplate, ctx, seed);
  let text = render(args.bodyTemplate, ctx, seed);

  // CAN-SPAM footer (physical address + unsubscribe).
  const unsub = {
    orgId: args.orgId,
    email: normalizeEmail(lead.email),
    campaignId: args.campaignId,
  };
  text = ensureFooter(text, {
    companyName: org?.name ?? env.COMPANY_NAME,
    companyAddress: org?.companyAddress ?? env.COMPANY_ADDRESS,
    unsub,
  });

  // Domain for spam DNS checks.
  const domain = emailDomain(args.mailbox.email);

  // Pre-send spam gate.
  const spam = await runSpamCheck(
    { subject, body: text, fromEmail: args.mailbox.email, toEmail: lead.email, domain, contentOnly: false },
    env.SPAM_SCORE_BLOCK_THRESHOLD
  );

  // Create the message row first so tracking tokens can reference it.
  const [message] = await db
    .insert(messages)
    .values({
      orgId: args.orgId,
      direction: "outbound",
      status: spam.passed ? "queued" : "failed",
      campaignId: args.campaignId,
      stepId: args.stepId,
      variantId: args.variantId ?? null,
      enrollmentId: args.enrollmentId,
      leadId: args.leadId,
      mailboxId: args.mailbox.id,
      fromEmail: args.mailbox.email,
      toEmail: lead.email,
      subject,
      body: text,
      spamScore: spam.score,
      spamReport: spam.breakdown as Record<string, unknown>,
    })
    .returning();

  if (!spam.passed) {
    return { status: "blocked", reason: "spam score above threshold", spamScore: spam.score };
  }

  // Build HTML + inject tracking pixel / link wrapping.
  const html = await injectTracking({
    orgId: args.orgId,
    messageId: message!.id,
    html: textToHtml(text),
    trackOpens: args.trackOpens,
    trackClicks: args.trackClicks,
  });

  const headers = buildUnsubscribeHeaders(unsub);

  try {
    const result = await sendViaMailbox(args.mailbox, {
      from: args.mailbox.email,
      to: lead.email,
      subject,
      text,
      html,
      headers,
    });

    // Update message + counters + lead + usage.
    await db
      .update(messages)
      .set({
        status: "sent",
        sentAt: new Date(),
        messageIdHeader: result.messageId,
      })
      .where(eq(messages.id, message!.id));

    await db.insert(messageEvents).values({
      orgId: args.orgId,
      messageId: message!.id,
      campaignId: args.campaignId,
      leadId: args.leadId,
      type: "sent",
    });

    await db
      .update(mailboxes)
      .set({ lastSentAt: new Date() })
      .where(eq(mailboxes.id, args.mailbox.id));

    await db
      .update(leads)
      .set({ status: "contacted", lastContactedAt: new Date() })
      .where(eq(leads.id, args.leadId));

    await consumeRateLimit(args.mailbox.id);
    await recordUsage({
      orgId: args.orgId,
      metric: "email_sent",
      reference: message!.id,
    });

    // A/B accounting: count the send, then see if the test can be decided.
    if (args.variantId) {
      await bumpVariantCounter(args.variantId, "sent");
      await maybeSelectWinner(args.stepId);
    }

    return { status: "sent", messageId: message!.id };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("send failed", { mailbox: args.mailbox.email, error: errorMsg });

    await db
      .update(messages)
      .set({ status: "failed", error: errorMsg })
      .where(eq(messages.id, message!.id));

    // Hard bounce → suppress the recipient.
    if (/mailbox.*(not found|unavailable)|550|no such user/i.test(errorMsg)) {
      await addSuppression({
        orgId: args.orgId,
        email: lead.email,
        reason: "bounce",
      });
    }
    return { status: "failed", error: errorMsg };
  }
}

function mergeContext(lead: Lead): Record<string, string> {
  return {
    firstName: lead.firstName ?? "",
    lastName: lead.lastName ?? "",
    fullName: lead.fullName ?? "",
    company: lead.companyName ?? "",
    companyName: lead.companyName ?? "",
    title: lead.title ?? "",
    ...(lead.customFields ?? {}),
  };
}

/** Convert plain text (with newlines) into simple, deliverability-safe HTML. */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const withLinks = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1">$1</a>'
  );
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.5">${withLinks
    .split("\n")
    .map((line) => (line.trim() === "" ? "<br/>" : `<p style="margin:0 0 12px">${line}</p>`))
    .join("")}</body></html>`;
}

// Reference to keep sendingDomains import meaningful for future domain-scoped
// spam checks (rDNS/blacklist per domain's sending IP).
void sendingDomains;
