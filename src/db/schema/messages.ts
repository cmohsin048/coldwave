import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  real,
  integer,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_helpers";
import {
  messageDirection,
  messageStatus,
  eventType,
} from "./enums";
import { organizations } from "./orgs";
import {
  campaigns,
  sequenceSteps,
  stepVariants,
  campaignEnrollments,
} from "./campaigns";
import { leads } from "./leads";
import { mailboxes } from "./mailboxes";

/**
 * Every outbound send and inbound reply. Outbound rows carry the spam-engine
 * score and the rendered content actually sent (post-spintax).
 */
export const messages = pgTable(
  "message",
  {
    id: primaryId("msg"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    direction: messageDirection("direction").notNull().default("outbound"),
    status: messageStatus("status").notNull().default("queued"),

    campaignId: text("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    stepId: text("step_id").references(() => sequenceSteps.id, {
      onDelete: "set null",
    }),
    // A/B variant actually sent (for winner selection stats).
    variantId: text("variant_id").references(() => stepVariants.id, {
      onDelete: "set null",
    }),
    enrollmentId: text("enrollment_id").references(
      () => campaignEnrollments.id,
      { onDelete: "set null" }
    ),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    mailboxId: text("mailbox_id").references(() => mailboxes.id, {
      onDelete: "set null",
    }),

    fromEmail: text("from_email"),
    toEmail: text("to_email"),
    subject: text("subject"),
    body: text("body"),
    // RFC5322 Message-ID + threading headers for reply detection.
    messageIdHeader: text("message_id_header"),
    inReplyTo: text("in_reply_to"),
    references: text("references"),

    // Spam engine result at send time.
    spamScore: real("spam_score"),
    spamReport: jsonb("spam_report").$type<Record<string, unknown>>(),

    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("message_org_idx").on(t.orgId),
    campaignIdx: index("message_campaign_idx").on(t.campaignId),
    leadIdx: index("message_lead_idx").on(t.leadId),
    messageIdHeaderIdx: index("message_msgid_idx").on(t.messageIdHeader),
    statusIdx: index("message_status_idx").on(t.orgId, t.status),
  })
);

/** Engagement + delivery events (opens, clicks, bounces, replies, etc.). */
export const messageEvents = pgTable(
  "message_event",
  {
    id: primaryId("evt"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => messages.id, {
      onDelete: "cascade",
    }),
    campaignId: text("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    type: eventType("type").notNull(),
    // Optional context: url for clicks, bounce type, user-agent, ip, etc.
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    messageIdx: index("message_event_message_idx").on(t.messageId),
    campaignTypeIdx: index("message_event_campaign_type_idx").on(
      t.campaignId,
      t.type
    ),
  })
);

/**
 * Open/click tracking tokens. A pixel or wrapped link resolves a token back to
 * (org, message, lead) so we never expose internal ids in tracking URLs.
 */
export const trackingTokens = pgTable(
  "tracking_token",
  {
    token: text("token").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "open" | "click"
    targetUrl: text("target_url"), // for click tokens
    hits: integer("hits").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    messageIdx: index("tracking_token_message_idx").on(t.messageId),
  })
);

export type Message = typeof messages.$inferSelect;
export type MessageEvent = typeof messageEvents.$inferSelect;
