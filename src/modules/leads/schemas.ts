import { z } from "zod";

export const apolloSearchSchema = z.object({
  listName: z.string().min(1).max(120),
  personTitles: z.array(z.string()).default([]),
  seniorities: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  employeeRanges: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  keywords: z.string().optional(),
  perPage: z.number().int().min(1).max(100).default(25),
  page: z.number().int().min(1).default(1),
});
export type ApolloSearchInput = z.infer<typeof apolloSearchSchema>;

export const importApolloSchema = z.object({
  listName: z.string().min(1).max(120),
  filters: apolloSearchSchema.omit({ listName: true }),
  /** Max leads to enrich + import in this run. */
  limit: z.number().int().min(1).max(2000).default(100),
  /** Verify emails before import (recommended). */
  verify: z.boolean().default(true),
  /** Skip anyone already in the DB or suppressed. */
  dedupe: z.boolean().default(true),
});
export type ImportApolloInput = z.infer<typeof importApolloSchema>;

export const csvImportSchema = z.object({
  listName: z.string().min(1).max(120),
  /** Parsed CSV rows keyed by header. */
  rows: z
    .array(z.record(z.string(), z.string()))
    .min(1)
    .max(50_000),
  dedupe: z.boolean().default(true),
  verify: z.boolean().default(false),
});
export type CsvImportInput = z.infer<typeof csvImportSchema>;

export const deleteListSchema = z.object({ listId: z.string() });
