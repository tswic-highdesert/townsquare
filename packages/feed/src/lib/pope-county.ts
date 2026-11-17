// ============================================================
// Pope County Government — Scrapes meeting calendar from popecountyar.gov
// ============================================================

import type { EventItem } from "./types.js";
import { localDate, localDateParts } from "./local-date.js";
import { fetchWithRetry } from "./http.js";

const CALENDAR_URL = "https://www.popecountyar.gov/calendar";
const SOURCE_ID = "pope-county";
const COMMUNITY = "Russellville";

/** Month abbreviation → 0-indexed month number */
const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Slugify text for deterministic IDs */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Parse a time string like "5:30 PM" from the title into hours/minutes */
function parseTimeFromTitle(title: string): { hours: number; minutes: number } | null {
  const match = title.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const isPM = match[3].toUpperCase() === "PM";
  if (isPM && hours !== 12) hours += 12;
  if (!isPM && hours === 12) hours = 0;
  return { hours, minutes };
}

/**
 * Fetch and parse Pope County government meeting calendar.
 * The calendar page uses simple HTML with cal_item blocks.
 */
export async function fetchPopeCountyEvents(): Promise<EventItem[]> {
  try {
    const response = await fetchWithRetry(CALENDAR_URL, {
      timeoutMs: 8000,
      retries: 2,
      headers: { Accept: "text/html" },
    });

    if (!response.ok) {
      console.warn(`[PopeCounty] Calendar returned ${response.status}`);
      return [];
    }

    const html = await response.text();
    const events: EventItem[] = [];
    const now = new Date();
    const localNow = localDateParts(now);
    const currentYear = localNow.year;

    // Parse each cal_item block:
    // <a class="cal_item" href="calendar-view?id=XX">
    //   <div class="cal_btn ..."><div>MON</div><div>DD</div></div>
    //   <strong class="cal_cat">Category</strong>
    //   <div class="cal_title">TITLE</div>
    // </a>
    const itemRegex =
      /<a\s+class="cal_item"[^>]*href="calendar-view\?id=(\d+)"[^>]*>[\s\S]*?<div[^>]*font-size:16px[^>]*>(\w{3})<\/div>\s*<div[^>]*font-size:18px[^>]*>(\d{1,2})<\/div>[\s\S]*?<strong class="cal_cat">([^<]*)<\/strong>\s*<div class="cal_title">([^<]*)<\/div>/g;

    let match;
    while ((match = itemRegex.exec(html)) !== null) {
      const calId = match[1];
      const monthStr = match[2].toLowerCase();
      const dayStr = match[3];
      const category = match[4].trim();
      const title = match[5].trim();

      const monthNum = MONTH_MAP[monthStr];
      if (monthNum === undefined) continue;

      const day = parseInt(dayStr, 10);
      if (isNaN(day) || day < 1 || day > 31) continue;

      // Determine year — if month is before current month, assume next year
      let year = currentYear;
      if (monthNum < localNow.month) {
        year = currentYear + 1;
      }

      // Parse time from the title if available (e.g., "5:30 PM")
      const time = parseTimeFromTitle(title);
      // Do not invent a meeting time when the source omits it.
      if (!time) continue;
      const { hours, minutes } = time;

      const startDate = new Date(localDate(year, monthNum, day, hours, minutes));

      // Skip past events
      if (startDate < now) continue;

      const startDateISO = startDate.toISOString();

      // Build tags from category
      const tags = ["government", "pope-county", "meeting"];
      const categoryTag = slugify(category);
      if (categoryTag && !tags.includes(categoryTag)) {
        tags.push(categoryTag);
      }

      // Clean up title — remove time if present (already parsed)
      const cleanTitle = title.replace(/\s*\d{1,2}:\d{2}\s*(AM|PM)\s*/i, "").trim() || title;

      const id = `pope-county-${calId}`;

      events.push({
        id,
        type: "event",
        title: cleanTitle,
        description: `${category} — Pope County Government`,
        source: SOURCE_ID,
        tags,
        community: COMMUNITY,
        url: `https://www.popecountyar.gov/calendar-view?id=${calId}`,
        startDate: startDateISO,
        location: "Pope County Courthouse, Russellville, AR",
        isAllDay: false,
        createdAt: startDateISO,
        updatedAt: startDateISO,
      });
    }

    console.log(`[PopeCounty] Parsed ${events.length} upcoming meetings`);
    return events;
  } catch (error) {
    console.error("[PopeCounty] Error fetching calendar:", error);
    return [];
  }
}
