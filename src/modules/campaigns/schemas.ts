import { z } from "zod";

export const briefSchema = z.object({
  name: z.string().min(1).max(120),
  icp: z.string().min(3),
  product: z.string().min(3),
  tone: z.string().min(2),
  offer: z.string().min(2),
  goal: z.string().min(2),
  numSteps: z.number().int().min(1).max(8).default(4),
});
export type BriefInput = z.infer<typeof briefSchema>;

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(120),
});

export const stepInputSchema = z.object({
  id: z.string().optional(), // present when updating an existing step
  tempId: z.string().optional(), // client-side id for new steps, used to remap branch edges
  type: z.enum(["email", "wait", "condition"]).default("email"),
  stage: z
    .enum(["awareness", "interest", "demo", "close"])
    .default("awareness"),
  order: z.number().int(),
  subject: z.string().optional(),
  body: z.string().optional(),
  delayDays: z.number().int().min(0).default(0),
  delayHours: z.number().int().min(0).default(0),
  nextIfReplied: z.string().nullable().optional(),
  nextIfOpened: z.string().nullable().optional(),
  nextIfNoOpen: z.string().nullable().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

export const saveStepsSchema = z.object({
  campaignId: z.string(),
  steps: z.array(stepInputSchema),
  deletedStepIds: z.array(z.string()).default([]),
});

export const updateCampaignSettingsSchema = z.object({
  campaignId: z.string(),
  mailboxPool: z.array(z.string()).default([]),
  sendPerTimezone: z.boolean(),
  trackOpens: z.boolean(),
  trackClicks: z.boolean(),
  dailyCap: z.number().int().min(1).max(100000).nullable(),
  scheduledStartAt: z.string().datetime({ offset: true }).nullable(),
});

export const stepVariantInputSchema = z.object({
  variantId: z.string(),
  subject: z.string().max(300),
  body: z.string().max(10000),
  weight: z.number().int().min(1).max(100).optional(),
});

export const addStepVariantSchema = z.object({
  stepId: z.string(),
});

export const deleteStepVariantSchema = z.object({
  variantId: z.string(),
});

export const updateStatusSchema = z.object({
  campaignId: z.string(),
  status: z.enum([
    "draft",
    "scheduled",
    "active",
    "paused",
    "completed",
    "archived",
  ]),
});

export const enrollLeadsSchema = z.object({
  campaignId: z.string(),
  listId: z.string(),
});
