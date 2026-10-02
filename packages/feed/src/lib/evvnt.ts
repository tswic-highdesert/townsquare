// ============================================================
// Evvnt Discovery — Courier Events Fetcher
// ============================================================
// Fetches community events from the Courier newspaper's events
// page, powered by Evvnt Discovery platform (free public API).
// Filters to local River Valley cities only.
// ============================================================

import type { EventItem } from "./types.js";
import { localISO } from "./local-date.js";

const API_URL =
  "https://discovery.evvnt.com/api/publisher/8509/home_page_events";

const SOURCE_ID = "courier-events";
const COMMUNITY = "Russellville";
const DEFAULT_TAGS = ["community", "events"];

/** Local cities to include (case-insensitive match on venue.town) */
const LOCAL_CITIES = new Set([
  // Pope County
  "russellville",
  "atkins",
  "dover",
  "pottsville",
  "hector",
  "london",
  // Yell County
  "dardanelle",
  "danville",
  "ola",
  // Johnson County
  "clarksville",
  "lamar",
  // Logan County
  "scranton",
  "paris",
  "magazine",
  "booneville",
  // Conway County
  "morrilton",
  // Broader River Valley
  "ozark",
  "alma",
  "van buren",
  "fort smith",
]);

/** Shape of an Evvnt image object */
interface EvvntImage {
  original?: { url: string };
  featured?: { url: string };
  thumb?: { url: string };
  [key: string]: unknown;
}

/** Shape of an Evvnt event from the API */
interface EvvntEvent {
  objectID: number;
  title: string;
  summary?: string;
  description?: string;
  category_name?: string;
  category_ids?: number[];
  start_date?: string;
  start_time?: string;
  end_time?: string;
  images?: EvvntImage[];
  venue?: {
    name?: string;
    address_1?: string;
    address_2?: string | null;
    town?: string;
    country?: string;
    post_code?: string;
    latitude?: number;
    longitude?: number;
  };
  city_country?: string;
  links?: Record<string, string | null>;
  hashtag?: string | null;
  source_id?: number;
  prices?: Record<string, string>;
}

/** API response shape */
interface EvvntResponse {
  rawEvents?: EvvntEvent[];
  rawFeaturedEvents?: EvvntEvent[];
  rawEditorsPickEvents?: EvvntEvent[];
  rawFacets?: unknown[];
}

/** Extract the best image URL from an Evvnt image object */
function extractImageUrl(img: EvvntImage): string | undefined {
  // Standard format: { original: { url } }
  if (img.original?.url) return img.original.url;
  // Alternative format: { featured: { url } }
  if (img.featured?.url) return img.featured.url;
  // Thumb as fallback
  if (img.thumb?.url) return img.thumb.url;
  return undefined;
}

/** Build a human-readable location string */
function buildLocation(venue?: EvvntEvent["venue"]): string {
  if (!venue) return "River Valley, AR";
  const parts: string[] = [];
  if (venue.name) parts.push(venue.name);
  if (venue.address_1 && venue.address_1 !== venue.name) {
    parts.push(venue.address_1);
  }
  if (venue.town) parts.push(venue.town);
  return parts.length > 0 ? parts.join(", ") : "River Valley, AR";
}

/** Build event URL — link to Courier events page with event hash */
function buildEventUrl(event: EvvntEvent): string {
  // If there's a ticket link, use that
  if (event.links) {
    const ticketUrl = event.links.Tickets || event.links.ShortTickets;
    if (ticketUrl) return ticketUrl;
  }
  // Fallback to the Courier events page
  return `https://www.couriernews.com/local-events/#/event/${event.objectID}`;
}

/** Generate a deterministic ID for an event */
function generateEventId(event: EvvntEvent): string {
  return `evvnt-${event.objectID}`;
}

/** Extract cost info from prices */
function extractCost(prices?: Record<string, string>): string | undefined {
  if (!prices) return undefined;
  const values = Object.values(prices).filter(Boolean);
  if (values.length === 0) return undefined;
  // Check if all free
  if (values.every((v) => v === "$0.00" || v.toLowerCase() === "free")) {
    return "Free";
  }
  return values.join(", ");
}

/** Fetch and parse Evvnt Discovery events for the Courier */
export async function fetchEvvntEvents(): Promise<EventItem[]> {
  try {
    const response = await fetch(API_URL, {
      headers: {
        "User-Agent": "TownSquare/1.0 (local news aggregator)",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.warn(`[Evvnt] API returned ${response.status}`);
      return [];
    }

    const data: EvvntResponse = await response.json();

    // Combine all event arrays and deduplicate by objectID
    const allRaw: EvvntEvent[] = [];
    const seen = new Set<number>();

    for (const arr of [
      data.rawEvents,
      data.rawFeaturedEvents,
      data.rawEditorsPickEvents,
    ]) {
      if (!Array.isArray(arr)) continue;
      for (const event of arr) {
        if (!event.objectID || seen.has(event.objectID)) continue;
        seen.add(event.objectID);
        allRaw.push(event);
      }
    }

    const now = new Date();
    const events: EventItem[] = [];

    for (const raw of allRaw) {
      // Filter to local cities only
      const town = raw.venue?.town?.toLowerCase();
      if (!town || !LOCAL_CITIES.has(town)) continue;

      // Must have a title
      if (!raw.title) continue;

      // Parse dates
      const startDate = raw.start_time || raw.start_date;
      if (!startDate) continue;

      // Ensure ISO format for date-only strings
      const startIso = localISO(startDate);

      const endIso = raw.end_time
        ? localISO(raw.end_time, true)
        : undefined;

      // Skip past events
      const eventEnd = endIso ? new Date(endIso) : new Date(startIso);
      if (eventEnd < now) continue;

      // Description from summary or description field
      const description = (raw.summary || raw.description || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .slice(0, 500);

      // Tags
      const tags = [...DEFAULT_TAGS];
      if (raw.category_name && raw.category_name !== "Other") {
        tags.push(raw.category_name.toLowerCase());
      }

      // Image URL (first image)
      const imageUrl =
        raw.images && raw.images.length > 0
          ? extractImageUrl(raw.images[0])
          : undefined;

      // Build event item
      const event: EventItem = {
        id: generateEventId(raw),
        type: "event",
        title: raw.title.trim(),
        description,
        source: SOURCE_ID,
        tags,
        community: COMMUNITY,
        url: buildEventUrl(raw),
        startDate: startIso,
        endDate: endIso,
        location: buildLocation(raw.venue),
        isAllDay: !raw.start_time?.includes("T"),
        cost: extractCost(raw.prices),
        createdAt: startIso,
        updatedAt: startIso,
      };

      // Add geo if available
      if (raw.venue?.latitude && raw.venue?.longitude) {
        event.geo = {
          lat: raw.venue.latitude,
          lng: raw.venue.longitude,
          address: raw.venue.address_1 || undefined,
          city: raw.venue.town || "Russellville",
          state: "AR",
          zip: raw.venue.post_code || undefined,
        };
      }

      events.push(event);
    }

    console.log(
      `[Evvnt] Fetched ${allRaw.length} total events, ${events.length} local (from ${LOCAL_CITIES.size} cities)`
    );
    return events;
  } catch (error) {
    console.error("[Evvnt] Error fetching events:", error);
    return [];
  }
}
