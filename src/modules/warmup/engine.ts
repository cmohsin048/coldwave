import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  mailboxes,
  warmupConfigs,
  warmupStats,
  type Mailbox,
  type WarmupConfig,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { randomInt, emailDomain } from "@/lib/utils";
import { sendViaMailbox } from "@/modules/sending/transport";

/**
 * Auto-warmup engine (peer-to-peer). Pool mailboxes email each other on a daily
 * ramp with human-like timing. Bot inbox behavior (auto-open, auto-reply,
 * mark-not-spam, move Spam→Inbox) lives in `imap.ts`; this module drives the
 * outbound ramp + stat accounting.
 */

export const WARMUP_TAG = "X-ColdWave-Warmup";

/**
 * Bucket a mailbox into the inbox-provider families we report placement for
 * (Gmail / Outlook / Yahoo / other), from its provider setting or domain.
 */
export function providerBucket(
  mailbox: Pick<Mailbox, "email" | "provider">
): string {
  if (mailbox.provider === "gmail" || mailbox.provider === "google_workspace")
    return "gmail";
  if (mailbox.provider === "outlook" || mailbox.provider === "office365")
    return "outlook";
  const domain = emailDomain(mailbox.email);
  if (["gmail.com", "googlemail.com"].includes(domain)) return "gmail";
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain))
    return "outlook";
  if (["yahoo.com", "ymail.com", "aol.com"].includes(domain)) return "yahoo";
  return "other";
}

/** Daily target volume for a warmup config given how many days it has run. */
export function computeDailyTarget(cfg: WarmupConfig): number {
  if (!cfg.startedAt) return cfg.startVolume;
  const days = Math.floor(
    (Date.now() - cfg.startedAt.getTime()) / (24 * 60 * 60 * 1000)
  );
  const target = cfg.startVolume + days * cfg.dailyIncrement;
  return Math.min(target, cfg.maxVolume);
}

/** Whether now is inside business hours (Mon-Fri 8am-6pm) for the config tz. */
export function isWithinBusinessHours(cfg: WarmupConfig, now = new Date()): boolean {
  if (!cfg.businessHoursOnly) return true;
  // Compute local hour/day in the config timezone.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: cfg.timezone,
    hour: "numeric",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  if (isWeekend && cfg.weekendReduction) return false;
  return hour >= 8 && hour < 18;
}

/** How many warmup emails to send this 15-min tick (target spread over the day). */
function perTickVolume(dailyTarget: number): number {
  // ~40 business-hour ticks/day (10h * 4). Randomize for human-like pacing.
  const base = dailyTarget / 40;
  const jitter = Math.random() < base % 1 ? 1 : 0;
  return Math.max(0, Math.floor(base) + jitter);
}

interface WarmingMailbox {
  mailbox: Mailbox;
  config: WarmupConfig;
}

async function loadWarmingMailboxes(): Promise<WarmingMailbox[]> {
  const rows = await db
    .select({ mailbox: mailboxes, config: warmupConfigs })
    .from(warmupConfigs)
    .innerJoin(mailboxes, eq(warmupConfigs.mailboxId, mailboxes.id))
    .where(
      and(
        eq(mailboxes.status, "active"),
        sql`${warmupConfigs.status} in ('ramping','maintaining')`
      )
    );
  return rows;
}

/**
 * Record a daily warmup stat increment for a mailbox/provider bucket.
 * Negative increments (e.g. the inbox bot re-classifying an optimistic
 * "inbox" as "spam") are clamped at zero.
 */
export async function bumpStat(
  orgId: string,
  mailboxId: string,
  provider: string,
  patch: Partial<{
    sent: number;
    received: number;
    inbox: number;
    spam: number;
    replied: number;
  }>
) {
  const day = new Date().toISOString().slice(0, 10);
  await db
    .insert(warmupStats)
    .values({
      orgId,
      mailboxId,
      day,
      provider,
      sent: Math.max(0, patch.sent ?? 0),
      received: Math.max(0, patch.received ?? 0),
      inbox: Math.max(0, patch.inbox ?? 0),
      spam: Math.max(0, patch.spam ?? 0),
      replied: Math.max(0, patch.replied ?? 0),
    })
    .onConflictDoUpdate({
      target: [warmupStats.mailboxId, warmupStats.day, warmupStats.provider],
      set: {
        sent: sql`GREATEST(0, ${warmupStats.sent} + ${patch.sent ?? 0})`,
        received: sql`GREATEST(0, ${warmupStats.received} + ${patch.received ?? 0})`,
        inbox: sql`GREATEST(0, ${warmupStats.inbox} + ${patch.inbox ?? 0})`,
        spam: sql`GREATEST(0, ${warmupStats.spam} + ${patch.spam ?? 0})`,
        replied: sql`GREATEST(0, ${warmupStats.replied} + ${patch.replied ?? 0})`,
      },
    });
}

const SUBJECTS = [
  "Quick sync",
  "Following up",
  "Re: last week",
  "Thoughts?",
  "Catching up",
  "Notes from earlier",
];
const BODIES = [
  "Hey — just circling back on this. Talk soon.",
  "Thanks for the update earlier, looks good to me.",
  "Appreciate it. Let's touch base next week.",
  "Got it, that works. Cheers.",
];

/**
 * Run one warmup tick: each warming mailbox sends a few emails to peer
 * mailboxes in the same org's warmup pool. Peer inbox bots (imap.ts) will open,
 * reply, and rescue-from-spam on their own schedule.
 */
export async function runWarmupTick(): Promise<{ sent: number }> {
  const warming = await loadWarmingMailboxes();
  if (warming.length < 2) return { sent: 0 }; // need at least a pair to warm

  let sentTotal = 0;

  // Group by org so mailboxes only warm within their own tenant.
  const byOrg = new Map<string, WarmingMailbox[]>();
  for (const w of warming) {
    const arr = byOrg.get(w.mailbox.orgId) ?? [];
    arr.push(w);
    byOrg.set(w.mailbox.orgId, arr);
  }

  for (const [orgId, pool] of byOrg) {
    if (pool.length < 2) continue;
    for (const sender of pool) {
      if (!isWithinBusinessHours(sender.config)) continue;
      const dailyTarget = computeDailyTarget(sender.config);
      const count = perTickVolume(dailyTarget);

      for (let i = 0; i < count; i++) {
        // Pick a random peer that isn't the sender.
        const peers = pool.filter((p) => p.mailbox.id !== sender.mailbox.id);
        const recipient = peers[randomInt(0, peers.length - 1)];
        if (!recipient) break;

        try {
          const subject = SUBJECTS[randomInt(0, SUBJECTS.length - 1)]!;
          const body = BODIES[randomInt(0, BODIES.length - 1)]!;
          await sendViaMailbox(sender.mailbox, {
            from: sender.mailbox.email,
            to: recipient.mailbox.email,
            subject,
            text: body,
            headers: { [WARMUP_TAG]: "1" },
          });
          // Sender stats are bucketed by the RECIPIENT's provider — "how does
          // my mail place at Gmail/Outlook/Yahoo". Inbox is optimistic; the
          // peer's inbox bot flips it to spam if it finds the mail in Junk.
          const recipientBucket = providerBucket(recipient.mailbox);
          await bumpStat(orgId, sender.mailbox.id, recipientBucket, {
            sent: 1,
            inbox: 1,
          });
          await bumpStat(
            orgId,
            recipient.mailbox.id,
            providerBucket(sender.mailbox),
            { received: 1 }
          );
          sentTotal++;
        } catch (err) {
          logger.warn("warmup send failed", {
            from: sender.mailbox.email,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Update currentVolume + graduate to maintaining at cap.
      const target = computeDailyTarget(sender.config);
      await db
        .update(warmupConfigs)
        .set({
          currentVolume: target,
          status: target >= sender.config.maxVolume ? "maintaining" : "ramping",
        })
        .where(eq(warmupConfigs.id, sender.config.id));
    }
  }

  return { sent: sentTotal };
}

/** Enable warmup for a mailbox (starts the ramp today). */
export async function startWarmup(orgId: string, mailboxId: string) {
  await db
    .update(warmupConfigs)
    .set({ status: "ramping", startedAt: new Date() })
    .where(
      and(
        eq(warmupConfigs.orgId, orgId),
        eq(warmupConfigs.mailboxId, mailboxId)
      )
    );
  await db
    .update(mailboxes)
    .set({ status: "warming" })
    .where(eq(mailboxes.id, mailboxId));
}
