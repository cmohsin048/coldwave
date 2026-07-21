"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads, leadLists } from "@/db/schema";
import { action } from "@/lib/action";
import { getApolloClient, type ApolloPerson } from "@/modules/apollo/client";
import {
  apolloPersonToLead,
  hasRevealedEmail,
  mergeApolloPerson,
} from "@/modules/leads/mapping";
import { logger } from "@/lib/logger";
import { verifyEmail } from "@/modules/leads/verify";
import { findExistingEmails } from "@/modules/leads/queries";
import { recordUsage } from "@/modules/billing/usage";
import { normalizeEmail } from "@/lib/utils";
import {
  apolloSearchSchema,
  importApolloSchema,
  csvImportSchema,
  deleteListSchema,
} from "@/modules/leads/schemas";
import { z } from "zod";

/**
 * Typeahead over Apollo's industry taxonomy — powers the industry picker so
 * users select real filterable industries instead of guessing names.
 */
export const searchIndustries = action(
  z.object({ q: z.string().min(2).max(80) }),
  async (input) => {
    const apollo = getApolloClient();
    const tags = await apollo.searchIndustryTags(input.q);
    return {
      industries: tags
        .filter((t) => t.kind === "linkedin_industry")
        .slice(0, 8)
        .map((t) => ({
          id: t.id,
          name: t.cleaned_name ?? t.display_name ?? "",
        }))
        .filter((t) => t.name),
    };
  }
);

/**
 * Preview an Apollo people search WITHOUT importing (no email reveal / credit
 * spend). Returns a lightweight sample for the filter UI.
 */
export const previewApolloSearch = action(
  apolloSearchSchema,
  async (input) => {
    const apollo = getApolloClient();
    const result = await apollo.searchPeople({
      personTitles: input.personTitles,
      seniorities: input.seniorities,
      industries: input.industries,
      locations: input.locations,
      employeeRanges: input.employeeRanges,
      technologies: input.technologies,
      keywords: input.keywords,
      page: input.page,
      perPage: input.perPage,
    });

    return {
      totalEntries: result.totalEntries,
      totalPages: result.totalPages,
      sample: result.people.slice(0, 25).map((p) => ({
        apolloId: p.id,
        name: p.name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
        title: p.title,
        company: p.organization?.name,
        industry: p.organization?.industry,
        location: [p.city, p.state, p.country].filter(Boolean).join(", "),
        emailStatus: p.email_status,
      })),
    };
  }
);

/**
 * Run the search, enrich + verify emails, dedupe against already-contacted
 * contacts, and import into a new (or existing) list.
 */
export const importFromApollo = action(importApolloSchema, async (input, ctx) => {
  const apollo = getApolloClient();

  // Create the destination list.
  const [list] = await db
    .insert(leadLists)
    .values({
      orgId: ctx.orgId,
      name: input.listName,
      source: "apollo",
      searchFilters: input.filters as Record<string, unknown>,
      createdByUserId: ctx.userId,
    })
    .returning();

  // Page through Apollo up to the requested limit.
  const collected: Awaited<
    ReturnType<typeof apollo.searchPeople>
  >["people"] = [];
  let page = 1;
  while (collected.length < input.limit) {
    const res = await apollo.searchPeople({
      ...input.filters,
      page,
      perPage: 100,
    });
    collected.push(...res.people);
    if (page >= res.totalPages || res.people.length === 0) break;
    page += 1;
  }

  /**
   * Search results come back with masked emails (`email_not_unlocked@...`).
   * Bulk-enrich in batches of 10 (Apollo's per-call limit) with
   * `reveal_personal_emails` — this is the step that actually unlocks emails
   * and consumes Apollo credits.
   */
  const fetched = collected.slice(0, input.limit);
  const revealed: ApolloPerson[] = [];
  let enrichedCount = 0;
  for (let i = 0; i < fetched.length; i += 10) {
    const batch = fetched.slice(i, i + 10);
    const alreadyRevealed = batch.filter(hasRevealedEmail);
    const needsReveal = batch.filter((p) => !hasRevealedEmail(p));
    revealed.push(...alreadyRevealed);
    if (needsReveal.length === 0) continue;

    try {
      const matches = await apollo.bulkEnrich(
        needsReveal.map((p) => ({ id: p.id })),
        true
      );
      const byId = new Map(
        matches.filter((m): m is ApolloPerson => !!m?.id).map((m) => [m.id, m])
      );
      for (let j = 0; j < needsReveal.length; j++) {
        const original = needsReveal[j]!;
        // Prefer id-matched result; fall back to positional (bulk_match
        // responds in request order) when ids differ.
        const match =
          byId.get(original.id) ??
          (matches.length === needsReveal.length ? matches[j] : null);
        const merged = mergeApolloPerson(original, match);
        if (hasRevealedEmail(merged)) {
          revealed.push(merged);
          enrichedCount += 1;
        }
      }
    } catch (err) {
      // A failed batch shouldn't sink the whole import — skip those people.
      logger.warn("apollo bulk enrich batch failed", {
        batchStart: i,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const candidates = revealed
    .map(apolloPersonToLead)
    .filter((l): l is NonNullable<typeof l> => l !== null);

  // Dedupe against existing + suppressed.
  let toImport = candidates;
  let skippedDuplicates = 0;
  if (input.dedupe) {
    const existing = await findExistingEmails(
      ctx.orgId,
      candidates.map((c) => c.email)
    );
    toImport = candidates.filter((c) => !existing.has(c.email));
    skippedDuplicates = candidates.length - toImport.length;
  }

  // Verify emails before import.
  let imported = 0;
  let invalid = 0;
  for (const lead of toImport) {
    let verification: Awaited<ReturnType<typeof verifyEmail>> = "unknown";
    if (input.verify) {
      verification = await verifyEmail(lead.email);
      if (verification === "invalid" || verification === "disposable") {
        invalid += 1;
        continue;
      }
    }

    await db
      .insert(leads)
      .values({
        ...lead,
        orgId: ctx.orgId,
        listId: list!.id,
        status: verification === "valid" ? "verified" : "new",
        verification,
        verifiedAt: input.verify ? new Date() : null,
      })
      .onConflictDoNothing({ target: [leads.orgId, leads.email] });
    imported += 1;
  }

  await db
    .update(leadLists)
    .set({ leadCount: imported })
    .where(eq(leadLists.id, list!.id));

  // Meter enrichment usage for billing — bill what we actually revealed
  // (credits are spent on enrichment even if a lead later fails verification).
  if (enrichedCount > 0) {
    await recordUsage({
      orgId: ctx.orgId,
      metric: "lead_enriched",
      quantity: enrichedCount,
      reference: list!.id,
    });
  }

  revalidatePath("/leads");
  return {
    listId: list!.id,
    imported,
    skippedDuplicates,
    invalid,
    enriched: enrichedCount,
    fetched: fetched.length,
    noEmail: fetched.length - candidates.length,
  };
});

/** Import leads from parsed CSV rows (fallback path when not using Apollo). */
export const importCsv = action(csvImportSchema, async (input, ctx) => {
  const [list] = await db
    .insert(leadLists)
    .values({
      orgId: ctx.orgId,
      name: input.listName,
      source: "csv",
      createdByUserId: ctx.userId,
    })
    .returning();

  // Map common header aliases → lead columns.
  const pick = (row: Record<string, string>, keys: string[]) => {
    for (const k of Object.keys(row)) {
      if (keys.includes(k.trim().toLowerCase())) return row[k]?.trim();
    }
    return undefined;
  };

  const mapped = input.rows
    .map((row) => {
      const email = pick(row, ["email", "email address", "work email"]);
      if (!email) return null;
      return {
        email: normalizeEmail(email),
        firstName: pick(row, ["first name", "firstname", "first"]) ?? null,
        lastName: pick(row, ["last name", "lastname", "last"]) ?? null,
        fullName: pick(row, ["name", "full name", "fullname"]) ?? null,
        title: pick(row, ["title", "job title"]) ?? null,
        companyName: pick(row, ["company", "company name", "organization"]) ?? null,
        companyDomain: pick(row, ["domain", "company domain", "website"]) ?? null,
        linkedinUrl: pick(row, ["linkedin", "linkedin url"]) ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  let toImport = mapped;
  let skippedDuplicates = 0;
  if (input.dedupe) {
    const existing = await findExistingEmails(
      ctx.orgId,
      mapped.map((m) => m.email)
    );
    toImport = mapped.filter((m) => !existing.has(m.email));
    skippedDuplicates = mapped.length - toImport.length;
  }

  let imported = 0;
  let invalid = 0;
  for (const lead of toImport) {
    let verification: Awaited<ReturnType<typeof verifyEmail>> = "unknown";
    if (input.verify) {
      verification = await verifyEmail(lead.email);
      if (verification === "invalid" || verification === "disposable") {
        invalid += 1;
        continue;
      }
    }
    await db
      .insert(leads)
      .values({
        ...lead,
        orgId: ctx.orgId,
        listId: list!.id,
        status: "new",
        verification,
      })
      .onConflictDoNothing({ target: [leads.orgId, leads.email] });
    imported += 1;
  }

  await db
    .update(leadLists)
    .set({ leadCount: imported })
    .where(eq(leadLists.id, list!.id));

  revalidatePath("/leads");
  return { listId: list!.id, imported, skippedDuplicates, invalid };
});

/** Return org-scoped leads as CSV text for export/download. */
export const exportLeadsCsv = action(
  z.object({ listId: z.string().optional() }),
  async (input, ctx) => {
    const where = input.listId
      ? and(eq(leads.orgId, ctx.orgId), eq(leads.listId, input.listId))
      : eq(leads.orgId, ctx.orgId);

    const rows = await db.select().from(leads).where(where);

    const headers = [
      "email",
      "first_name",
      "last_name",
      "title",
      "company_name",
      "company_domain",
      "location",
      "status",
      "verification",
    ];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        [
          r.email,
          r.firstName,
          r.lastName,
          r.title,
          r.companyName,
          r.companyDomain,
          r.location,
          r.status,
          r.verification,
        ]
          .map(escape)
          .join(",")
      ),
    ].join("\n");

    return { csv, count: rows.length };
  }
);

/** Recompute the cached lead counts of the given lists after bulk changes. */
async function recountLists(orgId: string, listIds: (string | null)[]) {
  for (const listId of new Set(listIds.filter((id): id is string => !!id))) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.orgId, orgId), eq(leads.listId, listId)));
    await db
      .update(leadLists)
      .set({ leadCount: row?.count ?? 0 })
      .where(and(eq(leadLists.id, listId), eq(leadLists.orgId, orgId)));
  }
}

/** Bulk-delete leads. */
export const deleteLeads = action(
  z.object({ leadIds: z.array(z.string()).min(1).max(1000) }),
  async (input, ctx) => {
    const affected = await db
      .select({ listId: leads.listId })
      .from(leads)
      .where(and(eq(leads.orgId, ctx.orgId), inArray(leads.id, input.leadIds)));

    await db
      .delete(leads)
      .where(and(eq(leads.orgId, ctx.orgId), inArray(leads.id, input.leadIds)));

    await recountLists(ctx.orgId, affected.map((a) => a.listId));
    revalidatePath("/leads");
    return { deleted: affected.length };
  }
);

/** Bulk-move leads into another list. */
export const moveLeads = action(
  z.object({
    leadIds: z.array(z.string()).min(1).max(1000),
    listId: z.string(),
  }),
  async (input, ctx) => {
    const target = await db.query.leadLists.findFirst({
      where: and(
        eq(leadLists.id, input.listId),
        eq(leadLists.orgId, ctx.orgId)
      ),
    });
    if (!target) throw new Error("Target list not found");

    const affected = await db
      .select({ listId: leads.listId })
      .from(leads)
      .where(and(eq(leads.orgId, ctx.orgId), inArray(leads.id, input.leadIds)));

    await db
      .update(leads)
      .set({ listId: target.id })
      .where(and(eq(leads.orgId, ctx.orgId), inArray(leads.id, input.leadIds)));

    await recountLists(ctx.orgId, [
      ...affected.map((a) => a.listId),
      target.id,
    ]);
    revalidatePath("/leads");
    return { moved: affected.length };
  }
);

export const deleteList = action(deleteListSchema, async (input, ctx) => {
  await db
    .delete(leadLists)
    .where(and(eq(leadLists.id, input.listId), eq(leadLists.orgId, ctx.orgId)));
  revalidatePath("/leads");
  return { deleted: true };
});
