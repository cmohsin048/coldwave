import type { Lead } from "@/db/schema";

/**
 * Per-lead send-window logic. When a campaign has `sendPerTimezone` enabled,
 * each email is held until the lead's local time is inside business hours
 * (Mon–Fri, 8:00–18:00) so cold email lands while people are at their desk.
 *
 * The lead's timezone is approximated from its country (Apollo gives us
 * country reliably; city-level precision isn't needed for a send window).
 */

const COUNTRY_TZ: Record<string, string> = {
  "united states": "America/Chicago", // central pick for a continental country
  usa: "America/Chicago",
  us: "America/Chicago",
  canada: "America/Toronto",
  mexico: "America/Mexico_City",
  brazil: "America/Sao_Paulo",
  argentina: "America/Argentina/Buenos_Aires",
  chile: "America/Santiago",
  colombia: "America/Bogota",
  "united kingdom": "Europe/London",
  uk: "Europe/London",
  ireland: "Europe/Dublin",
  portugal: "Europe/Lisbon",
  spain: "Europe/Madrid",
  france: "Europe/Paris",
  germany: "Europe/Berlin",
  netherlands: "Europe/Amsterdam",
  belgium: "Europe/Brussels",
  switzerland: "Europe/Zurich",
  austria: "Europe/Vienna",
  italy: "Europe/Rome",
  sweden: "Europe/Stockholm",
  norway: "Europe/Oslo",
  denmark: "Europe/Copenhagen",
  finland: "Europe/Helsinki",
  poland: "Europe/Warsaw",
  czechia: "Europe/Prague",
  "czech republic": "Europe/Prague",
  romania: "Europe/Bucharest",
  greece: "Europe/Athens",
  ukraine: "Europe/Kyiv",
  turkey: "Europe/Istanbul",
  israel: "Asia/Jerusalem",
  "united arab emirates": "Asia/Dubai",
  "saudi arabia": "Asia/Riyadh",
  india: "Asia/Kolkata",
  pakistan: "Asia/Karachi",
  bangladesh: "Asia/Dhaka",
  singapore: "Asia/Singapore",
  malaysia: "Asia/Kuala_Lumpur",
  indonesia: "Asia/Jakarta",
  thailand: "Asia/Bangkok",
  vietnam: "Asia/Ho_Chi_Minh",
  philippines: "Asia/Manila",
  "hong kong": "Asia/Hong_Kong",
  china: "Asia/Shanghai",
  taiwan: "Asia/Taipei",
  japan: "Asia/Tokyo",
  "south korea": "Asia/Seoul",
  australia: "Australia/Sydney",
  "new zealand": "Pacific/Auckland",
  "south africa": "Africa/Johannesburg",
  nigeria: "Africa/Lagos",
  kenya: "Africa/Nairobi",
  egypt: "Africa/Cairo",
};

export const SEND_WINDOW = { startHour: 8, endHour: 18 } as const;

/** Resolve a lead's IANA timezone from its country; null when unknown. */
export function timezoneForLead(
  lead: Pick<Lead, "country"> | null | undefined
): string | null {
  const country = lead?.country?.trim().toLowerCase();
  if (!country) return null;
  return COUNTRY_TZ[country] ?? null;
}

function localHourAndDay(tz: string, now: Date): { hour: number; isWeekend: boolean } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      weekday: "short",
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
    return { hour: hour % 24, isWeekend: weekday === "Sat" || weekday === "Sun" };
  } catch {
    return null; // invalid tz — treat as always sendable
  }
}

/** Whether `now` is inside the lead-local send window (Mon–Fri 8–18). */
export function isWithinSendWindow(tz: string, now = new Date()): boolean {
  const local = localHourAndDay(tz, now);
  if (!local) return true;
  if (local.isWeekend) return false;
  return local.hour >= SEND_WINDOW.startHour && local.hour < SEND_WINDOW.endHour;
}

/**
 * The next instant (30-min resolution) at which the send window opens for this
 * timezone. Bounded scan of one week; falls back to +1h if nothing matches.
 */
export function nextSendWindow(tz: string, from = new Date()): Date {
  const stepMs = 30 * 60 * 1000;
  for (let i = 1; i <= 7 * 48; i++) {
    const candidate = new Date(from.getTime() + i * stepMs);
    if (isWithinSendWindow(tz, candidate)) return candidate;
  }
  return new Date(from.getTime() + 60 * 60 * 1000);
}
