// ============================================================
// Arkansas State Parks — Scrapes events from arkansasstateparks.com
// ============================================================

import type { EventItem } from "./types.js";
import { namedLocalDate } from "./local-date.js";

const BASE_URL = "https://www.arkansasstateparks.com";
const EVENTS_URL = `${BASE_URL}/events?f%5B0%5D=grid_events_park%3A1806`;

/** Generate a deterministic ID for a state parks event */
function generateEventId(slug: string, eventId: string): string {
  return `state-parks-${slug}-${eventId}`;
}

/** Parse time like "9 a.m." or "10:30 p.m." into hours and minutes */
function parseTime(timeStr: string): { hours: number; minutes: number } | null {
  try {
    const cleaned = timeStr.trim().toLowerCase();
    const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const isPM = match[3].startsWith("p");
    if (isPM && hours !== 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
    return { hours, minutes };
  } catch {
    return null;
  }
}

/** Combine a date string and optional time string into an ISO datetime */
export function combineDateAndTime(dateStr: string, timeStr?: string): string | null {
  const time = timeStr ? parseTime(timeStr) : null;
  return namedLocalDate(dateStr.trim(), time ?? undefined);
}

/** Slugify a title for use in IDs */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/** Extract events from the Lake Dardanelle events page HTML */
function parseEventsFromHTML(html: string): EventItem[] {
  const events: EventItem[] = [];
  const now = new Date();

  // Split on each article/views-row to process individual events
  // Each event is wrapped in <article ... class="entity--event-instance ...">
  const articleRegex = /<article\s[^>]*class="[^"]*entity--event-instance[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  let match;

  while ((match = articleRegex.exec(html)) !== null) {
    try {
      const block = match[0];

      // Extract link and title from <a href="/events/SLUG/ID">Title</a>
      const linkMatch = block.match(/<a\s+href="(\/events\/([^/]+)\/(\d+))"[^>]*>([^<]+)<\/a>/);
      if (!linkMatch) continue;

      const relativeUrl = linkMatch[1];
      const slug = linkMatch[2];
      const eventId = linkMatch[3];
      const title = stripHtml(linkMatch[4]);

      // Extract date + time from <div class="event-date">
      const dateMatch = block.match(/<div class="event-date">([\s\S]*?)<\/div>/);
      if (!dateMatch) continue;

      const dateContent = stripHtml(dateMatch[1]).replace(/\s+/g, " ").trim();

      // Parse date portion: "Thursday, March 26, 2026 / 9 a.m. - 9:45 a.m."
      // or just "Friday, March 27, 2026"
      let dateStr = dateContent;
      let startTimeStr: string | undefined;
      let endTimeStr: string | undefined;

      const slashIdx = dateContent.indexOf("/");
      if (slashIdx !== -1) {
        dateStr = dateContent.slice(0, slashIdx).trim();
        const timePart = dateContent.slice(slashIdx + 1).trim();
        const timeParts = timePart.split("-").map((s) => s.trim());
        startTimeStr = timeParts[0];
        endTimeStr = timeParts[1];
      }

      const startDate = combineDateAndTime(dateStr, startTimeStr);
      if (!startDate) continue;

      // Skip past events
      if (new Date(startDate) < now) continue;

      const endDate = endTimeStr ? combineDateAndTime(dateStr, endTimeStr) : undefined;

      // Extract description from <div class="event-description">
      const descMatch = block.match(/<div class="event-description">([\s\S]*?)<\/div>/);
      const description = descMatch ? stripHtml(descMatch[1]).slice(0, 400) : "";

      // Extract location from data attributes
      const destName = block.match(/data-destination-name="([^"]*)"/)?.[1] || "";
      const destAddress = block.match(/data-destination-address="([^"]*)"/)?.[1] || "";
      const destCity = block.match(/data-destination-city="([^"]*)"/)?.[1] || "";
      const location = destName || destAddress || "Lake Dardanelle State Park";

      // Extract category from data-event-category
      const category = block.match(/data-event-category="([^"]*)"/)?.[1] || "";

      // Build tags
      const tags = ["outdoors", "state-park"];
      if (category) {
        const catTag = category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (catTag && !tags.includes(catTag)) {
          tags.push(catTag);
        }
      }

      events.push({
        id: generateEventId(slug, eventId),
        type: "event",
        title,
        description,
        source: "lake-dardanelle",
        tags,
        community: "Russellville",
        geo: {
          lat: 35.2784,
          lng: -93.1338,
          address: destAddress.trim() || "100 State Park Drive",
          city: destCity || "Russellville",
          state: "AR",
          zip: "72802",
        },
        url: `${BASE_URL}${relativeUrl}`,
        startDate,
        endDate: endDate || undefined,
        location,
        isAllDay: !startTimeStr,
        createdAt: startDate,
        updatedAt: startDate,
      });
    } catch {
      // Skip malformed events
      continue;
    }
  }

  // Deduplicate by event ID (links appear twice in the HTML)
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}

/** Fetch events from the park page as a fallback (fewer details) */
function parseEventsFromParkPage(html: string): EventItem[] {
  const events: EventItem[] = [];
  const now = new Date();

  // Match: <a href="/events/SLUG/ID">Title</a> followed by date in views-field
  const rowRegex = /<div class="views-row">\s*<div class="views-field views-field-title"><span class="field-content"><a href="(\/events\/([^/]+)\/(\d+))">([^<]+)<\/a><\/span><\/div><div class="views-field views-field-field-date-range"><div class="field-content">([^<]+)<\/div><\/div>/g;
  let match;

  while ((match = rowRegex.exec(html)) !== null) {
    try {
      const relativeUrl = match[1];
      const slug = match[2];
      const eventId = match[3];
      const title = match[4].trim();
      const dateStr = match[5].trim();

      const startDate = namedLocalDate(dateStr);
      if (!startDate) continue;
      if (new Date(startDate) < now) continue;

      events.push({
        id: generateEventId(slug, eventId),
        type: "event",
        title,
        description: "",
        source: "lake-dardanelle",
        tags: ["outdoors", "state-park"],
        community: "Russellville",
        url: `${BASE_URL}${relativeUrl}`,
        startDate,
        location: "Lake Dardanelle State Park",
        isAllDay: true,
        createdAt: startDate,
        updatedAt: startDate,
      });
    } catch {
      continue;
    }
  }

  return events;
}

/** Fetch Lake Dardanelle State Park events */
export async function fetchStateParksEvents(): Promise<EventItem[]> {
  try {
    // Try the full events listing page first (richer data)
    const response = await fetch(EVENTS_URL, {
      headers: {
        "User-Agent": "TownSquare/1.0 (local news aggregator)",
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      console.warn(`[StateParks] Events page returned ${response.status}`);
      return await fetchFromParkPage();
    }

    const html = await response.text();
    const events = parseEventsFromHTML(html);

    if (events.length > 0) {
      return events;
    }

    // Fallback to park page if events page returned no results
    return await fetchFromParkPage();
  } catch (error) {
    console.error("[StateParks] Error fetching events page:", error);
    return await fetchFromParkPage();
  }
}

/** Fallback: fetch from the park's own page (less detail) */
async function fetchFromParkPage(): Promise<EventItem[]> {
  try {
    const response = await fetch(
      `${BASE_URL}/parks/lake-dardanelle-state-park`,
      {
        headers: {
          "User-Agent": "TownSquare/1.0 (local news aggregator)",
          Accept: "text/html",
        },
      }
    );

    if (!response.ok) {
      console.warn(`[StateParks] Park page returned ${response.status}`);
      return [];
    }

    const html = await response.text();
    return parseEventsFromParkPage(html);
  } catch (error) {
    console.error("[StateParks] Error fetching park page:", error);
    return [];
  }
}
