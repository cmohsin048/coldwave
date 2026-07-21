import { sql } from "drizzle-orm";
import { db } from "@/db";
import { funnelStageStats } from "@/db/schema";

/**
 * Per-stage conversion rollup (awareness → interest → demo → close).
 *
 * `entered` counts enrollments that reached a stage; `converted` counts
 * enrollments that progressed past it (or replied while in it). Rates are
 * recomputed in SQL on every upsert so the analytics read side is a plain
 * select.
 */

export const STAGE_ORDER = ["awareness", "interest", "demo", "close"] as const;
export type FunnelStage = (typeof STAGE_ORDER)[number];

function stageIndex(stage: string): number {
  return STAGE_ORDER.indexOf(stage as FunnelStage);
}

async function bump(
  orgId: string,
  campaignId: string,
  stage: FunnelStage,
  counter: "entered" | "converted",
  amount = 1
): Promise<void> {
  if (amount <= 0) return;
  await db
    .insert(funnelStageStats)
    .values({
      orgId,
      campaignId,
      stage,
      entered: counter === "entered" ? amount : 0,
      converted: counter === "converted" ? amount : 0,
      conversionRate: 0,
    })
    .onConflictDoUpdate({
      target: [funnelStageStats.campaignId, funnelStageStats.stage],
      set: {
        [counter]: sql`${funnelStageStats[counter]} + ${amount}`,
        conversionRate: sql`
          (${funnelStageStats.converted} + ${counter === "converted" ? amount : 0})::real
          / GREATEST(${funnelStageStats.entered} + ${counter === "entered" ? amount : 0}, 1)`,
      },
    });
}

/** Record enrollments entering a stage (e.g. enrollment into the first step). */
export async function recordStageEntered(
  orgId: string,
  campaignId: string,
  stage: string,
  amount = 1
): Promise<void> {
  if (stageIndex(stage) === -1) return;
  await bump(orgId, campaignId, stage as FunnelStage, "entered", amount);
}

/**
 * Record an enrollment moving between stages. Moving to a LATER stage counts
 * as a conversion of the stage being left; the new stage gains an `entered`.
 */
export async function recordStageTransition(
  orgId: string,
  campaignId: string,
  fromStage: string,
  toStage: string
): Promise<void> {
  const from = stageIndex(fromStage);
  const to = stageIndex(toStage);
  if (from === -1 || to === -1 || from === to) return;
  if (to > from) {
    await bump(orgId, campaignId, fromStage as FunnelStage, "converted");
  }
  await bump(orgId, campaignId, toStage as FunnelStage, "entered");
}

/**
 * A reply is the success event of whatever stage the lead was in — count it
 * as that stage's conversion (used when a reply pauses the sequence).
 */
export async function recordStageReplyConversion(
  orgId: string,
  campaignId: string,
  stage: string
): Promise<void> {
  if (stageIndex(stage) === -1) return;
  await bump(orgId, campaignId, stage as FunnelStage, "converted");
}
