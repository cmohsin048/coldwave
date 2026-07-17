import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { memberships, organizations } from "@/db/schema";

/**
 * Tenant context resolution. Every Server Component / Server Action that touches
 * org data must go through `requireOrgContext()` so that a user can only ever
 * read or write rows belonging to an org they are a member of. This is the
 * application-level equivalent of Postgres row-level security: pair the orgId
 * from here with `eq(table.orgId, ctx.orgId)` in every query.
 */

export interface OrgContext {
  userId: string;
  orgId: string;
  role: "owner" | "admin" | "member";
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Resolve the active org context or throw. Memoized per request. */
export const requireOrgContext = cache(async (): Promise<OrgContext> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new UnauthenticatedError();

  const activeOrgId = session.user.activeOrgId;

  // Verify the membership actually exists (defends against stale JWT claims).
  const membership = activeOrgId
    ? await db.query.memberships.findFirst({
        where: and(
          eq(memberships.userId, userId),
          eq(memberships.orgId, activeOrgId)
        ),
      })
    : await db.query.memberships.findFirst({
        where: eq(memberships.userId, userId),
      });

  if (!membership) {
    throw new ForbiddenError("No organization membership found");
  }

  return {
    userId,
    orgId: membership.orgId,
    role: membership.role,
  };
});

/** Require a minimum role. Owner > admin > member. */
export async function requireRole(
  min: "owner" | "admin" | "member"
): Promise<OrgContext> {
  const ctx = await requireOrgContext();
  const rank = { member: 0, admin: 1, owner: 2 };
  if (rank[ctx.role] < rank[min]) {
    throw new ForbiddenError(`Requires ${min} role`);
  }
  return ctx;
}

/** Load the active organization row. */
export const getActiveOrg = cache(async () => {
  const ctx = await requireOrgContext();
  return db.query.organizations.findFirst({
    where: eq(organizations.id, ctx.orgId),
  });
});
