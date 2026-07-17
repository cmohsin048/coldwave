import {
  pgTable,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_helpers";
import { usageMetric } from "./enums";
import { organizations } from "./orgs";

/**
 * Metered usage events for Stripe billing (emails sent + leads enriched).
 * Aggregated and reported to Stripe by a scheduled job; `reportedAt` marks
 * records already pushed so we never double-bill.
 */
export const usageRecords = pgTable(
  "usage_record",
  {
    id: primaryId("use"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    metric: usageMetric("metric").notNull(),
    quantity: integer("quantity").notNull().default(1),
    // Free-form reference (campaign id, lead id) for auditing.
    reference: text("reference"),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (t) => ({
    orgMetricIdx: index("usage_org_metric_idx").on(
      t.orgId,
      t.metric,
      t.occurredAt
    ),
    unreportedIdx: index("usage_unreported_idx").on(t.reportedAt),
  })
);

export type UsageRecord = typeof usageRecords.$inferSelect;
