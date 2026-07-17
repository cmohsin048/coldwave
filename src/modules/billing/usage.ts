import { db } from "@/db";
import { usageRecords } from "@/db/schema";

/**
 * Record a metered usage event. A scheduled job aggregates unreported records
 * and pushes them to Stripe (see src/modules/billing/stripe.ts).
 */
export async function recordUsage(params: {
  orgId: string;
  metric: "email_sent" | "lead_enriched";
  quantity?: number;
  reference?: string;
}): Promise<void> {
  await db.insert(usageRecords).values({
    orgId: params.orgId,
    metric: params.metric,
    quantity: params.quantity ?? 1,
    reference: params.reference,
  });
}
