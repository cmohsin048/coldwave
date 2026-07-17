import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number with thousands separators. */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/** Format a 0-1 ratio as a percentage string. */
export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** Sleep for `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Random integer in [min, max] inclusive. */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Normalize an email for dedupe/comparison (lowercase, trim). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Extract the registrable-ish domain from an email address. */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}
