import { getEnv } from "@/lib/env";
import { withRetry, type HttpError } from "@/lib/retry";
import { logger } from "@/lib/logger";

/**
 * Apollo.io API client.
 *
 * Covers People/Organization search, single + bulk people enrichment, and the
 * fields ColdWave maps onto its `leads` table. Every call is wrapped in
 * exponential-backoff retry and honors Apollo's Retry-After on 429.
 *
 * Docs: https://docs.apollo.io/reference
 */

const BASE_URL = "https://api.apollo.io/api/v1";

export interface ApolloPerson {
  id: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  seniority?: string;
  email?: string;
  email_status?: string; // "verified" | "guessed" | "unavailable" | ...
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  organization?: ApolloOrganization;
}

export interface ApolloOrganization {
  id: string;
  name?: string;
  website_url?: string;
  primary_domain?: string;
  industry?: string;
  estimated_num_employees?: number;
  city?: string;
  state?: string;
  country?: string;
  technology_names?: string[];
}

export interface PeopleSearchFilters {
  personTitles?: string[];
  seniorities?: string[];
  industries?: string[]; // organization industry tag names
  locations?: string[]; // person locations "City, State, Country"
  organizationLocations?: string[];
  employeeRanges?: string[]; // e.g. ["1,10", "11,50"]
  technologies?: string[]; // tech stack (organization technologies)
  keywords?: string;
  page?: number;
  perPage?: number;
}

export interface PeopleSearchResult {
  people: ApolloPerson[];
  page: number;
  perPage: number;
  totalEntries: number;
  totalPages: number;
}

export interface ApolloTag {
  id: string;
  kind?: string;
  cleaned_name?: string;
  display_name?: string;
}

class ApolloClient {
  private apiKey: string;
  /** industry name (lowercased) → resolved tag id, or null when no match. */
  private industryTagCache = new Map<string, string | null>();

  constructor(apiKey?: string) {
    const key = apiKey ?? getEnv().APOLLO_API_KEY;
    if (!key) {
      throw new Error(
        "APOLLO_API_KEY is not configured. Set it in your environment."
      );
    }
    this.apiKey = key;
  }

  private async request<T>(
    path: string,
    body: Record<string, unknown>
  ): Promise<T> {
    return withRetry(
      async () => {
        const res = await fetch(`${BASE_URL}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": this.apiKey,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const err = new Error(
            `Apollo ${res.status} ${res.statusText}: ${text.slice(0, 300)}`
          ) as HttpError & { retryAfterMs?: number };
          err.status = res.status;
          const retryAfter = res.headers.get("retry-after");
          if (retryAfter) {
            const secs = Number(retryAfter);
            if (!Number.isNaN(secs)) err.retryAfterMs = secs * 1000;
          }
          throw err;
        }

        return (await res.json()) as T;
      },
      { label: "apollo", retries: 5, baseDelayMs: 1000 }
    );
  }

  /** Fuzzy-search Apollo's industry tag taxonomy (LinkedIn industries). */
  async searchIndustryTags(query: string): Promise<ApolloTag[]> {
    const data = await this.request<{ tags?: ApolloTag[] }>("/tags/search", {
      q_tag_fuzzy_name: query,
      kind: "linkedin_industry",
    });
    return data.tags ?? [];
  }

  /**
   * Resolve free-text industry names ("medical practice", "marketing") to
   * Apollo tag ids. Apollo REJECTS names in `organization_industry_tag_ids`
   * (HTTP 422), so this lookup is required. Terms with no matching industry
   * tag (e.g. "dental clinic" — not a LinkedIn industry) are returned as
   * `unresolved` so callers can fold them into the keyword search instead of
   * silently dropping them.
   */
  async resolveIndustryTagIds(
    names: string[]
  ): Promise<{ ids: string[]; unresolved: string[] }> {
    const ids: string[] = [];
    const unresolved: string[] = [];
    for (const raw of names) {
      const name = raw.trim().toLowerCase();
      if (!name) continue;
      let id = this.industryTagCache.get(name);
      if (id === undefined) {
        const tags = await this.searchIndustryTags(name).catch(() => []);
        id = tags.find((t) => t.kind === "linkedin_industry")?.id ?? null;
        this.industryTagCache.set(name, id);
      }
      if (id) ids.push(id);
      else unresolved.push(raw.trim());
    }
    return { ids: [...new Set(ids)], unresolved };
  }

  /** People search with ColdWave's filter shape mapped to Apollo params. */
  async searchPeople(
    filters: PeopleSearchFilters
  ): Promise<PeopleSearchResult> {
    const body: Record<string, unknown> = {
      page: filters.page ?? 1,
      per_page: Math.min(filters.perPage ?? 25, 100),
    };
    if (filters.personTitles?.length)
      body.person_titles = filters.personTitles;
    if (filters.seniorities?.length)
      body.person_seniorities = filters.seniorities;
    if (filters.locations?.length) body.person_locations = filters.locations;
    if (filters.organizationLocations?.length)
      body.organization_locations = filters.organizationLocations;

    const keywordParts = filters.keywords ? [filters.keywords] : [];
    if (filters.industries?.length) {
      const { ids, unresolved } = await this.resolveIndustryTagIds(
        filters.industries
      );
      if (ids.length) body.organization_industry_tag_ids = ids;
      // Non-taxonomy terms still narrow the search via keywords.
      keywordParts.push(...unresolved);
    }
    if (filters.employeeRanges?.length)
      body.organization_num_employees_ranges = filters.employeeRanges;
    if (filters.technologies?.length)
      body.currently_using_any_of_technology_uids = filters.technologies;
    if (keywordParts.length) body.q_keywords = keywordParts.join(" ");

    const data = await this.request<{
      people?: ApolloPerson[];
      contacts?: ApolloPerson[];
      pagination?: {
        page: number;
        per_page: number;
        total_entries: number;
        total_pages: number;
      };
    }>("/mixed_people/api_search", body);

    const people = [...(data.people ?? []), ...(data.contacts ?? [])];
    return {
      people,
      page: data.pagination?.page ?? 1,
      perPage: data.pagination?.per_page ?? people.length,
      totalEntries: data.pagination?.total_entries ?? people.length,
      totalPages: data.pagination?.total_pages ?? 1,
    };
  }

  /** Organization/company search. */
  async searchOrganizations(filters: {
    industries?: string[];
    locations?: string[];
    employeeRanges?: string[];
    technologies?: string[];
    keywords?: string;
    page?: number;
    perPage?: number;
  }): Promise<{ organizations: ApolloOrganization[]; totalEntries: number }> {
    const body: Record<string, unknown> = {
      page: filters.page ?? 1,
      per_page: Math.min(filters.perPage ?? 25, 100),
    };
    const keywordParts = filters.keywords ? [filters.keywords] : [];
    if (filters.industries?.length) {
      const { ids, unresolved } = await this.resolveIndustryTagIds(
        filters.industries
      );
      if (ids.length) body.organization_industry_tag_ids = ids;
      keywordParts.push(...unresolved);
    }
    if (filters.locations?.length)
      body.organization_locations = filters.locations;
    if (filters.employeeRanges?.length)
      body.organization_num_employees_ranges = filters.employeeRanges;
    if (filters.technologies?.length)
      body.currently_using_any_of_technology_uids = filters.technologies;
    if (keywordParts.length)
      body.q_organization_keyword_tags = keywordParts.join(" ");

    const data = await this.request<{
      organizations?: ApolloOrganization[];
      pagination?: { total_entries: number };
    }>("/mixed_companies/api_search", body);

    return {
      organizations: data.organizations ?? [],
      totalEntries: data.pagination?.total_entries ?? 0,
    };
  }

  /**
   * Enrich a single person. `revealEmail` unlocks the email (consumes Apollo
   * credits) — do this only right before import, after the user confirms.
   */
  async enrichPerson(
    input: {
      id?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      domain?: string;
      linkedinUrl?: string;
    },
    revealEmail = true
  ): Promise<ApolloPerson | null> {
    const body: Record<string, unknown> = {
      reveal_personal_emails: revealEmail,
    };
    if (input.id) body.id = input.id;
    if (input.email) body.email = input.email;
    if (input.firstName) body.first_name = input.firstName;
    if (input.lastName) body.last_name = input.lastName;
    if (input.domain) body.domain = input.domain;
    if (input.linkedinUrl) body.linkedin_url = input.linkedinUrl;

    const data = await this.request<{ person?: ApolloPerson }>(
      "/people/match",
      body
    );
    return data.person ?? null;
  }

  /**
   * Bulk enrich up to 10 people per call (Apollo limit). ColdWave batches
   * larger imports in the enrichment worker.
   */
  async bulkEnrich(
    people: Array<{
      id?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      domain?: string;
    }>,
    revealEmail = true
  ): Promise<ApolloPerson[]> {
    if (people.length === 0) return [];
    if (people.length > 10) {
      logger.warn("apollo bulkEnrich called with >10 people; truncating", {
        count: people.length,
      });
    }
    const details = people.slice(0, 10).map((p) => ({
      id: p.id,
      email: p.email,
      first_name: p.firstName,
      last_name: p.lastName,
      domain: p.domain,
    }));

    const data = await this.request<{ matches?: ApolloPerson[] }>(
      "/people/bulk_match",
      { reveal_personal_emails: revealEmail, details }
    );
    return data.matches ?? [];
  }
}

/** Lazily-constructed singleton for the configured org. */
let singleton: ApolloClient | null = null;
export function getApolloClient(apiKey?: string): ApolloClient {
  if (apiKey) return new ApolloClient(apiKey);
  if (!singleton) singleton = new ApolloClient();
  return singleton;
}

export { ApolloClient };
