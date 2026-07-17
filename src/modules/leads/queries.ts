import { and, eq, desc, ilike, or, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads, leadLists, suppressions } from "@/db/schema";

/** All lead lists for an org, newest first. */
export function listLeadLists(orgId: string) {
  return db
    .select()
    .from(leadLists)
    .where(eq(leadLists.orgId, orgId))
    .orderBy(desc(leadLists.createdAt));
}

export interface LeadQuery {
  listId?: string;
  status?: string;
  search?: string;
  page?: number;
  perPage?: number;
}

/** Paginated, org-scoped lead listing. */
export async function queryLeads(orgId: string, q: LeadQuery) {
  const perPage = Math.min(q.perPage ?? 50, 200);
  const page = Math.max(q.page ?? 1, 1);

  const conditions = [eq(leads.orgId, orgId)];
  if (q.listId) conditions.push(eq(leads.listId, q.listId));
  if (q.status) conditions.push(eq(leads.status, q.status as never));
  if (q.search) {
    const term = `%${q.search}%`;
    conditions.push(
      or(
        ilike(leads.email, term),
        ilike(leads.fullName, term),
        ilike(leads.companyName, term)
      )!
    );
  }

  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(leads)
      .where(where)
      .orderBy(desc(leads.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(leads)
      .where(where),
  ]);

  return { rows, total: countRows[0]?.total ?? 0, page, perPage };
}

/**
 * Dedupe helper: given a set of candidate emails, return the subset that the
 * org has ALREADY contacted or already stored, so imports skip them.
 */
export async function findExistingEmails(
  orgId: string,
  emails: string[]
): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const existing = new Set<string>();

  // Chunk to keep IN() lists reasonable.
  const chunkSize = 500;
  for (let i = 0; i < emails.length; i += chunkSize) {
    const chunk = emails.slice(i, i + chunkSize);
    const [dbLeads, dbSuppressed] = await Promise.all([
      db
        .select({ email: leads.email })
        .from(leads)
        .where(and(eq(leads.orgId, orgId), inArray(leads.email, chunk))),
      db
        .select({ email: suppressions.email })
        .from(suppressions)
        .where(
          and(
            eq(suppressions.orgId, orgId),
            inArray(suppressions.email, chunk)
          )
        ),
    ]);
    for (const r of dbLeads) existing.add(r.email);
    for (const r of dbSuppressed) existing.add(r.email);
  }

  return existing;
}
