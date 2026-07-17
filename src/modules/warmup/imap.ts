import { ImapFlow } from "imapflow";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  mailboxes,
  warmupConfigs,
  messages,
  messageEvents,
  leads,
  type Mailbox,
  type WarmupConfig,
} from "@/db/schema";
import { openSecrets } from "@/modules/mailboxes/credentials";
import { pauseOnReply } from "@/modules/campaigns/scheduler";
import { bumpVariantCounter } from "@/modules/campaigns/variants";
import {
  bumpStat,
  providerBucket,
  WARMUP_TAG,
} from "@/modules/warmup/engine";
import { sendViaMailbox } from "@/modules/sending/transport";
import { logger } from "@/lib/logger";
import { normalizeEmail } from "@/lib/utils";

/**
 * IMAP reply detection + warmup inbox bot (imapflow).
 *
 * `syncReplies` scans each connected mailbox's INBOX for new inbound mail,
 * matches replies to our outbound campaign messages (via threading headers or
 * sender address), records them, and pauses that lead's sequence.
 *
 * `runInboxBot` performs warmup bot behavior: opens warmup emails, rescues them
 * from Spam, and marks them read so the peer mailbox looks engaged.
 */

function imapClient(mailbox: Mailbox): ImapFlow | null {
  if (!mailbox.imapHost || !mailbox.encryptedCredentials) return null;
  const secrets = openSecrets(mailbox.encryptedCredentials);
  return new ImapFlow({
    host: mailbox.imapHost,
    port: mailbox.imapPort ?? 993,
    secure: mailbox.imapSecure ?? true,
    auth: {
      user: mailbox.email,
      pass: secrets.imapPass ?? secrets.smtpPass ?? "",
    },
    logger: false,
  });
}

/** Sync replies for every IMAP-enabled mailbox in the system. */
export async function syncReplies(): Promise<{ replies: number }> {
  const boxes = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.status, "active"));

  let replies = 0;
  for (const mailbox of boxes) {
    if (!mailbox.imapHost) continue;
    try {
      replies += await syncMailboxReplies(mailbox);
    } catch (err) {
      logger.warn("imap reply sync failed", {
        mailbox: mailbox.email,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { replies };
}

async function syncMailboxReplies(mailbox: Mailbox): Promise<number> {
  const client = imapClient(mailbox);
  if (!client) return 0;
  let found = 0;

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Look at mail from the last 2 days.
      const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      for await (const msg of client.fetch(
        { since },
        { envelope: true, headers: ["in-reply-to", "references"] }
      )) {
        const from = msg.envelope?.from?.[0]?.address;
        if (!from) continue;
        const fromEmail = normalizeEmail(from);

        // Is the sender a lead we have an active enrollment for?
        const lead = await db.query.leads.findFirst({
          where: and(
            eq(leads.orgId, mailbox.orgId),
            eq(leads.email, fromEmail)
          ),
        });
        if (!lead) continue;

        // Find the outbound message this replies to (best-effort).
        const outbound = await db.query.messages.findFirst({
          where: and(
            eq(messages.orgId, mailbox.orgId),
            eq(messages.leadId, lead.id),
            eq(messages.direction, "outbound")
          ),
        });

        // Record inbound message (dedupe by envelope messageId).
        const messageId = msg.envelope?.messageId ?? undefined;
        const existing = messageId
          ? await db.query.messages.findFirst({
              where: eq(messages.messageIdHeader, messageId),
            })
          : null;
        if (existing) continue;

        await db.insert(messages).values({
          orgId: mailbox.orgId,
          direction: "inbound",
          status: "replied",
          campaignId: outbound?.campaignId,
          leadId: lead.id,
          mailboxId: mailbox.id,
          fromEmail,
          toEmail: mailbox.email,
          subject: msg.envelope?.subject ?? "(reply)",
          messageIdHeader: messageId,
        });

        await db.insert(messageEvents).values({
          orgId: mailbox.orgId,
          messageId: outbound?.id,
          campaignId: outbound?.campaignId,
          leadId: lead.id,
          type: "reply",
        });

        await db
          .update(leads)
          .set({ status: "replied" })
          .where(eq(leads.id, lead.id));

        // Credit the A/B variant that earned the reply.
        if (outbound?.variantId) {
          await bumpVariantCounter(outbound.variantId, "replies");
        }

        // Auto-pause the lead's sequence (or follow its replied-branch).
        await pauseOnReply(mailbox.orgId, lead.id);
        found++;
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return found;
}

/**
 * Warmup inbox bot for one mailbox:
 *  1. rescue warmup mail from Spam → Inbox (and flip the sender's optimistic
 *     inbox stat to spam so per-provider placement is truthful),
 *  2. mark unseen warmup mail read so the mailbox looks engaged,
 *  3. reply to a share of warmup mail per the config's reply rate.
 * Best-effort; folder names vary by provider.
 */
export async function runInboxBot(
  mailbox: Mailbox,
  config?: WarmupConfig | null
): Promise<{ rescued: number; replied: number }> {
  const client = imapClient(mailbox);
  if (!client) return { rescued: 0, replied: 0 };
  let rescued = 0;
  let replied = 0;

  /** Resolve a warmup peer (same org) by its email address. */
  async function peerByEmail(email: string): Promise<Mailbox | null> {
    const peer = await db.query.mailboxes.findFirst({
      where: and(
        eq(mailboxes.orgId, mailbox.orgId),
        eq(mailboxes.email, normalizeEmail(email))
      ),
    });
    return peer ?? null;
  }

  await client.connect();
  try {
    // 1) Rescue warmup mail out of Spam.
    const spamFolders = ["[Gmail]/Spam", "Junk", "Junk Email", "Spam"];
    for (const folder of spamFolders) {
      const opened = await client.mailboxOpen(folder).catch(() => null);
      if (!opened) continue;
      const toRescue: { uid: number; from?: string }[] = [];
      for await (const msg of client.fetch(
        { header: { "x-coldwave-warmup": "1" } },
        { uid: true, envelope: true }
      )) {
        toRescue.push({
          uid: msg.uid,
          from: msg.envelope?.from?.[0]?.address ?? undefined,
        });
      }
      for (const msg of toRescue) {
        await client
          .messageMove(String(msg.uid), "INBOX", { uid: true })
          .catch(() => {});
        rescued++;
        // The send was counted as inbox optimistically — reclassify as spam
        // on the SENDER's stats (bucketed by this mailbox's provider).
        if (msg.from) {
          const sender = await peerByEmail(msg.from);
          if (sender) {
            await bumpStat(mailbox.orgId, sender.id, providerBucket(mailbox), {
              inbox: -1,
              spam: 1,
            });
          }
        }
      }
    }

    // 2) + 3) Engage with unseen warmup mail in the Inbox.
    const lock = await client.getMailboxLock("INBOX");
    try {
      const unseen: { uid: number; from?: string; subject?: string }[] = [];
      for await (const msg of client.fetch(
        { seen: false, header: { "x-coldwave-warmup": "1" } },
        { uid: true, envelope: true }
      )) {
        unseen.push({
          uid: msg.uid,
          from: msg.envelope?.from?.[0]?.address ?? undefined,
          subject: msg.envelope?.subject ?? undefined,
        });
      }

      for (const msg of unseen) {
        await client
          .messageFlagsAdd(String(msg.uid), ["\\Seen"], { uid: true })
          .catch(() => {});

        const replyRate = config?.replyRate ?? 30;
        if (msg.from && Math.random() * 100 < replyRate) {
          try {
            await sendViaMailbox(mailbox, {
              from: mailbox.email,
              to: msg.from,
              subject: `Re: ${msg.subject ?? "Quick sync"}`,
              text: "Sounds good — thanks!",
              headers: { [WARMUP_TAG]: "1" },
            });
            replied++;
            const sender = await peerByEmail(msg.from);
            if (sender) {
              await bumpStat(
                mailbox.orgId,
                sender.id,
                providerBucket(mailbox),
                { replied: 1 }
              );
            }
          } catch (err) {
            logger.warn("warmup reply failed", {
              mailbox: mailbox.email,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    logger.warn("warmup inbox bot error", {
      mailbox: mailbox.email,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await client.logout().catch(() => {});
  }
  return { rescued, replied };
}

/**
 * Run the inbox bot for every warming mailbox. Scheduled from the worker
 * alongside the warmup send tick.
 */
export async function runWarmupInboxBots(): Promise<{
  mailboxes: number;
  rescued: number;
  replied: number;
}> {
  const rows = await db
    .select({ mailbox: mailboxes, config: warmupConfigs })
    .from(warmupConfigs)
    .innerJoin(mailboxes, eq(warmupConfigs.mailboxId, mailboxes.id))
    .where(
      and(
        inArray(mailboxes.status, ["active", "warming"]),
        inArray(warmupConfigs.status, ["ramping", "maintaining"])
      )
    );

  let rescued = 0;
  let replied = 0;
  for (const row of rows) {
    if (!row.mailbox.imapHost) continue;
    const res = await runInboxBot(row.mailbox, row.config);
    rescued += res.rescued;
    replied += res.replied;
  }
  return { mailboxes: rows.length, rescued, replied };
}
