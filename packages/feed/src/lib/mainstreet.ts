// ============================================================
// Main Street Russellville — Scrapes events from mainstreetrussellville.com
// ============================================================

import type { EventItem } from "./types.js";

const BASE_URL = "https://www.mainstreetrussellville.com";
const EVENTS_URL = `${BASE_URL}/events/`;

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/** Decode common HTML entities */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

/**
 * Parse a Locable date string like "Apr 02, 2026" into a Date object.
 * Returns null if unparseable.
 */
function parseLocableDate(dateStr: string): Date | null {
  try {
    const cleaned = dateStr.trim();
    const parsed = new Date(cleaned);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Parse a time string like "6:00 PM CDT" or "7:00 PM CST" into hours/minutes.
 */
function parseTime(timeStr: string): { hours: number; minutes: number } | null {
  try {
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const isPM = match[3].toUpperCase() === "PM";
    if (isPM && hours !== 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
    return { hours, minutes };
  } catch {
    return null;
  }
}

/** Combine a date string and time string into an ISO datetime */
function combineDateAndTime(dateStr: string, timeStr?: string): string | null {
  const date = parseLocableDate(dateStr);
  if (!date) return null;

  if (timeStr) {
    const time = parseTime(timeStr);
    if (time) {
      date.setHours(time.hours, time.minutes, 0, 0);
    }
  }

  return date.toISOString();
}

/** Parse events from the Locable events page HTML */
function parseEventsFromHTML(html: string): EventItem[] {
  const events: EventItem[] = [];
  const now = new Date();

  // Each event is in a <div class="event-block card m-b">...</div>
  const blockRegex = /<div\s+class="event-block card m-b">([\s\S]*?)<a\s+class="read-more/g;
  let match;

  while ((match = blockRegex.exec(html)) !== null) {
    try {
      const block = match[1];

      // Extract link and title: <a class="title styled-widget-link" href="/events/503163/">Title</a>
      const titleMatch = block.match(
        /<a\s+class="title styled-widget-link"\s+href="(\/events\/(\d+)\/)">([^<]+)<\/a>/
      );
      if (!titleMatch) continue;

      const relativePath = titleMatch[1];
      const eventId = titleMatch[2];
      const title = decodeEntities(stripHtml(titleMatch[3])).trim();

      // Extract date: <div class="date"><i ...></i>Apr 02, 2026</div>
      const dateMatch = block.match(
        /<div\s+class="date">(?:<[^>]*>)*\s*([^<]+)<\/div>/
      );
      if (!dateMatch) continue;
      const dateStr = dateMatch[1].trim();

      // Extract time: <div class="start-time"><i ...></i>6:00 PM CDT</div>
      const timeMatch = block.match(
        /<div\s+class="start-time">(?:<[^>]*>)*\s*([^<]+)<\/div>/
      );
      const timeStr = timeMatch ? timeMatch[1].trim() : undefined;

      // Extract street address: <div class="street1"><i ...></i>320 West C St</div>
      const streetMatch = block.match(
        /<div\s+class="street1">(?:<[^>]*>)*\s*([^<]+)<\/div>/
      );
      const street = streetMatch ? streetMatch[1].trim() : "";

      // Extract city/state/zip: <div class="city-state-zip"><i ...></i>Russellville, AR 72801</div>
      const cityMatch = block.match(
        /<div\s+class="city-state-zip">(?:<[^>]*>)*\s*([^<]+)<\/div>/
      );
      const cityStateZip = cityMatch ? cityMatch[1].trim() : "";

      // Parse city, state, zip from "Russellville, AR 72801"
      let city = "Russellville";
      let state = "AR";
      let zip: string | undefined;
      const cszMatch = cityStateZip.match(/^([^,]+),\s*(\w{2})\s*(\d{5})?/);
      if (cszMatch) {
        city = cszMatch[1].trim();
        state = cszMatch[2];
        zip = cszMatch[3];
      }

      const startDate = combineDateAndTime(dateStr, timeStr);
      if (!startDate) continue;

      // Skip past events
      if (new Date(startDate) < now) continue;

      const location = street
        ? `${street}, ${cityStateZip}`
        : cityStateZip || "Downtown Russellville";

      events.push({
        id: `main-street-${eventId}`,
        type: "event",
        title,
        description: "",
        source: "main-street",
        tags: ["downtown", "community", "arts"],
        community: "Russellville",
        geo: {
          lat: 35.2804,
          lng: -93.1356,
          address: street || "320 West C St",
          city,
          state,
          zip,
        },
        url: `${BASE_URL}${relativePath}`,
        startDate,
        location,
        isAllDay: !timeStr,
        createdAt: startDate,
        updatedAt: startDate,
      });
    } catch {
      // Skip malformed events
      continue;
    }
  }

  // Deduplicate by event ID
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}

/** Fetch Main Street Russellville events */
export async function fetchMainStreetEvents(): Promise<EventItem[]> {
  try {
    const response = await fetch(EVENTS_URL, {
      headers: {
        "User-Agent": "TownSquare/1.0 (local news aggregator)",
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      console.warn(`[MainStreet] Events page returned ${response.status}`);
      return [];
    }

    const html = await response.text();
    return parseEventsFromHTML(html);
  } catch (error) {
    console.error("[MainStreet] Error fetching events:", error);
    return [];
  }
}
