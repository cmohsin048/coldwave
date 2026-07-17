import { nanoid } from "nanoid";

/** Turn an org name into a URL-safe slug with a short uniqueness suffix. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "org"}-${nanoid(6).toLowerCase()}`;
}
