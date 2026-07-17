import {
  pgTable,
  text,
  integer,
  real,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_helpers";
import { organizations } from "./orgs";
import { mailboxes } from "./mailboxes";

/**
 * Daily warmup + deliverability stats per mailbox, broken down by recipient
 * provider so the dashboard can chart inbox vs spam placement for
 * Gmail/Outlook/Yahoo and a reputation trend over time.
 */
export const warmupStats = pgTable(
  "warmup_stats",
  {
    id: primaryId("wst"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    provider: text("provider").notNull().default("all"), // gmail | outlook | yahoo | all

    sent: integer("sent").notNull().default(0),
    received: integer("received").notNull().default(0),
    inbox: integer("inbox").notNull().default(0),
    spam: integer("spam").notNull().default(0),
    savedFromSpam: integer("saved_from_spam").notNull().default(0),
    replied: integer("replied").notNull().default(0),

    inboxRate: real("inbox_rate").notNull().default(0),
    reputationScore: real("reputation_score"), // 0-100 trend metric
    ...timestamps,
  },
  (t) => ({
    uniqueIdx: uniqueIndex("warmup_stats_unique").on(
      t.mailboxId,
      t.day,
      t.provider
    ),
    mailboxIdx: index("warmup_stats_mailbox_idx").on(t.mailboxId),
  })
);

export type WarmupStats = typeof warmupStats.$inferSelect;
