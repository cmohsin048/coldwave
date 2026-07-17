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
