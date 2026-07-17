import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { trackingTokens, messages, messageEvents } from "@/db/schema";
import { bumpVariantCounter } from "@/modules/campaigns/variants";

/**
 * Resolve a tracking token and record the corresponding open/click event.
 * Returns the target URL for click tokens.
 */
export async function recordTrackingHit(
  token: string,
  meta: { ip?: string; userAgent?: string }
): Promise<{ kind: "open" | "click"; targetUrl?: string } | null> {
  const row = await db.query.trackingTokens.findFirst({
    where: eq(trackingTokens.token, token),
  });
  if (!row) return null;

  await db
    .update(trackingTokens)
    .set({ hits: sql`${trackingTokens.hits} + 1` })
    .where(eq(trackingTokens.token, token));

  const message = await db.query.messages.findFirst({
    where: eq(messages.id, row.messageId),
  });

  await db.insert(messageEvents).values({
    orgId: row.orgId,
    messageId: row.messageId,
    campaignId: message?.campaignId,
    leadId: message?.leadId,
    type: row.kind === "open" ? "open" : "click",
    meta: {
      ...meta,
      ...(row.kind === "click" ? { url: row.targetUrl } : {}),
    },
  });

  // Reflect first open/click on the message status (don't downgrade), and
  // credit the A/B variant that produced the engagement.
  if (message && message.status === "sent") {
    await db
      .update(messages)
      .set({ status: row.kind === "open" ? "opened" : "clicked" })
      .where(eq(messages.id, row.messageId));
    if (message.variantId) {
      await bumpVariantCounter(
        message.variantId,
        row.kind === "open" ? "opens" : "clicks"
      );
    }
  }

  return { kind: row.kind as "open" | "click", targetUrl: row.targetUrl ?? undefined };
}
