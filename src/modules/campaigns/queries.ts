import { and, eq, asc, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  campaigns,
  sequenceSteps,
  stepVariants,
} from "@/db/schema";

export function listCampaigns(orgId: string) {
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.orgId, orgId))
    .orderBy(desc(campaigns.createdAt));
}

export async function getCampaign(orgId: string, campaignId: string) {
  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.orgId, orgId), eq(campaigns.id, campaignId)),
  });
  if (!campaign) return null;

  const steps = await db
    .select()
    .from(sequenceSteps)
    .where(eq(sequenceSteps.campaignId, campaignId))
    .orderBy(asc(sequenceSteps.order));

  const variants = await db
    .select()
    .from(stepVariants)
    .where(eq(stepVariants.orgId, orgId));

  const variantsByStep = new Map<string, typeof variants>();
  for (const v of variants) {
    const arr = variantsByStep.get(v.stepId) ?? [];
    arr.push(v);
    variantsByStep.set(v.stepId, arr);
  }

  return {
    campaign,
    steps: steps.map((s) => ({
      ...s,
      variants: variantsByStep.get(s.id) ?? [],
    })),
  };
}
