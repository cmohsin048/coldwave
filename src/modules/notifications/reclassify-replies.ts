import { and, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { messages, leads } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { classifyReplySentiment } from "@/modules/ai/openai";
import { sendReplyAlert } from "./reply-alerts";

/**
 * Reclassification sweep: retry AI sentiment on inbound replies that were
 * stored unclassified (OpenAI key missing at the time, or the API call
 * failed). Runs piggybacked on the reply-sync repeatable job.
 *
 * Without this, a reply that failed classification never alerts in the
 * default positive_only mode — a hot lead could go unnoticed. Replies whose
 * alert already went out (replyAlertSentAt set) are upgraded in place but
 * never alerted twice.
 */
export async function reclassifyReplies(
  opts: { batchSize?: number; maxAgeDays?: number } = {}
): Promise<{ scanned: number; classified: number; alerted: number }> {
  const { batchSize = 25, maxAgeDays = 7 } = opts;
  const none = { scanned: 0, classified: 0, alerted: 0 };
  if (!getEnv().OPENAI_API_KEY) return none;

  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.direction, "inbound"),
        isNull(messages.sentiment),
        isNotNull(messages.body),
        gte(messages.createdAt, cutoff)
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(batchSize);

  let classified = 0;
  let alerted = 0;
  for (const msg of rows) {
    try {
      const c = await classifyReplySentiment({
        subject: msg.subject ?? "(reply)",
        body: msg.body ?? "",
      });
      await db
        .update(messages)
        .set({ sentiment: c.sentiment, sentimentSummary: c.summary })
        .where(eq(messages.id, msg.id));
      classified++;

      if (msg.replyAlertSentAt || !msg.leadId) continue;
      const lead = await db.query.leads.findFirst({
        where: eq(leads.id, msg.leadId),
      });
      if (!lead) continue;
      const sent = await sendReplyAlert({
        orgId: msg.orgId,
        lead,
        campaignId: msg.campaignId,
        subject: msg.subject ?? "(reply)",
        replyText: msg.body,
        sentiment: c.sentiment,
        sentimentSummary: c.summary,
        classifiedBy: "ai",
      });
      if (sent) {
        await db
          .update(messages)
          .set({ replyAlertSentAt: new Date() })
          .where(eq(messages.id, msg.id));
        alerted++;
      }
    } catch (err) {
      // The API is likely down — stop instead of failing on every row; the
      // next sweep picks these up again.
      logger.warn("reply reclassification stopped", {
        messageId: msg.id,
        error: err instanceof Error ? err.message : String(err),
      });
      break;
    }
  }
  return { scanned: rows.length, classified, alerted };
}
