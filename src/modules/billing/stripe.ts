import Stripe from "stripe";
import { and, isNull, sql, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { usageRecords, organizations } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

let client: Stripe | null = null;
export function getStripe(): Stripe {
  if (client) return client;
  const key = getEnv().STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  client = new Stripe(key);
  return client;
}

export function isStripeConfigured(): boolean {
  return !!getEnv().STRIPE_SECRET_KEY;
}

/**
 * Get (or lazily create) the Stripe customer for an org, persisting the id so
 * usage reporting and webhooks can key on it.
 */
export async function ensureStripeCustomer(orgId: string): Promise<string> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });
  if (!org) throw new Error("Organization not found");
  if (org.stripeCustomerId) return org.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: org.name,
    metadata: { orgId: org.id },
  });
  await db
    .update(organizations)
    .set({ stripeCustomerId: customer.id })
    .where(eq(organizations.id, orgId));
  return customer.id;
}

/**
 * Create a subscription Checkout session for the metered plan (emails sent +
 * leads enriched meters). Returns the hosted checkout URL.
 */
export async function createCheckoutSession(orgId: string): Promise<string> {
  const env = getEnv();
  const prices = [env.STRIPE_PRICE_ID_EMAILS, env.STRIPE_PRICE_ID_LEADS].filter(
    (p): p is string => !!p
  );
  if (prices.length === 0) {
    throw new Error(
      "No Stripe prices configured. Set STRIPE_PRICE_ID_EMAILS / STRIPE_PRICE_ID_LEADS."
    );
  }

  const customer = await ensureStripeCustomer(orgId);
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: orgId,
    // Metered prices must not carry a quantity.
    line_items: prices.map((price) => ({ price })),
    success_url: `${env.APP_URL}/settings?billing=success`,
    cancel_url: `${env.APP_URL}/settings?billing=cancelled`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

/** Create a customer-portal session (manage/cancel subscription, invoices). */
export async function createPortalSession(orgId: string): Promise<string> {
  const env = getEnv();
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });
  if (!org?.stripeCustomerId) {
    throw new Error("No billing account yet — subscribe first.");
  }
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${env.APP_URL}/settings`,
  });
  return session.url;
}

/**
 * Aggregate unreported usage per org + metric and push to Stripe as meter
 * events (metered billing for emails sent + leads enriched), then mark the
 * records reported so we never double-bill. Safe no-op if Stripe isn't set up.
 */
export async function reportUsageToStripe(): Promise<{ reported: number }> {
  if (!isStripeConfigured()) return { reported: 0 };
  const stripe = getStripe();

  const unreported = await db
    .select({
      id: usageRecords.id,
      orgId: usageRecords.orgId,
      metric: usageRecords.metric,
      quantity: usageRecords.quantity,
    })
    .from(usageRecords)
    .where(isNull(usageRecords.reportedAt))
    .limit(5000);

  if (unreported.length === 0) return { reported: 0 };

  // Aggregate quantity per (org, metric).
  const agg = new Map<string, { orgId: string; metric: string; qty: number; ids: string[] }>();
  for (const r of unreported) {
    const key = `${r.orgId}:${r.metric}`;
    const entry = agg.get(key) ?? { orgId: r.orgId, metric: r.metric, qty: 0, ids: [] };
    entry.qty += r.quantity;
    entry.ids.push(r.id);
    agg.set(key, entry);
  }

  const orgs = await db
    .select({ id: organizations.id, customer: organizations.stripeCustomerId })
    .from(organizations)
    .where(
      inArray(
        organizations.id,
        [...new Set(unreported.map((r) => r.orgId))]
      )
    );
  const customerByOrg = new Map(orgs.map((o) => [o.id, o.customer]));

  let reported = 0;
  for (const entry of agg.values()) {
    const customer = customerByOrg.get(entry.orgId);
    if (!customer) continue; // org not billed yet
    try {
      // Stripe Billing Meters API: one event carrying the aggregate quantity.
      await stripe.billing.meterEvents.create({
        event_name: entry.metric, // configure a meter named "email_sent" / "lead_enriched"
        payload: {
          stripe_customer_id: customer,
          value: String(entry.qty),
        },
      });
      await db
        .update(usageRecords)
        .set({ reportedAt: new Date() })
        .where(inArray(usageRecords.id, entry.ids));
      reported += entry.ids.length;
    } catch (err) {
      logger.error("stripe usage report failed", {
        org: entry.orgId,
        metric: entry.metric,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { reported };
}

/** Current billing-period usage totals for an org (for the settings UI). */
export async function getUsageTotals(orgId: string) {
  const rows = await db
    .select({
      metric: usageRecords.metric,
      total: sql<number>`sum(${usageRecords.quantity})::int`,
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.orgId, orgId),
        sql`${usageRecords.occurredAt} >= date_trunc('month', now())`
      )
    )
    .groupBy(usageRecords.metric);

  const totals = { email_sent: 0, lead_enriched: 0 };
  for (const r of rows) {
    if (r.metric in totals) totals[r.metric as keyof typeof totals] = r.total ?? 0;
  }
  return totals;
}
