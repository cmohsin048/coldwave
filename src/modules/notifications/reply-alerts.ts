import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  organizations,
  memberships,
  users,
  campaigns,
  type Lead,
} from "@/db/schema";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendSystemEmail } from "@/lib/mailer";

/**
 * Reply alerts: email the workspace's notification address when a lead
 * replies. Which replies alert is controlled per-org by
 * `replyNotificationMode`:
 *   - "off"           → never
 *   - "positive_only" → only replies the AI classified as positive (default)
 *   - "all"           → every reply, classified or not
 *
 * Alerts go through the SYSTEM_SMTP_* mailer (never org sending mailboxes,
 * which are warmed/rate-limited for campaigns). Best-effort by design: the
 * reply-sync worker must never fail because an alert couldn't be sent.
 */

export interface ReplyAlertArgs {
  orgId: string;
  lead: Lead;
  campaignId?: string | null;
  /** Subject line of the inbound reply. */
  subject: string;
  /** The lead's own words (quoted text/signature already stripped). */
  replyText: string | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  sentimentSummary: string | null;
  /**
   * Who produced the sentiment: the AI classifier (default) or the keyword
   * fallback used when the AI is unavailable. Keyword verdicts are surfaced
   * as "needs review" in the alert.
   */
  classifiedBy?: "ai" | "keyword" | null;
}

/** Resolve who should receive alerts: explicit setting, else the org owner. */
async function resolveRecipient(org: {
  id: string;
  notificationEmail: string | null;
}): Promise<string | null> {
  if (org.notificationEmail) return org.notificationEmail;
  const [owner] = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(
      and(eq(memberships.orgId, org.id), eq(memberships.role, "owner"))
    )
    .limit(1);
  return owner?.email ?? null;
}

const SENTIMENT_LABEL: Record<string, string> = {
  positive: "POSITIVE",
  neutral: "Neutral",
  negative: "Negative",
};

/**
 * Send a reply alert if the org's settings call for one.
 * Returns true only when an email was actually handed to the system mailer.
 */
export async function sendReplyAlert(args: ReplyAlertArgs): Promise<boolean> {
  try {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, args.orgId),
    });
    if (!org || org.replyNotificationMode === "off") return false;
    if (
      org.replyNotificationMode === "positive_only" &&
      args.sentiment !== "positive"
    ) {
      return false;
    }

    const to = await resolveRecipient(org);
    if (!to) {
      logger.warn("reply alert skipped — no recipient resolvable", {
        orgId: args.orgId,
      });
      return false;
    }

    const campaign = args.campaignId
      ? await db.query.campaigns.findFirst({
          where: eq(campaigns.id, args.campaignId),
          columns: { name: true },
        })
      : null;

    const lead = args.lead;
    const leadName =
      lead.fullName ||
      [lead.firstName, lead.lastName].filter(Boolean).join(" ") ||
      lead.email ||
      "Unknown lead";
    const leadLine = [leadName, lead.title, lead.companyName]
      .filter(Boolean)
      .join(" — ");
    const keywordMatch = args.classifiedBy === "keyword";
    const sentimentLabel = args.sentiment
      ? SENTIMENT_LABEL[args.sentiment] +
        (keywordMatch ? " (keyword match — AI unavailable, needs review)" : "")
      : "Unclassified";

    const subject =
      args.sentiment === "positive"
        ? keywordMatch
          ? `🎯 Possible positive reply from ${leadName} (needs review)`
          : `🎯 Positive reply from ${leadName}`
        : `New reply from ${leadName}`;

    const lines = [
      `${leadLine}`,
      lead.email ? `Email: ${lead.email}` : null,
      campaign?.name ? `Campaign: ${campaign.name}` : null,
      `Sentiment: ${sentimentLabel}`,
      args.sentimentSummary ? `Summary: ${args.sentimentSummary}` : null,
      "",
      "--- Reply ---",
      args.replyText?.trim() || "(no reply text captured)",
      "",
      `View and respond in your inbox: ${getEnv().APP_URL}/inbox`,
    ].filter((l): l is string => l !== null);

    return await sendSystemEmail({
      to,
      subject,
      text: lines.join("\n"),
    });
  } catch (err) {
    // Never let an alert failure break reply ingestion.
    logger.error("reply alert failed", {
      orgId: args.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
