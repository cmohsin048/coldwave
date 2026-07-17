CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'scheduled', 'active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."email_verification" AS ENUM('unknown', 'valid', 'invalid', 'catch_all', 'risky', 'disposable');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'paused', 'completed', 'replied', 'bounced', 'unsubscribed', 'finished', 'failed');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('sent', 'delivered', 'open', 'click', 'reply', 'bounce', 'spam_complaint', 'unsubscribe', 'failed');--> statement-breakpoint
CREATE TYPE "public"."funnel_stage" AS ENUM('awareness', 'interest', 'demo', 'close');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'verified', 'invalid', 'risky', 'enriched', 'contacted', 'replied', 'bounced', 'unsubscribed', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."mailbox_provider" AS ENUM('gmail', 'google_workspace', 'outlook', 'office365', 'smtp');--> statement-breakpoint
CREATE TYPE "public"."mailbox_status" AS ENUM('connecting', 'active', 'warming', 'paused', 'error', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'scheduled', 'sending', 'sent', 'delivered', 'bounced', 'failed', 'opened', 'clicked', 'replied');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."step_type" AS ENUM('email', 'wait', 'condition');--> statement-breakpoint
CREATE TYPE "public"."suppression_reason" AS ENUM('unsubscribe', 'bounce', 'spam_complaint', 'manual', 'already_contacted');--> statement-breakpoint
CREATE TYPE "public"."suppression_scope" AS ENUM('global', 'campaign');--> statement-breakpoint
CREATE TYPE "public"."usage_metric" AS ENUM('email_sent', 'lead_enriched');--> statement-breakpoint
CREATE TYPE "public"."warmup_status" AS ENUM('disabled', 'ramping', 'maintaining', 'paused');--> statement-breakpoint
CREATE TABLE "account" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"password_hash" text,
	"active_org_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_token" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "org_role" DEFAULT 'member' NOT NULL,
	"token" text NOT NULL,
	"invited_by_user_id" text,
	"accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "org_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"company_address" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "mailbox" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"domain_id" text,
	"provider" "mailbox_provider" DEFAULT 'smtp' NOT NULL,
	"status" "mailbox_status" DEFAULT 'connecting' NOT NULL,
	"email" text NOT NULL,
	"from_name" text,
	"smtp_host" text,
	"smtp_port" integer,
	"smtp_secure" boolean DEFAULT true,
	"imap_host" text,
	"imap_port" integer,
	"imap_secure" boolean DEFAULT true,
	"encrypted_credentials" text,
	"daily_send_limit" integer DEFAULT 40 NOT NULL,
	"hourly_send_limit" integer DEFAULT 10 NOT NULL,
	"min_delay_seconds" integer DEFAULT 30 NOT NULL,
	"max_delay_seconds" integer DEFAULT 180 NOT NULL,
	"sent_today" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sending_domain" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"domain" text NOT NULL,
	"spf_valid" boolean,
	"dkim_valid" boolean,
	"dmarc_valid" boolean,
	"rdns_valid" boolean,
	"blacklists" jsonb DEFAULT '[]'::jsonb,
	"health_score" integer,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warmup_config" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"mailbox_id" text NOT NULL,
	"status" "warmup_status" DEFAULT 'disabled' NOT NULL,
	"start_volume" integer DEFAULT 2 NOT NULL,
	"daily_increment" integer DEFAULT 2 NOT NULL,
	"max_volume" integer DEFAULT 40 NOT NULL,
	"current_volume" integer DEFAULT 2 NOT NULL,
	"reply_rate" integer DEFAULT 30 NOT NULL,
	"business_hours_only" boolean DEFAULT true NOT NULL,
	"weekend_reduction" boolean DEFAULT true NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warmup_config_mailbox_id_unique" UNIQUE("mailbox_id")
);
--> statement-breakpoint
CREATE TABLE "lead_list" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"search_filters" jsonb,
	"source" text DEFAULT 'apollo' NOT NULL,
	"lead_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"list_id" text,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"full_name" text,
	"title" text,
	"seniority" text,
	"linkedin_url" text,
	"company_name" text,
	"company_domain" text,
	"industry" text,
	"headcount" integer,
	"location" text,
	"country" text,
	"tech_stack" jsonb DEFAULT '[]'::jsonb,
	"apollo_person_id" text,
	"apollo_org_id" text,
	"enrichment" jsonb,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"verification" "email_verification" DEFAULT 'unknown' NOT NULL,
	"verified_at" timestamp with time zone,
	"custom_fields" jsonb,
	"last_contacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_enrollment" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"assigned_mailbox_id" text,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"current_step_id" text,
	"current_stage" "funnel_stage" DEFAULT 'awareness' NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_step_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"brief" jsonb,
	"mailbox_pool" jsonb DEFAULT '[]'::jsonb,
	"send_per_timezone" boolean DEFAULT true NOT NULL,
	"daily_cap" integer,
	"track_opens" boolean DEFAULT true NOT NULL,
	"track_clicks" boolean DEFAULT true NOT NULL,
	"scheduled_start_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funnel_stage_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"stage" "funnel_stage" NOT NULL,
	"entered" integer DEFAULT 0 NOT NULL,
	"converted" integer DEFAULT 0 NOT NULL,
	"conversion_rate" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_step" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"type" "step_type" DEFAULT 'email' NOT NULL,
	"stage" "funnel_stage" DEFAULT 'awareness' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"subject" text,
	"body" text,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"delay_hours" integer DEFAULT 0 NOT NULL,
	"next_step_id" text,
	"next_if_replied" text,
	"next_if_opened" text,
	"next_if_no_open" text,
	"position" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_variant" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"step_id" text NOT NULL,
	"label" text DEFAULT 'A' NOT NULL,
	"subject" text,
	"body" text,
	"weight" integer DEFAULT 50 NOT NULL,
	"is_winner" boolean DEFAULT false NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"opens" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"replies" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_event" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"message_id" text,
	"campaign_id" text,
	"lead_id" text,
	"type" "event_type" NOT NULL,
	"meta" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"direction" "message_direction" DEFAULT 'outbound' NOT NULL,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"campaign_id" text,
	"step_id" text,
	"enrollment_id" text,
	"lead_id" text,
	"mailbox_id" text,
	"from_email" text,
	"to_email" text,
	"subject" text,
	"body" text,
	"message_id_header" text,
	"in_reply_to" text,
	"references" text,
	"spam_score" real,
	"spam_report" jsonb,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_token" (
	"token" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"message_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_url" text,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"scope" "suppression_scope" DEFAULT 'global' NOT NULL,
	"campaign_id" text,
	"email" text NOT NULL,
	"reason" "suppression_reason" DEFAULT 'manual' NOT NULL,
	"suppressed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warmup_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"mailbox_id" text NOT NULL,
	"day" date NOT NULL,
	"provider" text DEFAULT 'all' NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"received" integer DEFAULT 0 NOT NULL,
	"inbox" integer DEFAULT 0 NOT NULL,
	"spam" integer DEFAULT 0 NOT NULL,
	"saved_from_spam" integer DEFAULT 0 NOT NULL,
	"replied" integer DEFAULT 0 NOT NULL,
	"inbox_rate" real DEFAULT 0 NOT NULL,
	"reputation_score" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spam_check" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"campaign_id" text,
	"step_id" text,
	"score" real NOT NULL,
	"passed" text DEFAULT 'true' NOT NULL,
	"breakdown" jsonb,
	"suggestions" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_record" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"metric" "usage_metric" NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"reference" text,
	"reported_at" timestamp with time zone,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox" ADD CONSTRAINT "mailbox_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox" ADD CONSTRAINT "mailbox_domain_id_sending_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."sending_domain"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sending_domain" ADD CONSTRAINT "sending_domain_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_config" ADD CONSTRAINT "warmup_config_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_config" ADD CONSTRAINT "warmup_config_mailbox_id_mailbox_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_list" ADD CONSTRAINT "lead_list_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_list" ADD CONSTRAINT "lead_list_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_list_id_lead_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lead_list"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_enrollment" ADD CONSTRAINT "campaign_enrollment_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_enrollment" ADD CONSTRAINT "campaign_enrollment_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_enrollment" ADD CONSTRAINT "campaign_enrollment_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_enrollment" ADD CONSTRAINT "campaign_enrollment_assigned_mailbox_id_mailbox_id_fk" FOREIGN KEY ("assigned_mailbox_id") REFERENCES "public"."mailbox"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_enrollment" ADD CONSTRAINT "campaign_enrollment_current_step_id_sequence_step_id_fk" FOREIGN KEY ("current_step_id") REFERENCES "public"."sequence_step"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funnel_stage_stats" ADD CONSTRAINT "funnel_stage_stats_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funnel_stage_stats" ADD CONSTRAINT "funnel_stage_stats_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_step" ADD CONSTRAINT "sequence_step_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_step" ADD CONSTRAINT "sequence_step_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_variant" ADD CONSTRAINT "step_variant_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_variant" ADD CONSTRAINT "step_variant_step_id_sequence_step_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."sequence_step"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_event" ADD CONSTRAINT "message_event_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_event" ADD CONSTRAINT "message_event_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_event" ADD CONSTRAINT "message_event_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_event" ADD CONSTRAINT "message_event_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_step_id_sequence_step_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."sequence_step"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_enrollment_id_campaign_enrollment_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."campaign_enrollment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_mailbox_id_mailbox_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailbox"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_token" ADD CONSTRAINT "tracking_token_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_token" ADD CONSTRAINT "tracking_token_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression" ADD CONSTRAINT "suppression_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression" ADD CONSTRAINT "suppression_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_stats" ADD CONSTRAINT "warmup_stats_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_stats" ADD CONSTRAINT "warmup_stats_mailbox_id_mailbox_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spam_check" ADD CONSTRAINT "spam_check_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spam_check" ADD CONSTRAINT "spam_check_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spam_check" ADD CONSTRAINT "spam_check_step_id_sequence_step_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."sequence_step"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_record" ADD CONSTRAINT "usage_record_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_org_email_idx" ON "invitation" USING btree ("org_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_org_user_unique" ON "membership" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mailbox_org_idx" ON "mailbox" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "mailbox_email_idx" ON "mailbox" USING btree ("email");--> statement-breakpoint
CREATE INDEX "sending_domain_org_idx" ON "sending_domain" USING btree ("org_id","domain");--> statement-breakpoint
CREATE INDEX "lead_list_org_idx" ON "lead_list" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_org_email_unique" ON "lead" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "lead_org_idx" ON "lead" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lead_list_idx" ON "lead" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "lead_status_idx" ON "lead" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "lead_company_domain_idx" ON "lead" USING btree ("company_domain");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_campaign_lead_unique" ON "campaign_enrollment" USING btree ("campaign_id","lead_id");--> statement-breakpoint
CREATE INDEX "enrollment_due_idx" ON "campaign_enrollment" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "campaign_org_idx" ON "campaign" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "campaign_status_idx" ON "campaign" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "funnel_stage_campaign_unique" ON "funnel_stage_stats" USING btree ("campaign_id","stage");--> statement-breakpoint
CREATE INDEX "sequence_step_campaign_idx" ON "sequence_step" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "step_variant_step_idx" ON "step_variant" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "message_event_message_idx" ON "message_event" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_event_campaign_type_idx" ON "message_event" USING btree ("campaign_id","type");--> statement-breakpoint
CREATE INDEX "message_org_idx" ON "message" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "message_campaign_idx" ON "message" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "message_lead_idx" ON "message" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "message_msgid_idx" ON "message" USING btree ("message_id_header");--> statement-breakpoint
CREATE INDEX "message_status_idx" ON "message" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "tracking_token_message_idx" ON "tracking_token" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_unique" ON "suppression" USING btree ("org_id","scope","campaign_id","email");--> statement-breakpoint
CREATE INDEX "suppression_org_email_idx" ON "suppression" USING btree ("org_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "warmup_stats_unique" ON "warmup_stats" USING btree ("mailbox_id","day","provider");--> statement-breakpoint
CREATE INDEX "warmup_stats_mailbox_idx" ON "warmup_stats" USING btree ("mailbox_id");--> statement-breakpoint
CREATE INDEX "spam_check_org_idx" ON "spam_check" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "spam_check_campaign_idx" ON "spam_check" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "usage_org_metric_idx" ON "usage_record" USING btree ("org_id","metric","occurred_at");--> statement-breakpoint
CREATE INDEX "usage_unreported_idx" ON "usage_record" USING btree ("reported_at");