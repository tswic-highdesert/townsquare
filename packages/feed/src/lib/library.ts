// ============================================================
// Pope County Library System — Scrapes events from LibraryCalendar.com
// ============================================================

import type { EventItem } from "./types.js";
import { localDate } from "./local-date.js";

const BASE_URL = "https://popecountyar.librarycalendar.com";
const EVENTS_URL = `${BASE_URL}/events/`;
const SOURCE_ID = "pope-county-library";
const COMMUNITY = "Russellville";
const DEFAULT_TAGS = ["library", "education", "family"];

/** Strip HTML tags and decode common entities */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Slugify text for use in IDs */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * Parse a month abbreviation like "Mar" into a 0-indexed month number.
 */
function parseMonth(abbr: string): number {
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  return months[abbr.toLowerCase().slice(0, 3)] ?? 0;
}

/**
 * Parse time like "9:00am", "12:30pm", "1:00pm" into { hours, minutes }
 */
function parseTime(timeStr: string): { hours: number; minutes: number } | null {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const isPM = match[3].toLowerCase() === "pm";
  if (isPM && hours !== 12) hours += 12;
  if (!isPM && hours === 12) hours = 0;
  return { hours, minutes };
}

/**
 * Build an ISO date string from components.
 * Uses the community timezone, including daylight saving changes.
 */
function buildISODate(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0
): string {
  return localDate(year, month, day, hours, minutes);
}

/**
 * Extract the event slug/ID from a URL like "/event/chess-tournament-4254"
 */
function extractEventId(href: string): string {
  const match = href.match(/\/event\/([^\s"]+)/);
  return match ? match[1] : slugify(href);
}

/**
 * Parse featured events from the carousel section.
 * Format: <div class="lc-event event-card lc-featured-event" ...>
 */
function parseFeaturedEvents(html: string, now: Date): EventItem[] {
  const events: EventItem[] = [];

  // Match featured event blocks
  const blockRegex =
    /<div class="lc-event event-card lc-featured-event"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/g;
  let match;

  while ((match = blockRegex.exec(html)) !== null) {
    try {
      const block = match[0];

      // Extract link: <a href="/event/SLUG">
      const linkMatch = block.match(
        /<h2>\s*<a href="(\/event\/[^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>\s*<\/h2>/
      );
      if (!linkMatch) continue;

      const relativeUrl = linkMatch[1].trim();
      const title = stripHtml(linkMatch[2]);
      if (!title) continue;

      const eventSlug = extractEventId(relativeUrl);

      // Extract date + time from lc-featured-event-info-item--date
      const dateMatch = block.match(
        /lc-featured-event-info-item--date">\s*([\s\S]*?)<\/div>/
      );
      if (!dateMatch) continue;

      const dateText = stripHtml(dateMatch[1]);
      // Format: "Tuesday, March 24, 2026 at 1:00pm - 3:00pm"
      // or "Saturday, March 28, 2026"
      const dateTimeParsed = parseFeaturedDateString(dateText);
      if (!dateTimeParsed) continue;

      const { startDate, endDate, isAllDay } = dateTimeParsed;

      // Skip past events
      if (new Date(startDate) < now) continue;

      // Extract location
      const locMatch = block.match(
        /lc-featured-event-location">\s*([\s\S]*?)<\/div>/
      );
      const location = locMatch ? stripHtml(locMatch[1]) : "Pope County Library";

      // Extract age group tags from color indicators
      const ageTags = extractAgeTags(block);

      const tags = [...DEFAULT_TAGS, ...ageTags];

      events.push({
        id: `library-${eventSlug}`,
        type: "event",
        title,
        description: "",
        source: SOURCE_ID,
        tags,
        community: COMMUNITY,
        geo: {
          lat: 35.2784,
          lng: -93.1338,
          address: "116 East 3rd St",
          city: "Russellville",
          state: "AR",
          zip: "72801",
        },
        url: `${BASE_URL}${relativeUrl}`,
        startDate,
        endDate,
        location,
        isAllDay,
        createdAt: startDate,
        updatedAt: startDate,
      });
    } catch {
      continue;
    }
  }

  return events;
}

/**
 * Parse the date string from featured events.
 * Examples:
 *   "Tuesday, March 24, 2026 at 1:00pm - 3:00pm"
 *   "Saturday, March 28, 2026"
 */
export function parseFeaturedDateString(
  text: string
): { startDate: string; endDate?: string; isAllDay: boolean } | null {
  try {
    // Remove day name prefix
    const cleaned = text.replace(/^[A-Za-z]+,\s*/, "").trim();

    // Try to extract date and time parts
    const atIdx = cleaned.indexOf(" at ");
    let datePart: string;
    let timePart: string | null = null;

    if (atIdx !== -1) {
      datePart = cleaned.slice(0, atIdx).trim();
      timePart = cleaned.slice(atIdx + 4).trim();
    } else {
      datePart = cleaned;
    }

    // Parse "March 24, 2026"
    const dateMatch = datePart.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (!dateMatch) return null;

    const month = parseMonth(dateMatch[1]);
    const day = parseInt(dateMatch[2], 10);
    const year = parseInt(dateMatch[3], 10);

    if (!timePart) {
      return {
        startDate: buildISODate(year, month, day),
        isAllDay: true,
      };
    }

    // Parse time: "1:00pm - 3:00pm" or "5:30pm - 7:30pm"
    const timeParts = timePart.split(/\s*[-–]\s*/);
    const startTime = parseTime(timeParts[0]);
    if (!startTime) {
      return {
        startDate: buildISODate(year, month, day),
        isAllDay: true,
      };
    }

    const startDate = buildISODate(year, month, day, startTime.hours, startTime.minutes);

    let endDate: string | undefined;
    if (timeParts[1]) {
      const endTime = parseTime(timeParts[1]);
      if (endTime) {
        endDate = buildISODate(year, month, day, endTime.hours, endTime.minutes);
      }
    }

    return { startDate, endDate, isAllDay: false };
  } catch {
    return null;
  }
}

/**
 * Parse the regular upcoming events list.
 * Format: <div class="lc-event lc-event--upcoming"> containing <article>
 */
function parseUpcomingEvents(html: string, now: Date): EventItem[] {
  const events: EventItem[] = [];

  // Match each upcoming event block
  const blockRegex =
    /<div class="lc-event lc-event--upcoming"[^>]*>\s*(?:<[^>]*>\s*)*<article[^>]*>([\s\S]*?)<\/article>/g;
  let match;

  while ((match = blockRegex.exec(html)) !== null) {
    try {
      const block = match[0];

      // Extract link and title from the h3
      const linkMatch = block.match(
        /<a[^>]*href="(\/event\/[^"]+)"[^>]*class="lc-event__link"[^>]*>\s*([\s\S]*?)\s*<\/a>/
      );
      if (!linkMatch) continue;

      const relativeUrl = linkMatch[1].trim();
      const title = stripHtml(linkMatch[2]);
      if (!title) continue;

      const eventSlug = extractEventId(relativeUrl);

      // Extract date components from lc-date-icon
      const monthMatch = block.match(
        /lc-date-icon__item--month">\s*([A-Za-z]+)\s*<\/span>/
      );
      const yearMatch = block.match(
        /lc-date-icon__item--year">\s*(\d{4})\s*<\/span>/
      );

      if (!monthMatch || !yearMatch) continue;

      const month = parseMonth(monthMatch[1]);
      const year = parseInt(yearMatch[1], 10);

      // Day can be single or multi-day
      const multiDayMatch = block.match(
        /lc-date-icon__item--day lc-date-icon__item--multi-day">\s*([\s\S]*?)<\/span>/
      );
      const singleDayMatch = block.match(
        /lc-date-icon__item--day">\s*(\d+)\s*<\/span>/
      );

      let startDay: number;
      let endDay: number | null = null;

      if (multiDayMatch) {
        const dayText = stripHtml(multiDayMatch[1]);
        const days = dayText.split(/\s*-\s*/);
        startDay = parseInt(days[0], 10);
        if (days[1]) endDay = parseInt(days[1], 10);
      } else if (singleDayMatch) {
        startDay = parseInt(singleDayMatch[1], 10);
      } else {
        continue;
      }

      if (isNaN(startDay)) continue;

      // Check if all-day
      const isAllDay = /all-day/i.test(block.match(/class="[^"]*"/)?.[0] || "") ||
        block.includes("All Day");

      // Extract time from lc-event-info-item--time
      const timeMatch = block.match(
        /lc-event-info-item--time">\s*([\s\S]*?)<\/div>/
      );
      let startDate: string;
      let endDate: string | undefined;

      if (timeMatch && !isAllDay) {
        const timeText = stripHtml(timeMatch[1]);
        // Format: "9:00am–2:00pm" or "1:00pm–3:00pm" or "All Day 3/23–3/28"
        const timeParts = timeText.split(/\s*[–-]\s*/);
        const startTime = parseTime(timeParts[0]);
        if (startTime) {
          startDate = buildISODate(year, month, startDay, startTime.hours, startTime.minutes);
          if (timeParts[1]) {
            const endTime = parseTime(timeParts[1]);
            if (endTime) {
              const endDayNum = endDay || startDay;
              endDate = buildISODate(year, month, endDayNum, endTime.hours, endTime.minutes);
            }
          }
        } else {
          startDate = buildISODate(year, month, startDay);
        }
      } else {
        startDate = buildISODate(year, month, startDay);
        if (endDay) {
          endDate = buildISODate(year, month, endDay, 23, 59);
        }
      }

      // Skip past events
      if (new Date(startDate) < now) continue;

      // Extract location from lc-event-info__item--categories
      const catMatch = block.match(
        /lc-event-info__item--categories">\s*([\s\S]*?)<\/div>/
      );
      const location = catMatch ? stripHtml(catMatch[1]) : "Pope County Library";

      // Extract age group tags
      const ageTags = extractAgeTags(block);

      const tags = [...DEFAULT_TAGS, ...ageTags];

      events.push({
        id: `library-${eventSlug}`,
        type: "event",
        title,
        description: "",
        source: SOURCE_ID,
        tags,
        community: COMMUNITY,
        geo: {
          lat: 35.2784,
          lng: -93.1338,
          address: "116 East 3rd St",
          city: "Russellville",
          state: "AR",
          zip: "72801",
        },
        url: `${BASE_URL}${relativeUrl}`,
        startDate,
        endDate,
        location,
        isAllDay: isAllDay || (!timeMatch),
        createdAt: startDate,
        updatedAt: startDate,
      });
    } catch {
      continue;
    }
  }

  return events;
}

/**
 * Extract age-group tags from event HTML block.
 * Looks for color indicator classes like "lc-event__color-indicator--adults-18"
 */
function extractAgeTags(block: string): string[] {
  const tags: string[] = [];
  const tagMap: Record<string, string> = {
    "preschool": "preschool",
    "elementary": "elementary",
    "tween": "tween",
    "teen": "teen",
    "adults": "adults",
    "all-ages": "all-ages",
  };

  const indicatorRegex = /lc-event__color-indicator--([a-z-]+)/g;
  let match;
  while ((match = indicatorRegex.exec(block)) !== null) {
    const className = match[1];
    for (const [key, tag] of Object.entries(tagMap)) {
      if (className.startsWith(key) && !tags.includes(tag)) {
        tags.push(tag);
      }
    }
  }

  return tags;
}

/**
 * Fetch Pope County Library System events from LibraryCalendar.com
 */
export async function fetchLibraryEvents(): Promise<EventItem[]> {
  try {
    const response = await fetch(EVENTS_URL, {
      headers: {
        "User-Agent": "TownSquare/1.0 (local news aggregator)",
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      console.warn(`[Library] Events page returned ${response.status}`);
      return [];
    }

    const html = await response.text();
    const now = new Date();

    // Parse both featured and upcoming events
    const featured = parseFeaturedEvents(html, now);
    const upcoming = parseUpcomingEvents(html, now);

    // Combine and deduplicate by ID
    const all = [...featured, ...upcoming];
    const seen = new Set<string>();
    return all.filter((event) => {
      // Dedupe by title + date (same event can appear in featured + upcoming)
      const key = `${event.title.toLowerCase().trim()}|${event.startDate.slice(0, 10)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (error) {
    console.error("[Library] Error fetching events:", error);
    return [];
  }
}
