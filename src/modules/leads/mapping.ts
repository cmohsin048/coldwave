import type { ApolloPerson } from "@/modules/apollo/client";
import type { NewLead } from "@/db/schema";
import { normalizeEmail } from "@/lib/utils";

/**
 * Apollo search results come back with masked placeholder emails until the
 * person is enriched ("revealed"). Treat those the same as missing.
 */
export function hasRevealedEmail(person: ApolloPerson): boolean {
  if (!person.email) return false;
  if (person.email.startsWith("email_not_unlocked")) return false;
  if (person.email_status === "unavailable") return false;
  return person.email.includes("@");
}

/**
 * Merge an enriched Apollo match over the original search record, keeping the
 * search record's value wherever the match left a field empty.
 */
export function mergeApolloPerson(
  original: ApolloPerson,
  match: ApolloPerson | null | undefined
): ApolloPerson {
  if (!match) return original;
  const merged: ApolloPerson = { ...original };
  for (const [key, value] of Object.entries(match)) {
    if (value !== undefined && value !== null && value !== "") {
      (merged as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

/** Map an Apollo person into a ColdWave lead insert row (org/list applied later). */
export function apolloPersonToLead(
  person: ApolloPerson
): Omit<NewLead, "orgId"> | null {
  if (!hasRevealedEmail(person) || !person.email) return null; // no usable email → not importable

  const org = person.organization;
  const location = [person.city, person.state, person.country]
    .filter(Boolean)
    .join(", ");

  return {
    email: normalizeEmail(person.email),
    firstName: person.first_name ?? null,
    lastName: person.last_name ?? null,
    fullName:
      person.name ??
      ([person.first_name, person.last_name].filter(Boolean).join(" ") ||
        null),
    title: person.title ?? null,
    seniority: person.seniority ?? null,
    linkedinUrl: person.linkedin_url ?? null,
    companyName: org?.name ?? null,
    companyDomain: org?.primary_domain ?? org?.website_url ?? null,
    industry: org?.industry ?? null,
    headcount: org?.estimated_num_employees ?? null,
    location: location || null,
    country: person.country ?? org?.country ?? null,
    techStack: org?.technology_names ?? [],
    apolloPersonId: person.id,
    apolloOrgId: org?.id ?? null,
  };
}
