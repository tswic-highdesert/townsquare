// ============================================================
// Thrillshare API — Fetches school district events from Thrillshare CMS
// ============================================================

import type { EventItem, GeoLocation } from "./types.js";

/** Thrillshare event from the JSON API */
interface ThrillshareEvent {
  id: number;
  title: string;
  venue: string;
  address: string;
  city_state: string;
  state: string;
  zip: string;
  description: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  latitude: string;
  longitude: string;
  custom_section_name: string;
  recurrent: boolean;
  filter_name: string[];
}

/** Thrillshare API response */
interface ThrillshareResponse {
  events: ThrillshareEvent[];
}

/** Thrillshare feed configuration */
export interface ThrillshareFeedConfig {
  url: string;
  sourceId: string;
  sourceName: string;
  defaultTags: string[];
  community: string;
  defaultLocation: string;
}

/** Known Thrillshare feeds */
export const THRILLSHARE_FEEDS: ThrillshareFeedConfig[] = [
  {
    url: "https://thrillshare-cmsv2.services.thrillshare.com/api/v4/o/426/cms/events",
    sourceId: "russellville-sd",
    sourceName: "Russellville School District",
    defaultTags: ["education", "school", "rsd"],
    community: "Russellville",
    defaultLocation: "Russellville School District",
  },
  {
    url: "https://thrillshare-cmsv2.services.thrillshare.com/api/v4/o/4562/cms/events",
    sourceId: "pottsville-sd",
    sourceName: "Pottsville School District",
    defaultTags: ["education", "school", "pottsville"],
    community: "Pottsville",
    defaultLocation: "Pottsville School District",
  },
];

/** Generate a deterministic ID for a Thrillshare event */
function generateEventId(sourceId: string, eventId: number): string {
  return `thrillshare-${sourceId}-${eventId}`;
}

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/** Parse geo coordinates if available */
function parseGeo(event: ThrillshareEvent): GeoLocation | undefined {
  const lat = parseFloat(event.latitude);
  const lng = parseFloat(event.longitude);
  if (isNaN(lat) || isNaN(lng)) return undefined;

  return {
    lat,
    lng,
    address: event.address || undefined,
    city: "Russellville",
    state: "AR",
    zip: event.zip || undefined,
  };
}

/** Fetch events from a single Thrillshare feed */
async function parseThrillshareFeed(
  config: ThrillshareFeedConfig
): Promise<EventItem[]> {
  try {
    const response = await fetch(config.url, {
      headers: {
        "User-Agent": "TownSquare/1.0 (local news aggregator)",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.warn(
        `[Thrillshare] Feed ${config.sourceName} returned ${response.status}`
      );
      return [];
    }

    const data: ThrillshareResponse = await response.json();

    if (!data.events || !Array.isArray(data.events)) {
      console.warn(`[Thrillshare] No events array in response from ${config.sourceName}`);
      return [];
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 86400000);

    return data.events
      .map((event): EventItem | null => {
        if (!event.title?.trim()) return null;

        const startDate = new Date(event.start_at).toISOString();
        const endDate = event.end_at
          ? new Date(event.end_at).toISOString()
          : undefined;

        // Skip past events (more than 1 day ago)
        const startTime = new Date(startDate);
        if (startTime < oneDayAgo && !event.all_day) return null;

        const description = event.description
          ? stripHtml(event.description)
          : "";

        const location =
          event.venue?.trim() ||
          event.address?.trim() ||
          config.defaultLocation;

        // Build tags from defaults + section name
        const tags = [...config.defaultTags];
        if (event.custom_section_name) {
          const sectionTag = event.custom_section_name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          if (sectionTag && !tags.includes(sectionTag)) {
            tags.push(sectionTag);
          }
        }
        for (const filter of event.filter_name) {
          const filterTag = filter
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          if (filterTag && !tags.includes(filterTag)) {
            tags.push(filterTag);
          }
        }

        const geo = parseGeo(event);

        return {
          id: generateEventId(config.sourceId, event.id),
          type: "event",
          title: event.title.trim(),
          description: description.slice(0, 400),
          source: config.sourceId,
          tags,
          community: config.community,
          geo,
          startDate,
          endDate,
          location,
          isAllDay: event.all_day,
          createdAt: startDate,
          updatedAt: startDate,
        };
      })
      .filter((item): item is EventItem => item !== null);
  } catch (error) {
    console.error(
      `[Thrillshare] Error fetching feed ${config.sourceName}:`,
      error
    );
    return [];
  }
}

/** Fetch all Thrillshare feeds and return events */
export async function fetchThrillshareEvents(): Promise<EventItem[]> {
  const results = await Promise.allSettled(
    THRILLSHARE_FEEDS.map((feed) => parseThrillshareFeed(feed))
  );

  const allEvents: EventItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allEvents.push(...result.value);
    }
  }

  // Deduplicate by title + date
  const seen = new Set<string>();
  return allEvents.filter((event) => {
    const key = `${event.title.toLowerCase().trim()}|${event.startDate.slice(0, 10)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
