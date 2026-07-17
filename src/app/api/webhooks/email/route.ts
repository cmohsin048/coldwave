import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { messages, messageEvents } from "@/db/schema";
import { addSuppression } from "@/modules/sending/suppression";
import { normalizeEmail } from "@/lib/utils";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Provider-neutral email-events webhook (shape compatible with Postmark's
 * Open/Click/Bounce/SpamComplaint/SubscriptionChange payloads).
 *
 * Campaign sending in ColdWave goes through connected mailboxes (opens/clicks
 * are captured by our own tracking endpoints, replies by IMAP). This webhook is
 * for when an ESP is used for system/transactional mail OR for delivery/bounce
 * feedback — bounces and complaints are mapped to suppressions here.
 *
 * Auth: shared secret via `?secret=` or `Authorization: Bearer`. Configure the
 * same value in your ESP's webhook settings.
 */

function authorized(req: NextRequest): boolean {
  const expected = process.env.EMAIL_WEBHOOK_SECRET;
  if (!expected) return true; // no secret configured (dev)
  const url = new URL(req.url);
  const q = url.searchParams.get("secret");
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return q === expected || header === expected;
}

interface PostmarkEvent {
  RecordType?: string; // "Open" | "Click" | "Bounce" | "SpamComplaint" | "SubscriptionChange" | "Delivery"
  MessageID?: string;
  Recipient?: string;
  Email?: string;
  Type?: string; // bounce type
  SuppressSending?: boolean;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let event: PostmarkEvent;
  try {
    event = (await req.json()) as PostmarkEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const recipient = event.Recipient ?? event.Email;
  const providerMessageId = event.MessageID;

  // Correlate to our message via the RFC5322 Message-ID we set when sending.
  const message = providerMessageId
    ? await db.query.messages.findFirst({
        where: eq(messages.messageIdHeader, providerMessageId),
      })
    : null;

  const record = (event.RecordType ?? "").toLowerCase();

  const typeMap: Record<string, "open" | "click" | "bounce" | "spam_complaint" | "unsubscribe" | "delivered"> = {
    open: "open",
    click: "click",
    bounce: "bounce",
    spamcomplaint: "spam_complaint",
    subscriptionchange: "unsubscribe",
    delivery: "delivered",
  };
  const mapped = typeMap[record];
  if (!mapped) {
    return NextResponse.json({ ok: true, ignored: record });
  }

  if (message) {
    await db.insert(messageEvents).values({
      orgId: message.orgId,
      messageId: message.id,
      campaignId: message.campaignId,
      leadId: message.leadId,
      type: mapped === "delivered" ? "delivered" : mapped,
      meta: { provider: "postmark", raw: event as Record<string, unknown> },
    });

    // Bounces + complaints + unsubscribes → suppression (compliance).
    if (
      (mapped === "bounce" || mapped === "spam_complaint" || mapped === "unsubscribe") &&
      recipient
    ) {
      await addSuppression({
        orgId: message.orgId,
        email: normalizeEmail(recipient),
        reason:
          mapped === "bounce"
            ? "bounce"
            : mapped === "spam_complaint"
              ? "spam_complaint"
              : "unsubscribe",
      });
    }
  } else {
    logger.warn("email webhook: no matching message", { providerMessageId, record });
  }

  return NextResponse.json({ ok: true });
}
