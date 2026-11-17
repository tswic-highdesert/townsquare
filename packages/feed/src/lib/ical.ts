// ============================================================
// iCal Feed Parser — Parses iCal (.ics) feeds into EventItems
// ============================================================

import type { EventItem } from "./types.js";
import { parseICalDate } from "./ical-date.js";

/** iCal feed configuration */
export interface ICalFeedConfig {
  url: string;
  sourceId: string;
  sourceName: string;
  defaultTags: string[];
  community: string;
}

/** Known iCal feeds for Russellville */
export const ICAL_FEEDS: ICalFeedConfig[] = [
  {
    url: "https://www.arkansastechnews.com/events/?ical=1",
    sourceId: "arkansas-tech",
    sourceName: "Arkansas Tech University",
    defaultTags: ["university", "atu"],
    community: "Russellville",
  },
  {
    url: "https://arkansastechsports.com/calendar.ashx/calendar.ics",
    sourceId: "arkansas-tech",
    sourceName: "ATU Athletics",
    defaultTags: ["sports", "atu", "athletics"],
    community: "Russellville",
  },
];

/** Unescape iCal text values */
function unescapeIcal(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/** Parse a VEVENT block into key-value pairs */
function parseVEvent(block: string): Record<string, string> {
  const props: Record<string, string> = {};
  // Unfold long lines (lines starting with space/tab are continuations)
  const unfolded = block.replace(/\r?\n[ \t]/g, "");

  for (const line of unfolded.split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const rawKey = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);

    // Normalize key: strip parameters (e.g., DTSTART;VALUE=DATE → DTSTART)
    const key = rawKey.split(";")[0].toUpperCase();
    const timeZone = rawKey.match(/;TZID=([^;]+)/i)?.[1]?.replace(/^"|"$/g, "");
    if (timeZone) props[`${key}_TZID`] = timeZone;

    // Check if this is an all-day date
    if (rawKey.includes("VALUE=DATE") && (key === "DTSTART" || key === "DTEND")) {
      props[key] = value;
      props[`${key}_ALLDAY`] = "true";
    } else {
      props[key] = value;
    }
  }
  return props;
}

/** Generate a deterministic ID for an iCal event */
function generateEventId(sourceId: string, uid: string): string {
  const slug = uid
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40);
  return `ical-${sourceId}-${slug}`;
}

/** Strip HTML from text */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

/** Fetch and parse a single iCal feed */
async function parseICalFeed(
  config: ICalFeedConfig
): Promise<EventItem[]> {
  try {
    const response = await fetch(config.url, {
      headers: {
        "User-Agent": "TownSquare/1.0 (local news aggregator)",
      },
    });

    if (!response.ok) {
      console.warn(
        `[iCal] Feed ${config.sourceName} returned ${response.status}`
      );
      return [];
    }

    const text = await response.text();

    // Extract VEVENT blocks
    const eventBlocks = text.match(
      /BEGIN:VEVENT[\s\S]*?END:VEVENT/g
    );
    if (!eventBlocks) return [];

    const now = new Date();
    const events: EventItem[] = [];

    for (const block of eventBlocks) {
      const props = parseVEvent(block);

      const summary = props.SUMMARY;
      if (!summary) continue;

      const dtStart = props.DTSTART;
      if (!dtStart) continue;

      const isAllDay = props.DTSTART_ALLDAY === "true";
      const startDate = parseICalDate(dtStart, props.DTSTART_TZID);
      const endDate = props.DTEND
        ? parseICalDate(props.DTEND, props.DTEND_TZID)
        : undefined;

      // Skip past events (more than 1 day ago)
      const startTime = new Date(startDate);
      const oneDayAgo = new Date(now.getTime() - 86400000);
      if (startTime < oneDayAgo && !isAllDay) continue;

      const description = props.DESCRIPTION
        ? stripHtml(unescapeIcal(props.DESCRIPTION))
        : "";
      const location = props.LOCATION
        ? unescapeIcal(props.LOCATION)
        : "Arkansas Tech University";
      const url = props.URL || undefined;
      const uid = props.UID || url;
      if (!uid) continue;
      const categories = props.CATEGORIES || "";

      // Auto-tag from categories
      const tags = [...config.defaultTags];
      if (categories) {
        const cats = categories.split(",").map((c) => c.trim().toLowerCase());
        for (const cat of cats) {
          const tag = cat
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          if (tag && !tags.includes(tag)) tags.push(tag);
        }
      }

      events.push({
        id: generateEventId(config.sourceId, uid),
        type: "event",
        title: unescapeIcal(summary),
        description: description.slice(0, 400),
        source: config.sourceId,
        tags,
        community: config.community,
        url,
        startDate,
        endDate,
        location,
        isAllDay,
        createdAt: startDate,
        updatedAt: startDate,
      });
    }

    return events;
  } catch (error) {
    console.error(
      `[iCal] Error fetching feed ${config.sourceName}:`,
      error
    );
    return [];
  }
}

/** Fetch all iCal feeds and return events */
export async function fetchICalEvents(): Promise<EventItem[]> {
  const results = await Promise.allSettled(
    ICAL_FEEDS.map((feed) => parseICalFeed(feed))
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
