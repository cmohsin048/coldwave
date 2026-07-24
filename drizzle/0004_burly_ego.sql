CREATE TYPE "public"."reply_notification_mode" AS ENUM('off', 'positive_only', 'all');--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "notification_email" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "reply_notification_mode" "reply_notification_mode" DEFAULT 'positive_only' NOT NULL;