import {
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_helpers";
import { orgRole } from "./enums";
import { users } from "./auth";

/**
 * Multi-tenancy root. Every domain table carries `orgId` and all queries are
 * scoped by it (application-level row isolation). See `src/lib/tenant.ts`.
 */

export const organizations = pgTable("organization", {
  id: primaryId("org"),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  // CAN-SPAM physical postal address included in every campaign footer.
  companyAddress: text("company_address"),
  // Stripe customer/subscription for metered billing.
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  ...timestamps,
});

export const memberships = pgTable(
  "membership",
  {
    id: primaryId("mem"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRole("role").notNull().default("member"),
    ...timestamps,
  },
  (t) => ({
    orgUserUnique: uniqueIndex("membership_org_user_unique").on(
      t.orgId,
      t.userId
    ),
    userIdx: index("membership_user_idx").on(t.userId),
  })
);

export const invitations = pgTable(
  "invitation",
  {
    id: primaryId("inv"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: orgRole("role").notNull().default("member"),
    token: text("token").notNull().unique(),
    invitedByUserId: text("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => ({
    orgEmailIdx: index("invitation_org_email_idx").on(t.orgId, t.email),
  })
);

export type Organization = typeof organizations.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
