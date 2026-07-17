import {
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_helpers";
import { suppressionScope, suppressionReason } from "./enums";
import { organizations } from "./orgs";
import { campaigns } from "./campaigns";

/**
 * Suppression list — global (org-wide) or per-campaign. Unsubscribes and spam
 * complaints land here and are honored on every send (CAN-SPAM / GDPR).
 */
export const suppressions = pgTable(
  "suppression",
  {
    id: primaryId("sup"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    scope: suppressionScope("scope").notNull().default("global"),
    campaignId: text("campaign_id").references(() => campaigns.id, {
      onDelete: "cascade",
    }),
    email: text("email").notNull(), // normalized (lowercased)
    reason: suppressionReason("reason").notNull().default("manual"),
    // For "unsubscribe honored within 24h" compliance auditing.
    suppressedAt: timestamp("suppressed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (t) => ({
    // One suppression per (org, scope, campaign, email).
    uniqueIdx: uniqueIndex("suppression_unique").on(
      t.orgId,
      t.scope,
      t.campaignId,
      t.email
    ),
    orgEmailIdx: index("suppression_org_email_idx").on(t.orgId, t.email),
  })
);

export type Suppression = typeof suppressions.$inferSelect;
