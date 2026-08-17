import type { Site } from "./types";

const HIGHWAY_KMH = 80;

/** Ontario Health's target for a P4 (non-urgent) scan, in days. */
export const P4_TARGET_DAYS = 28;

/**
 * How the "Recommended" ranking trades driving against waiting: every
 * MINUTES_PER_DAY minutes of extra drive counts as one extra day of wait.
 * At 2, somewhere half an hour further has to save about 15 days to win.
 */
export const MINUTES_PER_DAY = 2;

export function daysWord(n: number): string {
  return n === 1 ? "day" : "days";
}

export function driveMinutes(km: number): number {
  return Math.round((km / HIGHWAY_KMH) * 60);
}

/** Short drive time for dense rows: "25 min", "1 hr 10". */
export function driveShort(km: number): string {
  const mins = driveMinutes(km);
  if (mins < 5) return "5 min";
  if (mins < 60) return `${Math.round(mins / 5) * 5} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round((mins % 60) / 5) * 5;
  if (m === 0 || m === 60) return `${m === 60 ? h + 1 : h} hr`;
  return `${h} hr ${m}`;
}

/** Spoken drive time for the recommended card: "About 40 minutes away". */
export function awayLine(km: number): string {
  const mins = driveMinutes(km);
  if (mins < 10) return "Right nearby";
  if (mins < 55) return `About ${Math.round(mins / 5) * 5} minutes away`;
  const hours = Math.round(mins / 30) / 2;
  if (hours <= 1) return "About an hour away";
  return `About ${String(hours).replace(/\.5$/, "½")} hours away`;
}

export function kmLabel(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function p(site: Site, id: number) {
  return site.priorities[id] ?? null;
}

/** Mean wait in days for a priority, or null when the site reported no usable value. */
export function validMean(site: Site, id: number): number | null {
  return p(site, id)?.mean ?? null;
}

export function waitDays(site: Site): number | null {
  const mean = validMean(site, 4);
  return mean == null ? null : Math.round(mean);
}

/**
 * Lower is better. Trades waiting against driving so a hospital 20 minutes
 * further only wins when it saves more than a day or two of waiting.
 */
export function balanceScore(site: Site): number | null {
  const days = waitDays(site);
  if (days == null) return null;
  return days + driveMinutes(site.km) / MINUTES_PER_DAY;
}

export function mapsUrl(site: Site): string {
  const parts = [site.name, site.address, site.city, "Ontario"].filter(Boolean);
  const query = encodeURIComponent(parts.join(", "));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/** "June 2026" — the reporting month the numbers cover. */
export function periodLabel(sites: Site[]): string {
  const withPeriod = sites.find((s) => s.period);
  return withPeriod?.period.trim() || "";
}
