/**
 * Smoke-test reply alerts: npx tsx src/scripts/test-reply-alert.ts
 *
 * Uses the first org + lead in the database. A positive reply should attempt
 * a send (delivered only when SYSTEM_SMTP_* is configured); a neutral reply
 * should be skipped under the default "positive_only" mode.
 */
import "dotenv/config";
import { db } from "@/db";
import { sendReplyAlert } from "@/modules/notifications/reply-alerts";

async function main() {
  const org = await db.query.organizations.findFirst();
  const lead = await db.query.leads.findFirst();
  if (!org || !lead) {
    console.log("no seeded org/lead found");
    process.exit(1);
  }
  console.log(
    `org: ${org.name} | mode: ${org.replyNotificationMode} | notificationEmail: ${org.notificationEmail ?? "(owner fallback)"}`
  );
  console.log(`lead: ${lead.fullName ?? lead.firstName} <${lead.email}>`);

  const positive = await sendReplyAlert({
    orgId: org.id,
    lead,
    campaignId: null,
    subject: "Re: Quick question",
    replyText: "This sounds great, can we book a call next week?",
    sentiment: "positive",
    sentimentSummary: "Interested, wants a call next week.",
  });
  console.log(
    `positive reply → sent: ${positive} (false is expected without SYSTEM_SMTP_* configured — a "system mail not configured" warning above means the alert logic fired correctly)`
  );

  const neutral = await sendReplyAlert({
    orgId: org.id,
    lead,
    campaignId: null,
    subject: "Re: Quick question",
    replyText: "Who is this?",
    sentiment: "neutral",
    sentimentSummary: "Asking who the sender is.",
  });
  console.log(
    `neutral reply → sent: ${neutral} (expected false with no warning: skipped by positive_only mode)`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
