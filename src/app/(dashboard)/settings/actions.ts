"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import {
  organizations,
  suppressions,
  invitations,
  memberships,
} from "@/db/schema";
import { action } from "@/lib/action";
import { normalizeEmail } from "@/lib/utils";
import { getEnv } from "@/lib/env";
import {
  createCheckoutSession,
  createPortalSession,
  isStripeConfigured,
} from "@/modules/billing/stripe";

export const updateOrgSettings = action(
  z.object({
    name: z.string().min(1).max(120),
    companyAddress: z.string().max(300).optional(),
  }),
  async (input, ctx) => {
    await db
      .update(organizations)
      .set({ name: input.name, companyAddress: input.companyAddress })
      .where(eq(organizations.id, ctx.orgId));
    revalidatePath("/settings");
    return { updated: true };
  },
  { role: "admin" }
);

/** Start a metered-billing subscription via Stripe Checkout. */
export const startCheckout = action(
  z.object({}),
  async (_input, ctx) => {
    if (!isStripeConfigured()) {
      throw new Error("Billing is not configured on this deployment.");
    }
    const url = await createCheckoutSession(ctx.orgId);
    return { url };
  },
  { role: "admin" }
);

/** Open the Stripe customer portal (invoices, payment method, cancel). */
export const openBillingPortal = action(
  z.object({}),
  async (_input, ctx) => {
    if (!isStripeConfigured()) {
      throw new Error("Billing is not configured on this deployment.");
    }
    const url = await createPortalSession(ctx.orgId);
    return { url };
  },
  { role: "admin" }
);

/**
 * Invite a teammate. Creates a single-use invitation valid for 7 days and
 * returns the invite link to share (system email delivery is optional — the
 * link works either way).
 */
export const inviteMember = action(
  z.object({
    email: z.string().email(),
    role: z.enum(["admin", "member"]).default("member"),
  }),
  async (input, ctx) => {
    const email = normalizeEmail(input.email);
    const token = nanoid(32);
    await db.insert(invitations).values({
      orgId: ctx.orgId,
      email,
      role: input.role,
      token,
      invitedByUserId: ctx.userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    revalidatePath("/settings");
    return { inviteUrl: `${getEnv().APP_URL}/invite/${token}` };
  },
  { role: "admin" }
);

/** Revoke a pending invitation. */
export const revokeInvitation = action(
  z.object({ invitationId: z.string() }),
  async (input, ctx) => {
    await db
      .delete(invitations)
      .where(
        and(
          eq(invitations.id, input.invitationId),
          eq(invitations.orgId, ctx.orgId)
        )
      );
    revalidatePath("/settings");
    return { revoked: true };
  },
  { role: "admin" }
);

/** Remove a member from the org (owners can't be removed; nor yourself). */
export const removeMember = action(
  z.object({ membershipId: z.string() }),
  async (input, ctx) => {
    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.id, input.membershipId),
        eq(memberships.orgId, ctx.orgId)
      ),
    });
    if (!membership) throw new Error("Member not found");
    if (membership.role === "owner")
      throw new Error("The owner cannot be removed");
    if (membership.userId === ctx.userId)
      throw new Error("You cannot remove yourself");

    await db.delete(memberships).where(eq(memberships.id, membership.id));
    revalidatePath("/settings");
    return { removed: true };
  },
  { role: "admin" }
);

export const addSuppressionEntry = action(
  z.object({ email: z.string().email() }),
  async (input, ctx) => {
    await db
      .insert(suppressions)
      .values({
        orgId: ctx.orgId,
        email: normalizeEmail(input.email),
        scope: "global",
        reason: "manual",
      })
      .onConflictDoNothing();
    revalidatePath("/settings");
    return { added: true };
  }
);
