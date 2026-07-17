import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_helpers";
import {
  mailboxProvider,
  mailboxStatus,
  warmupStatus,
} from "./enums";
import { organizations } from "./orgs";

/**
 * A sending domain groups mailboxes for rotation and tracks its auth health
 * (SPF/DKIM/DMARC/rDNS + blacklist status from the spam engine).
 */
export const sendingDomains = pgTable(
  "sending_domain",
  {
    id: primaryId("dom"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    // Cached DNS auth results (refreshed by a scheduled job).
    spfValid: boolean("spf_valid"),
    dkimValid: boolean("dkim_valid"),
    dmarcValid: boolean("dmarc_valid"),
    rdnsValid: boolean("rdns_valid"),
    blacklists: jsonb("blacklists").$type<string[]>().default([]),
    healthScore: integer("health_score"), // 0-100
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    orgDomainIdx: index("sending_domain_org_idx").on(t.orgId, t.domain),
  })
);

/**
 * A connected mailbox is the actual sending identity. SMTP/IMAP credentials
 * (or OAuth tokens) are stored encrypted at rest via AES-256-GCM — see the
 * `encryptedCredentials` column and `src/lib/mailbox-credentials.ts`.
 */
export const mailboxes = pgTable(
  "mailbox",
  {
    id: primaryId("mbx"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    domainId: text("domain_id").references(() => sendingDomains.id, {
      onDelete: "set null",
    }),
    provider: mailboxProvider("provider").notNull().default("smtp"),
    status: mailboxStatus("status").notNull().default("connecting"),

    email: text("email").notNull(),
    fromName: text("from_name"),

    // SMTP/IMAP connection settings (non-secret parts).
    smtpHost: text("smtp_host"),
    smtpPort: integer("smtp_port"),
    smtpSecure: boolean("smtp_secure").default(true),
    imapHost: text("imap_host"),
    imapPort: integer("imap_port"),
    imapSecure: boolean("imap_secure").default(true),

    // AES-256-GCM ciphertext of { smtpPass, imapPass, oauth } — never plaintext.
    encryptedCredentials: text("encrypted_credentials"),

    // Sending limits / rate control.
    dailySendLimit: integer("daily_send_limit").notNull().default(40),
    hourlySendLimit: integer("hourly_send_limit").notNull().default(10),
    minDelaySeconds: integer("min_delay_seconds").notNull().default(30),
    maxDelaySeconds: integer("max_delay_seconds").notNull().default(180),
    sentToday: integer("sent_today").notNull().default(0),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),

    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("mailbox_org_idx").on(t.orgId),
    emailIdx: index("mailbox_email_idx").on(t.email),
  })
);

/**
 * Per-mailbox warmup configuration + live state for the peer-to-peer warmup
 * network. Daily stats live in `warmupStats` (see warmup.ts).
 */
export const warmupConfigs = pgTable("warmup_config", {
  id: primaryId("wu"),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  mailboxId: text("mailbox_id")
    .notNull()
    .references(() => mailboxes.id, { onDelete: "cascade" })
    .unique(),
  status: warmupStatus("status").notNull().default("disabled"),
  startVolume: integer("start_volume").notNull().default(2),
  dailyIncrement: integer("daily_increment").notNull().default(2),
  maxVolume: integer("max_volume").notNull().default(40),
  currentVolume: integer("current_volume").notNull().default(2),
  replyRate: integer("reply_rate").notNull().default(30), // % of received warmup mail to reply to
  // Human-like timing controls.
  businessHoursOnly: boolean("business_hours_only").notNull().default(true),
  weekendReduction: boolean("weekend_reduction").notNull().default(true),
  timezone: text("timezone").notNull().default("America/New_York"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  ...timestamps,
});

export type Mailbox = typeof mailboxes.$inferSelect;
export type SendingDomain = typeof sendingDomains.$inferSelect;
export type WarmupConfig = typeof warmupConfigs.$inferSelect;
