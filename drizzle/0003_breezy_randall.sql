CREATE TYPE "public"."reply_sentiment" AS ENUM('positive', 'neutral', 'negative');--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "sentiment" "reply_sentiment";--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "sentiment_summary" text;