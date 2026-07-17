"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  campaigns,
  sequenceSteps,
  stepVariants,
  campaignEnrollments,
  leads,
  suppressions,
} from "@/db/schema";
import { action } from "@/lib/action";
import { generateSequence } from "@/modules/ai/openai";
import {
  briefSchema,
  createCampaignSchema,
  saveStepsSchema,
  updateStatusSchema,
  enrollLeadsSchema,
} from "@/modules/campaigns/schemas";

/** Create an empty draft campaign. */
export const createCampaign = action(createCampaignSchema, async (input, ctx) => {
  const [c] = await db
    .insert(campaigns)
    .values({ orgId: ctx.orgId, name: input.name, status: "draft" })
    .returning();
  revalidatePath("/campaigns");
  return { campaignId: c!.id };
});

/**
 * AI designer: generate a full sequence from a brief and persist campaign +
 * steps + A/B variants. Branch conditions from the model are resolved to step
 * ids after all steps are inserted.
 */
export const generateCampaign = action(briefSchema, async (input, ctx) => {
  const sequence = await generateSequence({
    icp: input.icp,
    product: input.product,
    tone: input.tone,
    offer: input.offer,
    goal: input.goal,
    numSteps: input.numSteps,
  });

  const campaignId = await db.transaction(async (tx) => {
    const [campaign] = await tx
      .insert(campaigns)
      .values({
        orgId: ctx.orgId,
        name: input.name,
        status: "draft",
        brief: input as Record<string, unknown>,
      })
      .returning();

    const sorted = [...sequence.steps].sort((a, b) => a.order - b.order);

    // Insert steps, laying them out vertically on the React Flow canvas.
    const inserted = [];
    for (let i = 0; i < sorted.length; i++) {
      const step = sorted[i]!;
      const [row] = await tx
        .insert(sequenceSteps)
        .values({
          orgId: ctx.orgId,
          campaignId: campaign!.id,
          type: "email",
          stage: step.stage,
          order: step.order,
          subject: step.subject,
          body: step.body,
          delayDays: step.delayDays,
          position: { x: 250, y: 80 + i * 180 },
        })
        .returning();
      inserted.push(row!);

      // A/B variants (the primary body is variant A; model extras are B, C...).
      const variantRows = [
        { label: "A", subject: step.subject, body: step.body },
        ...step.variants.map((v, idx) => ({
          label: String.fromCharCode(66 + idx),
          subject: v.subject,
          body: v.body,
        })),
      ];
      if (variantRows.length > 1) {
        await tx.insert(stepVariants).values(
          variantRows.map((v) => ({
            orgId: ctx.orgId,
            stepId: row!.id,
            label: v.label,
            subject: v.subject,
            body: v.body,
            weight: Math.floor(100 / variantRows.length),
          }))
        );
      }
    }

    // Link linear next-step edges (branch semantics kept in columns for the UI).
    for (let i = 0; i < inserted.length - 1; i++) {
      await tx
        .update(sequenceSteps)
        .set({ nextStepId: inserted[i + 1]!.id, nextIfNoOpen: inserted[i + 1]!.id })
        .where(eq(sequenceSteps.id, inserted[i]!.id));
    }

    return campaign!.id;
  });

  revalidatePath("/campaigns");
  return { campaignId, strategy: sequence.strategy };
});

/** Persist the React Flow builder state (upsert steps + edges). */
export const saveSteps = action(saveStepsSchema, async (input, ctx) => {
  // Ownership check.
  const campaign = await db.query.campaigns.findFirst({
    where: and(
      eq(campaigns.id, input.campaignId),
      eq(campaigns.orgId, ctx.orgId)
    ),
  });
  if (!campaign) throw new Error("Campaign not found");

  await db.transaction(async (tx) => {
    for (const step of input.steps) {
      if (step.id) {
        await tx
          .update(sequenceSteps)
          .set({
            type: step.type,
            stage: step.stage,
            order: step.order,
            subject: step.subject,
            body: step.body,
            delayDays: step.delayDays,
            delayHours: step.delayHours,
            nextIfReplied: step.nextIfReplied ?? null,
            nextIfOpened: step.nextIfOpened ?? null,
            nextIfNoOpen: step.nextIfNoOpen ?? null,
            position: step.position,
          })
          .where(
            and(
              eq(sequenceSteps.id, step.id),
              eq(sequenceSteps.orgId, ctx.orgId)
            )
          );
      } else {
        await tx.insert(sequenceSteps).values({
          orgId: ctx.orgId,
          campaignId: input.campaignId,
          type: step.type,
          stage: step.stage,
          order: step.order,
          subject: step.subject,
          body: step.body,
          delayDays: step.delayDays,
          delayHours: step.delayHours,
          position: step.position,
        });
      }
    }
  });

  revalidatePath(`/campaigns/${input.campaignId}`);
  return { saved: true };
});

export const updateCampaignStatus = action(
  updateStatusSchema,
  async (input, ctx) => {
    await db
      .update(campaigns)
      .set({
        status: input.status,
        startedAt: input.status === "active" ? new Date() : undefined,
      })
      .where(
        and(
          eq(campaigns.id, input.campaignId),
          eq(campaigns.orgId, ctx.orgId)
        )
      );
    revalidatePath(`/campaigns/${input.campaignId}`);
    revalidatePath("/campaigns");
    return { status: input.status };
  }
);

/** Enroll every eligible lead in a list into the campaign. */
export const enrollLeads = action(enrollLeadsSchema, async (input, ctx) => {
  const campaign = await db.query.campaigns.findFirst({
    where: and(
      eq(campaigns.id, input.campaignId),
      eq(campaigns.orgId, ctx.orgId)
    ),
  });
  if (!campaign) throw new Error("Campaign not found");

  const firstStep = await db.query.sequenceSteps.findFirst({
    where: eq(sequenceSteps.campaignId, input.campaignId),
    orderBy: (s, { asc }) => asc(s.order),
  });

  const listLeads = await db
    .select({ id: leads.id, email: leads.email, status: leads.status })
    .from(leads)
    .where(and(eq(leads.orgId, ctx.orgId), eq(leads.listId, input.listId)));

  // Skip suppressed / unsubscribed / bounced leads up front instead of
  // burning enrollment slots that would only be caught at send time.
  const emails = listLeads.map((l) => l.email);
  const suppressedRows = emails.length
    ? await db
        .select({ email: suppressions.email })
        .from(suppressions)
        .where(
          and(
            eq(suppressions.orgId, ctx.orgId),
            inArray(suppressions.email, emails),
            or(
              eq(suppressions.scope, "global"),
              and(
                eq(suppressions.scope, "campaign"),
                eq(suppressions.campaignId, input.campaignId)
              )
            )
          )
        )
    : [];
  const suppressedEmails = new Set(suppressedRows.map((r) => r.email));
  const blockedStatuses = new Set(["unsubscribed", "bounced", "suppressed"]);

  const eligible = listLeads.filter(
    (l) => !suppressedEmails.has(l.email) && !blockedStatuses.has(l.status)
  );
  const skippedSuppressed = listLeads.length - eligible.length;

  let enrolled = 0;
  for (const lead of eligible) {
    const res = await db
      .insert(campaignEnrollments)
      .values({
        orgId: ctx.orgId,
        campaignId: input.campaignId,
        leadId: lead.id,
        status: "active",
        currentStepId: firstStep?.id,
        nextRunAt: new Date(),
      })
      .onConflictDoNothing({
        target: [campaignEnrollments.campaignId, campaignEnrollments.leadId],
      })
      .returning({ id: campaignEnrollments.id });
    if (res.length > 0) enrolled += 1;
  }

  revalidatePath(`/campaigns/${input.campaignId}`);
  return { enrolled, skippedSuppressed, total: listLeads.length };
});
