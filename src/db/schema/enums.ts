import { pgEnum } from "drizzle-orm/pg-core";

export const orgRole = pgEnum("org_role", ["owner", "admin", "member"]);

export const mailboxProvider = pgEnum("mailbox_provider", [
  "gmail",
  "google_workspace",
  "outlook",
  "office365",
  "smtp", // generic SMTP/IMAP
]);

export const mailboxStatus = pgEnum("mailbox_status", [
  "connecting",
  "active",
  "warming",
  "paused",
  "error",
  "disconnected",
]);

export const warmupStatus = pgEnum("warmup_status", [
  "disabled",
  "ramping",
  "maintaining",
  "paused",
]);

export const leadStatus = pgEnum("lead_status", [
  "new",
  "verified",
  "invalid",
  "risky",
  "enriched",
  "contacted",
  "replied",
  "bounced",
  "unsubscribed",
  "suppressed",
]);

export const emailVerification = pgEnum("email_verification", [
  "unknown",
  "valid",
  "invalid",
  "catch_all",
  "risky",
  "disposable",
]);

export const campaignStatus = pgEnum("campaign_status", [
  "draft",
  "scheduled",
  "active",
  "paused",
  "completed",
  "archived",
]);

export const funnelStage = pgEnum("funnel_stage", [
  "awareness",
  "interest",
  "demo",
  "close",
]);

export const stepType = pgEnum("step_type", [
  "email",
  "wait",
  "condition",
]);

export const enrollmentStatus = pgEnum("enrollment_status", [
  "active",
  "paused",
  "completed",
  "replied",
  "bounced",
  "unsubscribed",
  "finished",
  "failed",
]);

export const messageDirection = pgEnum("message_direction", [
  "outbound",
  "inbound",
]);

export const messageStatus = pgEnum("message_status", [
  "queued",
  "scheduled",
  "sending",
  "sent",
  "delivered",
  "bounced",
  "failed",
  "opened",
  "clicked",
  "replied",
]);

export const eventType = pgEnum("event_type", [
  "sent",
  "delivered",
  "open",
  "click",
  "reply",
  "bounce",
  "spam_complaint",
  "unsubscribe",
  "failed",
]);

export const suppressionScope = pgEnum("suppression_scope", [
  "global",
  "campaign",
]);

export const suppressionReason = pgEnum("suppression_reason", [
  "unsubscribe",
  "bounce",
  "spam_complaint",
  "manual",
  "already_contacted",
]);

export const usageMetric = pgEnum("usage_metric", [
  "email_sent",
  "lead_enriched",
]);
