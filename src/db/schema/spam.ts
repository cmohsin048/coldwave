import {
  pgTable,
  text,
  real,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_helpers";
import { organizations } from "./orgs";
import { campaigns, sequenceSteps } from "./campaigns";

/**
 * Persisted spam-engine results so we can show history and audit blocked sends.
 * The live pre-send check also runs on demand (see src/modules/spam).
 */
export const spamChecks = pgTable(
  "spam_check",
  {
    id: primaryId("spam"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").references(() => campaigns.id, {
      onDelete: "cascade",
    }),
    stepId: text("step_id").references(() => sequenceSteps.id, {
      onDelete: "cascade",
    }),

    // Normalized 0-10 score (10 = worst).
    score: real("score").notNull(),
    passed: text("passed").notNull().default("true"),

    // Breakdown: spamassassin, triggerWords, ratios, dns, blacklists, etc.
    breakdown: jsonb("breakdown").$type<Record<string, unknown>>(),
    suggestions: jsonb("suggestions").$type<string[]>().default([]),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("spam_check_org_idx").on(t.orgId),
    campaignIdx: index("spam_check_campaign_idx").on(t.campaignId),
  })
);

export type SpamCheck = typeof spamChecks.$inferSelect;
