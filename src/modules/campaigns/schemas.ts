import { z } from "zod";

export const briefSchema = z.object({
  name: z.string().min(1, "Campaign name is required").max(120),
  icp: z.string().min(3, "Describe who you're targeting"),
  product: z.string().min(3, "Describe what you're selling"),
  // Optional refinements — blanks fall back to sensible defaults.
  tone: z.string().transform((v) => v.trim() || "friendly, direct"),
  offer: z.string().default(""),
  goal: z.string().transform((v) => v.trim() || "book a short call"),
  numSteps: z.number().int().min(1).max(8).default(4),
});
export type BriefInput = z.infer<typeof briefSchema>;

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(120),
});

/** Brief for generating a single email's copy (no campaign persisted).
 *  Only ICP and product are required; the rest fall back to sensible defaults. */
export const emailBriefSchema = z.object({
  icp: z.string().min(3, "Describe who you're targeting"),
  product: z.string().min(3, "Describe what you're selling"),
  tone: z
    .string()
    .transform((v) => v.trim() || "friendly, direct"),
  offer: z.string().default(""),
  goal: z
    .string()
    .transform((v) => v.trim() || "start a conversation"),
});

export const createCampaignWithEmailSchema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(10000),
  listId: z.string().optional(),
});

export const deleteCampaignSchema = z.object({
  campaignId: z.string(),
  // In-app path to navigate to after deletion (used when deleting the
  // campaign whose page is currently open, so the stale page never re-renders).
  redirectTo: z.string().startsWith("/").optional(),
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
