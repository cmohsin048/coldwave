import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  real,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_helpers";
import {
  campaignStatus,
  funnelStage,
  stepType,
  enrollmentStatus,
} from "./enums";
import { organizations } from "./orgs";
import { leads } from "./leads";
import { mailboxes } from "./mailboxes";

export const campaigns = pgTable(
  "campaign",
  {
    id: primaryId("camp"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: campaignStatus("status").notNull().default("draft"),

    // AI designer inputs (ICP, product, tone, offer, goal) retained for regen.
    brief: jsonb("brief").$type<Record<string, unknown>>(),

    // Sending config.
    mailboxPool: jsonb("mailbox_pool").$type<string[]>().default([]), // mailbox ids to rotate
    sendPerTimezone: boolean("send_per_timezone").notNull().default(true),
    dailyCap: integer("daily_cap"),
    trackOpens: boolean("track_opens").notNull().default(true),
    trackClicks: boolean("track_clicks").notNull().default(true),

    scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("campaign_org_idx").on(t.orgId),
    statusIdx: index("campaign_status_idx").on(t.orgId, t.status),
  })
);

/**
 * A step in the sequence. React Flow nodes map 1:1 to rows here; `position`
 * holds the canvas coordinates, `next*` columns encode branch edges
 * (replied / opened / no-open).
 */
export const sequenceSteps = pgTable(
  "sequence_step",
  {
    id: primaryId("step"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),

    type: stepType("type").notNull().default("email"),
    stage: funnelStage("stage").notNull().default("awareness"),
    order: integer("order").notNull().default(0),

    // Email step content (subject/body may contain spintax + merge fields).
    subject: text("subject"),
    body: text("body"),

    // Wait step.
    delayDays: integer("delay_days").notNull().default(0),
    delayHours: integer("delay_hours").notNull().default(0),

    // Branch edges → next step id per outcome.
    nextStepId: text("next_step_id"),
    nextIfReplied: text("next_if_replied"),
    nextIfOpened: text("next_if_opened"),
    nextIfNoOpen: text("next_if_no_open"),

    // React Flow canvas position.
    position: jsonb("position").$type<{ x: number; y: number }>(),
    ...timestamps,
  },
  (t) => ({
    campaignIdx: index("sequence_step_campaign_idx").on(t.campaignId),
  })
);

/** A/B body/subject variants for a step, with winner auto-selection stats. */
export const stepVariants = pgTable(
  "step_variant",
  {
    id: primaryId("var"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stepId: text("step_id")
      .notNull()
      .references(() => sequenceSteps.id, { onDelete: "cascade" }),
    label: text("label").notNull().default("A"),
    subject: text("subject"),
    body: text("body"),
    weight: integer("weight").notNull().default(50),
    isWinner: boolean("is_winner").notNull().default(false),
    // Live counters for winner selection.
    sent: integer("sent").notNull().default(0),
    opens: integer("opens").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    replies: integer("replies").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    stepIdx: index("step_variant_step_idx").on(t.stepId),
  })
);

/** A lead enrolled into a campaign, tracking its position in the sequence. */
export const campaignEnrollments = pgTable(
  "campaign_enrollment",
  {
    id: primaryId("enr"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    assignedMailboxId: text("assigned_mailbox_id").references(
      () => mailboxes.id,
      { onDelete: "set null" }
    ),
    status: enrollmentStatus("status").notNull().default("active"),
    currentStepId: text("current_step_id").references(() => sequenceSteps.id, {
      onDelete: "set null",
    }),
    currentStage: funnelStage("current_stage").notNull().default("awareness"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastStepAt: timestamp("last_step_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    campaignLeadUnique: uniqueIndex("enrollment_campaign_lead_unique").on(
      t.campaignId,
      t.leadId
    ),
    dueIdx: index("enrollment_due_idx").on(t.status, t.nextRunAt),
  })
);

/** Per-stage conversion rollup for the funnel builder. */
export const funnelStageStats = pgTable(
  "funnel_stage_stats",
  {
    id: primaryId("fss"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    stage: funnelStage("stage").notNull(),
    entered: integer("entered").notNull().default(0),
    converted: integer("converted").notNull().default(0),
    conversionRate: real("conversion_rate").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    campaignStageIdx: uniqueIndex("funnel_stage_campaign_unique").on(
      t.campaignId,
      t.stage
    ),
  })
);

export type Campaign = typeof campaigns.$inferSelect;
export type SequenceStep = typeof sequenceSteps.$inferSelect;
export type StepVariant = typeof stepVariants.$inferSelect;
export type CampaignEnrollment = typeof campaignEnrollments.$inferSelect;
