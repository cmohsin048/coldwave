import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  messageEvents,
  campaigns,
  sendingDomains,
  funnelStageStats,
} from "@/db/schema";
import { STAGE_ORDER } from "@/modules/campaigns/funnel";

export interface EventTotals {
  sent: number;
  delivered: number;
  open: number;
  click: number;
  reply: number;
  bounce: number;
  spam_complaint: number;
  unsubscribe: number;
}

const EMPTY: EventTotals = {
  sent: 0,
  delivered: 0,
  open: 0,
  click: 0,
  reply: 0,
  bounce: 0,
  spam_complaint: 0,
  unsubscribe: 0,
};

/** Org-wide event totals. */
export async function orgEventTotals(orgId: string): Promise<EventTotals> {
  const rows = await db
    .select({
      type: messageEvents.type,
      n: sql<number>`count(*)::int`,
    })
    .from(messageEvents)
    .where(eq(messageEvents.orgId, orgId))
    .groupBy(messageEvents.type);

  const totals = { ...EMPTY };
  for (const r of rows) {
    if (r.type in totals) totals[r.type as keyof EventTotals] = r.n;
  }
  return totals;
}

/** Per-campaign event totals for the campaign performance table. */
export async function campaignPerformance(orgId: string) {
  const rows = await db
    .select({
      campaignId: messageEvents.campaignId,
      name: campaigns.name,
      type: messageEvents.type,
      n: sql<number>`count(*)::int`,
    })
    .from(messageEvents)
    .innerJoin(campaigns, eq(messageEvents.campaignId, campaigns.id))
    .where(eq(messageEvents.orgId, orgId))
    .groupBy(messageEvents.campaignId, campaigns.name, messageEvents.type);

  const byCampaign = new Map<
    string,
    { name: string; totals: EventTotals }
  >();
  for (const r of rows) {
    if (!r.campaignId) continue;
    const entry =
      byCampaign.get(r.campaignId) ?? { name: r.name, totals: { ...EMPTY } };
    if (r.type in entry.totals)
      entry.totals[r.type as keyof EventTotals] = r.n;
    byCampaign.set(r.campaignId, entry);
  }
  return [...byCampaign.entries()].map(([id, v]) => ({ id, ...v }));
}

/**
 * Org-wide funnel stage conversion (awareness → interest → demo → close),
 * aggregated across campaigns from the per-campaign rollup table.
 */
export async function funnelStageTotals(orgId: string) {
  const rows = await db
    .select({
      stage: funnelStageStats.stage,
      entered: sql<number>`sum(${funnelStageStats.entered})::int`,
      converted: sql<number>`sum(${funnelStageStats.converted})::int`,
    })
    .from(funnelStageStats)
    .where(eq(funnelStageStats.orgId, orgId))
    .groupBy(funnelStageStats.stage);

  const byStage = new Map(rows.map((r) => [r.stage, r]));
  return STAGE_ORDER.map((stage) => {
    const row = byStage.get(stage);
    const entered = row?.entered ?? 0;
    const converted = row?.converted ?? 0;
    return { stage, entered, converted, rate: rate(converted, entered) };
  });
}

/** Domain health scorecard rows. */
export function domainScorecard(orgId: string) {
  return db
    .select()
    .from(sendingDomains)
    .where(eq(sendingDomains.orgId, orgId));
}

export function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}
