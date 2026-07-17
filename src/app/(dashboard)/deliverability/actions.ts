"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { spamChecks, sendingDomains } from "@/db/schema";
import { action } from "@/lib/action";
import { getEnv } from "@/lib/env";
import { runSpamCheck } from "@/modules/spam/engine";
import { checkDnsAuth, checkBlacklists } from "@/modules/spam/dns-auth";
import { refreshDomainHealth } from "@/modules/spam/domain-refresh";

const spamCheckSchema = z.object({
  subject: z.string().default(""),
  body: z.string().default(""),
  fromEmail: z.string().email().optional(),
  domain: z.string().optional(),
  sendingIp: z.string().optional(),
  campaignId: z.string().optional(),
  stepId: z.string().optional(),
});

/** Run the pre-send spam engine and persist the result. */
export const checkSpam = action(spamCheckSchema, async (input, ctx) => {
  const threshold = getEnv().SPAM_SCORE_BLOCK_THRESHOLD;
  const result = await runSpamCheck(
    {
      subject: input.subject,
      body: input.body,
      fromEmail: input.fromEmail,
      domain: input.domain,
      sendingIp: input.sendingIp,
    },
    threshold
  );

  await db.insert(spamChecks).values({
    orgId: ctx.orgId,
    campaignId: input.campaignId,
    stepId: input.stepId,
    score: result.score,
    passed: String(result.passed),
    breakdown: result.breakdown as Record<string, unknown>,
    suggestions: result.suggestions,
  });

  return result;
});

const dnsCheckSchema = z.object({
  domain: z.string().min(3),
  sendingIp: z.string().optional(),
});

/** Standalone domain auth + blacklist check for the domain health scorecard. */
export const checkDomainHealth = action(dnsCheckSchema, async (input) => {
  const [dns, blacklists] = await Promise.all([
    checkDnsAuth(input.domain, input.sendingIp),
    input.sendingIp ? checkBlacklists(input.sendingIp) : Promise.resolve([]),
  ]);

  const score =
    (dns.spf.present ? 25 : 0) +
    (dns.dkim.present ? 25 : 0) +
    (dns.dmarc.present ? 25 : 0) +
    (dns.rdns.valid || !input.sendingIp ? 15 : 0) +
    (blacklists.length === 0 ? 10 : 0);

  return { dns, blacklists, healthScore: score };
});

/** Register a sending domain to monitor (usually auto-created on mailbox connect). */
export const addSendingDomain = action(
  z.object({
    domain: z
      .string()
      .min(3)
      .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Enter a bare domain, e.g. example.com"),
  }),
  async (input, ctx) => {
    const domain = input.domain.toLowerCase().trim();
    const existing = await db.query.sendingDomains.findFirst({
      where: and(
        eq(sendingDomains.orgId, ctx.orgId),
        eq(sendingDomains.domain, domain)
      ),
    });
    if (existing) return { domainId: existing.id, existed: true };

    const [row] = await db
      .insert(sendingDomains)
      .values({ orgId: ctx.orgId, domain })
      .returning();
    // Kick off an immediate first check so the row isn't empty.
    await refreshDomainHealth(row!).catch(() => {});
    revalidatePath("/deliverability");
    return { domainId: row!.id, existed: false };
  }
);

/** Re-run the DNS auth + blacklist check for one sending domain now. */
export const recheckSendingDomain = action(
  z.object({ domainId: z.string() }),
  async (input, ctx) => {
    const row = await db.query.sendingDomains.findFirst({
      where: and(
        eq(sendingDomains.id, input.domainId),
        eq(sendingDomains.orgId, ctx.orgId)
      ),
    });
    if (!row) throw new Error("Domain not found");
    const result = await refreshDomainHealth(row);
    revalidatePath("/deliverability");
    return { healthScore: result.healthScore };
  }
);

/** Remove a sending domain from monitoring. */
export const deleteSendingDomain = action(
  z.object({ domainId: z.string() }),
  async (input, ctx) => {
    await db
      .delete(sendingDomains)
      .where(
        and(
          eq(sendingDomains.id, input.domainId),
          eq(sendingDomains.orgId, ctx.orgId)
        )
      );
    revalidatePath("/deliverability");
    return { deleted: true };
  },
  { role: "admin" }
);
