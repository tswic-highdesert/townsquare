// ============================================================
// Chamber of Commerce Events — Scrapes Glue Up events from
// the Russellville Area Chamber of Commerce homepage
// ============================================================

import type { EventItem } from "./types.js";
import { stableId } from "../ids";

const CHAMBER_URL = "https://www.russellvillechamber.com";
const SOURCE_ID = "chamber";
const COMMUNITY = "Russellville";
const DEFAULT_TAGS = ["business", "chamber", "networking"];

/** Decode base64 iCal data and extract DTSTART/DTEND/SUMMARY/LOCATION */
function parseICalFromBase64(dataUri: string): {
  start?: string;
  end?: string;
  summary?: string;
  location?: string;
  uid?: string;
} {
  try {
    // Extract base64 portion from data:text/calendar;charset=utf8;base64,XXXX
    const match = dataUri.match(/base64,(.+)$/);
    if (!match) return {};

    const decoded = atob(match[1]);
    const result: Record<string, string> = {};

    // Unfold continuation lines
    const unfolded = decoded.replace(/\r?\n[ \t]/g, "");

    for (const line of unfolded.split(/\r?\n/)) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const rawKey = line.slice(0, colonIdx).split(";")[0].toUpperCase();
      const value = line.slice(colonIdx + 1).trim();

      if (["DTSTART", "DTEND", "SUMMARY", "LOCATION", "UID"].includes(rawKey)) {
        result[rawKey] = value;
      }
    }

    return {
      start: result.DTSTART ? parseICalDate(result.DTSTART) : undefined,
      end: result.DTEND ? parseICalDate(result.DTEND) : undefined,
      summary: result.SUMMARY,
      location: result.LOCATION,
      uid: result.UID,
    };
  } catch {
    return {};
  }
}

/** Parse an iCal datetime (YYYYMMDDTHHMMSSZ or YYYYMMDD) to ISO string */
function parseICalDate(dateStr: string): string {
  const match = dateStr.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/
  );
  if (match) {
    const [, yr, mo, dy, hr, mn, sc, z] = match;
    if (z) {
      return new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:${sc}Z`).toISOString();
    }
    return `${yr}-${mo}-${dy}T${hr}:${mn}:${sc}-05:00`;
  }

  // All-day format: YYYYMMDD
  if (/^\d{8}$/.test(dateStr)) {
    const yr = dateStr.slice(0, 4);
    const mo = dateStr.slice(4, 6);
    const dy = dateStr.slice(6, 8);
    return `${yr}-${mo}-${dy}T00:00:00-05:00`;
  }

  return new Date(dateStr).toISOString();
}

/** Generate a deterministic ID from a Glue Up event URL */
function generateEventId(url: string, title: string): string {
  // Extract event ID from URL like https://russellvillechamber.glueup.com/event/173466
  const eventIdMatch = url.match(/\/event\/(\d+)/);
  if (eventIdMatch) {
    return `chamber-glueup-${eventIdMatch[1]}`;
  }
  // No GlueUp id: key off the event URL, never the title (RSVP-safe). `title` is
  // kept in the signature for call-site compatibility but intentionally unused.
  void title;
  return stableId("chamber", url);
}

/** Strip HTML tags */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/** Extract event blocks from the homepage HTML */
function parseEventsFromHtml(html: string): EventItem[] {
  const events: EventItem[] = [];
  const now = new Date();

  // Split on event-row divs to isolate each event block
  const eventBlocks = html.split(/class="event-row"/);

  // Skip first split (before first event-row)
  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i];

    try {
      // Extract Glue Up link and title from event-listing-title
      const titleMatch = block.match(
        /class="link-to-eb event-listing-title"[^>]*href="([^"]*)"[^>]*>([^<]*)/
      );
      if (!titleMatch) continue;

      const url = titleMatch[1];
      const title = stripHtml(titleMatch[2]).trim();
      if (!title) continue;

      // Extract thumbnail image
      const thumbMatch = block.match(
        /class="link-to-eb event-listing-thumbnails[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"/
      );
      const imageUrl = thumbMatch?.[1] || undefined;

      // Extract date text
      const dateMatch = block.match(
        /class="event-date">\s*([^<]*)/
      );
      const dateText = dateMatch ? dateMatch[1].trim() : "";

      // Extract venue
      const venueMatch = block.match(
        /class="event-venue">\s*([^<]*)/
      );
      const venue = venueMatch ? venueMatch[1].trim() : "";

      // Extract description
      const descMatch = block.match(
        /class="event-description">\s*<p>([^<]*)<\/p>/
      );
      const description = descMatch ? stripHtml(descMatch[1]).trim() : "";

      // Try to get precise dates from embedded iCal base64 data
      const icsMatch = block.match(
        /class="calendar-link-ics"[^>]*href="(data:text\/calendar[^"]*)"/
      );

      let startDate: string | undefined;
      let endDate: string | undefined;
      let uid: string | undefined;

      if (icsMatch) {
        const ical = parseICalFromBase64(icsMatch[1]);
        startDate = ical.start;
        endDate = ical.end;
        uid = ical.uid;
      }

      // If no iCal data, skip — we can't reliably determine dates without it
      if (!startDate) continue;

      // Filter to future events only
      const startTime = new Date(startDate);
      if (startTime < now) continue;

      events.push({
        id: generateEventId(url, title),
        type: "event",
        title,
        description: description.slice(0, 400),
        source: SOURCE_ID,
        tags: [...DEFAULT_TAGS],
        community: COMMUNITY,
        url,
        startDate,
        endDate,
        location: venue || "Russellville, AR",
        isAllDay: false,
        createdAt: startDate,
        updatedAt: startDate,
      });
    } catch {
      // Skip malformed event blocks
      continue;
    }
  }

  return events;
}

/** Fetch Chamber of Commerce events from the homepage */
export async function fetchChamberEvents(): Promise<EventItem[]> {
  try {
    const response = await fetch(CHAMBER_URL, {
      headers: {
        "User-Agent": "TownSquare/1.0 (local news aggregator)",
      },
    });

    if (!response.ok) {
      console.warn(`[Chamber] Homepage returned ${response.status}`);
      return [];
    }

    const html = await response.text();
    const events = parseEventsFromHtml(html);

    // Deduplicate by title + date
    const seen = new Set<string>();
    return events.filter((event) => {
      const key = `${event.title.toLowerCase().trim()}|${event.startDate.slice(0, 10)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (error) {
    console.error("[Chamber] Error fetching events:", error);
    return [];
  }
}
