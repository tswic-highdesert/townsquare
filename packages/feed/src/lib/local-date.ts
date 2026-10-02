import { parseICalDate } from "./ical-date.js";

/** Convert source wall-clock components to an instant, never the host timezone. */
export function localDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return parseICalDate(`${year}${pad(month + 1)}${pad(day)}T${pad(hour)}${pad(minute)}${pad(second)}`);
}

/** ISO source values with offsets remain authoritative. Floating values are local. */
export function localISO(value: string, endOfDay = false): string {
  if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return new Date(value).toISOString();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(value);
  if (!match) throw new RangeError(`Invalid source date: ${value}`);
  const [, year, month, day, hour, minute, second] = match;
  return localDate(+year, +month - 1, +day, +(hour ?? (endOfDay ? 23 : 0)), +(minute ?? (endOfDay ? 59 : 0)), +(second ?? (endOfDay ? 59 : 0)));
}

/** Explicit English month/day/year used by local HTML calendars. */
export function namedLocalDate(value: string, time?: { hours: number; minutes: number }): string | null {
  const match = /^(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})(?:,?\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM))?$/i.exec(value.trim());
  if (!match) return null;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(match[1].slice(0, 3).toLowerCase());
  if (month < 0) return null;
  let hour = match[4] ? +match[4] % 12 + (match[6]?.toLowerCase() === "pm" ? 12 : 0) : 0;
  let minute = +(match[5] ?? 0);
  if (time) { hour = time.hours; minute = time.minutes; }
  try { return localDate(+match[3], month, +match[2], hour, minute); } catch { return null; }
}

export function localDateParts(instant: Date): { year: number; month: number; day: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(instant).map((p) => [p.type, p.value]));
  return { year: +parts.year, month: +parts.month - 1, day: +parts.day };
}
