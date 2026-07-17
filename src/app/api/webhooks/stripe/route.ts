import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getStripe, isStripeConfigured } from "@/modules/billing/stripe";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook: keeps org subscription state in sync. Verifies the signature
 * with STRIPE_WEBHOOK_SECRET against the raw request body.
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "stripe not configured" }, { status: 503 });
  }
  const secret = getEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "no webhook secret" }, { status: 503 });
  }

  const stripe = getStripe();
  const sig = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    logger.warn("stripe signature verification failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as {
        client_reference_id?: string | null;
        customer?: string | null;
        subscription?: string | null;
      };
      // Link the org to its customer + subscription the moment checkout lands.
      if (session.client_reference_id) {
        await db
          .update(organizations)
          .set({
            stripeCustomerId: session.customer ?? undefined,
            stripeSubscriptionId: session.subscription ?? undefined,
          })
          .where(eq(organizations.id, session.client_reference_id));
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as {
        id: string;
        customer: string;
        status: string;
      };
      await db
        .update(organizations)
        .set({
          stripeSubscriptionId:
            event.type === "customer.subscription.deleted" ? null : sub.id,
        })
        .where(eq(organizations.stripeCustomerId, sub.customer));
      break;
    }
    default:
      // Ignore unhandled event types.
      break;
  }

  return NextResponse.json({ received: true });
}
