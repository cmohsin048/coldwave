import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { stepVariants, type StepVariant } from "@/db/schema";
import { logger } from "@/lib/logger";

/**
 * A/B variant selection + winner auto-selection.
 *
 * While no winner is chosen, sends rotate across a step's variants by weight.
 * Once every variant has at least MIN_SENDS_FOR_WINNER sends, the variant with
 * the best engagement (replies first, opens as fallback) is locked in as the
 * winner and receives all subsequent sends.
 */

export const MIN_SENDS_FOR_WINNER = 25;

/**
 * Pick the variant to send for a step. Returns null when the step has no
 * variants (the step's own subject/body should be used).
 */
export async function pickVariantForStep(
  stepId: string
): Promise<StepVariant | null> {
  const variants = await db
    .select()
    .from(stepVariants)
    .where(eq(stepVariants.stepId, stepId));
  if (variants.length === 0) return null;
  if (variants.length === 1) return variants[0]!;

  const winner = variants.find((v) => v.isWinner);
  if (winner) return winner;

  // Weighted random rotation.
  const totalWeight = variants.reduce((sum, v) => sum + Math.max(v.weight, 1), 0);
  let roll = Math.random() * totalWeight;
  for (const v of variants) {
    roll -= Math.max(v.weight, 1);
    if (roll <= 0) return v;
  }
  return variants[variants.length - 1]!;
}

/** Increment a live counter on a variant (sent / opens / clicks / replies). */
export async function bumpVariantCounter(
  variantId: string,
  counter: "sent" | "opens" | "clicks" | "replies"
): Promise<void> {
  const column = stepVariants[counter];
  await db
    .update(stepVariants)
    .set({ [counter]: sql`${column} + 1` })
    .where(eq(stepVariants.id, variantId));
}

/**
 * Check whether a step's A/B test has enough data to declare a winner, and
 * lock it in if so. Safe to call after every send — it exits cheaply when a
 * winner already exists or the sample is still too small.
 */
export async function maybeSelectWinner(stepId: string): Promise<void> {
  const variants = await db
    .select()
    .from(stepVariants)
    .where(eq(stepVariants.stepId, stepId));
  if (variants.length < 2) return;
  if (variants.some((v) => v.isWinner)) return;
  if (variants.some((v) => v.sent < MIN_SENDS_FOR_WINNER)) return;

  // Replies are the real cold-email success metric; fall back to opens when
  // nobody has replied yet.
  const anyReplies = variants.some((v) => v.replies > 0);
  const score = (v: StepVariant) =>
    anyReplies ? v.replies / v.sent : (v.opens + v.clicks) / v.sent;

  const best = [...variants].sort((a, b) => score(b) - score(a))[0]!;
  await db
    .update(stepVariants)
    .set({ isWinner: true })
    .where(and(eq(stepVariants.id, best.id), eq(stepVariants.stepId, stepId)));

  logger.info("A/B winner selected", {
    stepId,
    variant: best.label,
    metric: anyReplies ? "reply_rate" : "open_rate",
  });
}
