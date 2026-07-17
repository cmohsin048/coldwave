import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { suppressions } from "@/db/schema";
import { normalizeEmail } from "@/lib/utils";

/** True if the email is suppressed globally or for this specific campaign. */
export async function isSuppressed(
  orgId: string,
  email: string,
  campaignId?: string
): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const row = await db.query.suppressions.findFirst({
    where: and(
      eq(suppressions.orgId, orgId),
      eq(suppressions.email, normalized),
      campaignId
        ? or(
            eq(suppressions.scope, "global"),
            and(
              eq(suppressions.scope, "campaign"),
              eq(suppressions.campaignId, campaignId)
            )
          )
        : eq(suppressions.scope, "global")
    ),
  });
  return !!row;
}

/** Add a suppression (unsubscribe, bounce, complaint, manual). */
export async function addSuppression(params: {
  orgId: string;
  email: string;
  reason: "unsubscribe" | "bounce" | "spam_complaint" | "manual" | "already_contacted";
  scope?: "global" | "campaign";
  campaignId?: string;
}): Promise<void> {
  await db
    .insert(suppressions)
    .values({
      orgId: params.orgId,
      email: normalizeEmail(params.email),
      reason: params.reason,
      scope: params.scope ?? "global",
      campaignId: params.campaignId ?? null,
    })
    .onConflictDoNothing();
}
