import { relations } from "drizzle-orm";
import { organizations, memberships, invitations } from "./orgs";
import { users, accounts, sessions } from "./auth";
import {
  sendingDomains,
  mailboxes,
  warmupConfigs,
} from "./mailboxes";
import { leadLists, leads } from "./leads";
import {
  campaigns,
  sequenceSteps,
  stepVariants,
  campaignEnrollments,
} from "./campaigns";
import { messages, messageEvents } from "./messages";
import { warmupStats } from "./warmup";

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  accounts: many(accounts),
  sessions: many(sessions),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  invitations: many(invitations),
  domains: many(sendingDomains),
  mailboxes: many(mailboxes),
  leadLists: many(leadLists),
  leads: many(leads),
  campaigns: many(campaigns),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [memberships.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [memberships.userId],
    references: [users.id],
  }),
}));

export const sendingDomainsRelations = relations(
  sendingDomains,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [sendingDomains.orgId],
      references: [organizations.id],
    }),
    mailboxes: many(mailboxes),
  })
);

export const mailboxesRelations = relations(mailboxes, ({ one }) => ({
  organization: one(organizations, {
    fields: [mailboxes.orgId],
    references: [organizations.id],
  }),
  domain: one(sendingDomains, {
    fields: [mailboxes.domainId],
    references: [sendingDomains.id],
  }),
  warmup: one(warmupConfigs, {
    fields: [mailboxes.id],
    references: [warmupConfigs.mailboxId],
  }),
}));

export const warmupConfigsRelations = relations(warmupConfigs, ({ one }) => ({
  mailbox: one(mailboxes, {
    fields: [warmupConfigs.mailboxId],
    references: [mailboxes.id],
  }),
}));

export const warmupStatsRelations = relations(warmupStats, ({ one }) => ({
  mailbox: one(mailboxes, {
    fields: [warmupStats.mailboxId],
    references: [mailboxes.id],
  }),
}));

export const leadListsRelations = relations(leadLists, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [leadLists.orgId],
    references: [organizations.id],
  }),
  leads: many(leads),
}));

export const leadsRelations = relations(leads, ({ one }) => ({
  organization: one(organizations, {
    fields: [leads.orgId],
    references: [organizations.id],
  }),
  list: one(leadLists, {
    fields: [leads.listId],
    references: [leadLists.id],
  }),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [campaigns.orgId],
    references: [organizations.id],
  }),
  steps: many(sequenceSteps),
  enrollments: many(campaignEnrollments),
}));

export const sequenceStepsRelations = relations(
  sequenceSteps,
  ({ one, many }) => ({
    campaign: one(campaigns, {
      fields: [sequenceSteps.campaignId],
      references: [campaigns.id],
    }),
    variants: many(stepVariants),
  })
);

export const stepVariantsRelations = relations(stepVariants, ({ one }) => ({
  step: one(sequenceSteps, {
    fields: [stepVariants.stepId],
    references: [sequenceSteps.id],
  }),
}));

export const campaignEnrollmentsRelations = relations(
  campaignEnrollments,
  ({ one }) => ({
    campaign: one(campaigns, {
      fields: [campaignEnrollments.campaignId],
      references: [campaigns.id],
    }),
    lead: one(leads, {
      fields: [campaignEnrollments.leadId],
      references: [leads.id],
    }),
    mailbox: one(mailboxes, {
      fields: [campaignEnrollments.assignedMailboxId],
      references: [mailboxes.id],
    }),
  })
);

export const messagesRelations = relations(messages, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [messages.orgId],
    references: [organizations.id],
  }),
  campaign: one(campaigns, {
    fields: [messages.campaignId],
    references: [campaigns.id],
  }),
  lead: one(leads, {
    fields: [messages.leadId],
    references: [leads.id],
  }),
  mailbox: one(mailboxes, {
    fields: [messages.mailboxId],
    references: [mailboxes.id],
  }),
  events: many(messageEvents),
}));

export const messageEventsRelations = relations(messageEvents, ({ one }) => ({
  message: one(messages, {
    fields: [messageEvents.messageId],
    references: [messages.id],
  }),
}));
