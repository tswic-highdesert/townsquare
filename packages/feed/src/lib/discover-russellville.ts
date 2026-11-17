// ============================================================
// Discover Russellville — Google Calendar Event Fetcher
// ============================================================
// Fetches community events from the Discover Russellville
// Google Calendar (via public iCal feed).
// ============================================================

import type { EventItem } from "./types.js";
import { parseICalDate } from "./ical-date.js";

/** Google Calendar public iCal URL for Discover Russellville */
const ICAL_URL =
  "https://calendar.google.com/calendar/ical/a0c2aa71da370f1101acaa4728a5618591f6b7794ae18a23f82f8d194e8aee06%40group.calendar.google.com/public/basic.ics";

const SOURCE_ID = "discover-russellville";
const COMMUNITY = "Russellville";
const DEFAULT_TAGS = ["community", "local"];

/** Unescape iCal text values */
function unescapeIcal(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/** Strip HTML from text */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
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

    if (
      rawKey.includes("VALUE=DATE") &&
      (key === "DTSTART" || key === "DTEND")
    ) {
      props[key] = value;
      props[`${key}_ALLDAY`] = "true";
    } else {
      props[key] = value;
    }
  }
  return props;
}

/** Generate a deterministic ID for an event */
function generateEventId(uid: string, recurrenceId?: string): string {
  const slug = uid
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40);
  // Calendar exceptions share the series UID. RECURRENCE-ID identifies the
  // original occurrence even when its title or scheduled time changes.
  // Preserve existing IDs for series masters and non-recurring events.
  const occurrence = recurrenceId?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `dr-${slug}${occurrence ? `-${occurrence}` : ""}`;
}

/** Fetch and parse the Discover Russellville Google Calendar */
export async function fetchDiscoverRussellvilleEvents(): Promise<EventItem[]> {
  try {
    const response = await fetch(ICAL_URL, {
      headers: {
        "User-Agent": "TownSquare/1.0 (local news aggregator)",
      },
    });

    if (!response.ok) {
      console.warn(
        `[DiscoverRussellville] Feed returned ${response.status}`
      );
      return [];
    }

    const text = await response.text();

    // Extract VEVENT blocks
    const eventBlocks = text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g);
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

      // For all-day events, check end date
      if (isAllDay && endDate) {
        const endTime = new Date(endDate);
        if (endTime < oneDayAgo) continue;
      }

      const description = props.DESCRIPTION
        ? stripHtml(unescapeIcal(props.DESCRIPTION))
        : "";
      const location = props.LOCATION
        ? unescapeIcal(props.LOCATION)
        : "Russellville, AR";
      const url = props.URL || undefined;
      const uid = props.UID || url;
      if (!uid) continue;

      events.push({
        id: generateEventId(uid, props["RECURRENCE-ID"]),
        type: "event",
        title: unescapeIcal(summary),
        description: description.slice(0, 400),
        source: SOURCE_ID,
        tags: [...DEFAULT_TAGS],
        community: COMMUNITY,
        url,
        startDate,
        endDate,
        location,
        isAllDay,
        createdAt: startDate,
        updatedAt: startDate,
      });
    }

    // Deduplicate by title + date
    const seen = new Set<string>();
    const deduped = events.filter((event) => {
      const key = `${event.title.toLowerCase().trim()}|${event.startDate.slice(0, 10)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(
      `[DiscoverRussellville] Fetched ${deduped.length} upcoming events`
    );
    return deduped;
  } catch (error) {
    console.error("[DiscoverRussellville] Error fetching calendar:", error);
    return [];
  }
}
