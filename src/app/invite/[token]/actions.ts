"use server";

import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { invitations, memberships, users } from "@/db/schema";
import { normalizeEmail } from "@/lib/utils";

export type AcceptResult =
  | { ok: true; orgId: string }
  | { ok: false; error: string };

/**
 * Accept a team invitation. Deliberately NOT wrapped in the org-scoped
 * `action()` helper — the whole point is joining an org the user isn't a
 * member of yet. Requires only an authenticated session whose email matches
 * the invitation.
 */
export async function acceptInvitation(token: string): Promise<AcceptResult> {
  const session = await auth();
  const userId = session?.user?.id;
  const userEmail = session?.user?.email;
  if (!userId || !userEmail) {
    return { ok: false, error: "You must be signed in to accept an invite." };
  }

  const invite = await db.query.invitations.findFirst({
    where: and(eq(invitations.token, token), isNull(invitations.acceptedAt)),
  });
  if (!invite) {
    return { ok: false, error: "This invitation is invalid or already used." };
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "This invitation has expired." };
  }
  if (normalizeEmail(userEmail) !== normalizeEmail(invite.email)) {
    return {
      ok: false,
      error: `This invite was sent to ${invite.email}. Sign in with that account to accept it.`,
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(memberships)
      .values({ orgId: invite.orgId, userId, role: invite.role })
      .onConflictDoNothing({
        target: [memberships.orgId, memberships.userId],
      });
    await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invite.id));
    // Make the joined org the active workspace on next session refresh.
    await tx
      .update(users)
      .set({ activeOrgId: invite.orgId })
      .where(eq(users.id, userId));
  });

  return { ok: true, orgId: invite.orgId };
}
