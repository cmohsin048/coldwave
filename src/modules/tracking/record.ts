import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { trackingTokens, messages, messageEvents } from "@/db/schema";
import { bumpVariantCounter } from "@/modules/campaigns/variants";

/**
 * Mail-security scanners, link-preview bots, and inbox-provider prefetchers
 * (Apple MPP et al.) fetch pixels and links a recipient never saw, inflating
 * open/click counts. Two cheap, high-precision filters:
 *   - a user-agent denylist of known scanners and non-browser HTTP clients,
 *   - hits arriving within seconds of the send (humans don't open that fast;
 *     inline security scans do).
 * Note: GoogleImageProxy is Gmail's image proxy for real opens — not listed.
 */
const BOT_UA_RE =
  /\b(bot|crawler|spider|scanner|preview|monitor(ing)?|validator|barracuda|mimecast|proofpoint|symantec|forcepoint|trendmicro|headlesschrome|phantomjs|curl|wget|python-requests|python-urllib|go-http-client|okhttp|libwww)\b/i;
const MIN_MS_AFTER_SEND = 10_000;

function isLikelyBotHit(
  meta: { userAgent?: string },
  sentAt: Date | null
): boolean {
  if (meta.userAgent && BOT_UA_RE.test(meta.userAgent)) return true;
  if (sentAt && Date.now() - sentAt.getTime() < MIN_MS_AFTER_SEND) return true;
  return false;
}

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

  // Bot hits still resolve (clicks must redirect, raw hits stay countable on
  // the token) but never become engagement events, message-status upgrades,
  // or A/B credit — those must reflect humans only.
  if (isLikelyBotHit(meta, message?.sentAt ?? null)) {
    return {
      kind: row.kind as "open" | "click",
      targetUrl: row.targetUrl ?? undefined,
    };
  }

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
