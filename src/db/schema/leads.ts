import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_helpers";
import { leadStatus, emailVerification } from "./enums";
import { organizations } from "./orgs";
import { users } from "./auth";

export const leadLists = pgTable(
  "lead_list",
  {
    id: primaryId("list"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // The Apollo search filters used to build this list (for re-running).
    searchFilters: jsonb("search_filters").$type<Record<string, unknown>>(),
    source: text("source").notNull().default("apollo"), // apollo | csv | manual
    leadCount: integer("lead_count").notNull().default(0),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("lead_list_org_idx").on(t.orgId),
  })
);

export const leads = pgTable(
  "lead",
  {
    id: primaryId("lead"),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    listId: text("list_id").references(() => leadLists.id, {
      onDelete: "set null",
    }),

    // Normalized email used for dedupe (lowercased).
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    fullName: text("full_name"),
    title: text("title"),
    seniority: text("seniority"),
    linkedinUrl: text("linkedin_url"),

    // Company / organization.
    companyName: text("company_name"),
    companyDomain: text("company_domain"),
    industry: text("industry"),
    headcount: integer("headcount"),
    location: text("location"),
    country: text("country"),
    techStack: jsonb("tech_stack").$type<string[]>().default([]),

    // Provenance + enrichment.
    apolloPersonId: text("apollo_person_id"),
    apolloOrgId: text("apollo_org_id"),
    enrichment: jsonb("enrichment").$type<Record<string, unknown>>(),

    status: leadStatus("status").notNull().default("new"),
    verification: emailVerification("verification")
      .notNull()
      .default("unknown"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),

    // Custom merge fields for templating/spintax.
    customFields: jsonb("custom_fields").$type<Record<string, string>>(),

    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    // Dedupe: one lead per email per org.
    orgEmailUnique: uniqueIndex("lead_org_email_unique").on(t.orgId, t.email),
    orgIdx: index("lead_org_idx").on(t.orgId),
    listIdx: index("lead_list_idx").on(t.listId),
    statusIdx: index("lead_status_idx").on(t.orgId, t.status),
    companyDomainIdx: index("lead_company_domain_idx").on(t.companyDomain),
  })
);

export type LeadList = typeof leadLists.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
