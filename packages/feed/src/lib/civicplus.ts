// ============================================================
// CivicPlus Scraper — Parses City of Russellville calendar & alerts
// ============================================================

import type { EventItem, NoticeItem } from "./types.js";

const BASE_URL = "https://russellvillearkansas.org";
const SOURCE_ID = "city-russellville";
const COMMUNITY = "Russellville";
const DEFAULT_TAGS = ["government", "city"];

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&thinsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Generate a deterministic ID for a CivicPlus event */
function generateEventId(eid: string): string {
  return `civicplus-${SOURCE_ID}-${eid}`;
}

/** Generate a deterministic ID for a CivicPlus alert */
function generateAlertId(articleId: string): string {
  return `civicplus-alert-${SOURCE_ID}-${articleId}`;
}

/**
 * Parse a CivicPlus date string like "March 24, 2026, 5:00 PM" into ISO
 * The HTML uses &nbsp; between parts, so we normalize spaces first.
 */
function parseCivicPlusDateTime(dateStr: string): string {
  // Clean up non-breaking spaces and thin spaces
  const cleaned = dateStr
    .replace(/&nbsp;/g, " ")
    .replace(/&thinsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Try to extract just the start datetime (before any dash separator)
  // Format: "March 24, 2026, 11:00 AM - 12:00 PM" or "March 24, 2026"
  const parts = cleaned.split(/\s*[-–]\s*/);
  const startPart = parts[0].trim();

  try {
    const date = new Date(startPart);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  } catch {
    // fall through
  }

  // Fallback: try the whole string
  try {
    const date = new Date(cleaned);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  } catch {
    // fall through
  }

  return new Date().toISOString();
}

/**
 * Parse end time from a date string like "March 24, 2026, 5:00 PM - 6:00 PM"
 */
function parseCivicPlusEndTime(dateStr: string, startDateStr: string): string | undefined {
  const cleaned = dateStr
    .replace(/&nbsp;/g, " ")
    .replace(/&thinsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleaned.split(/\s*[-–]\s*/);
  if (parts.length < 2) return undefined;

  const endTimePart = parts[1].trim(); // e.g., "6:00 PM"

  // Extract the date portion from the start date
  const startDate = new Date(startDateStr);
  if (isNaN(startDate.getTime())) return undefined;

  // Build a full datetime string using the start date's date + end time
  const datePrefix = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;

  try {
    const endDate = new Date(`${datePrefix} ${endTimePart}`);
    if (!isNaN(endDate.getTime())) {
      return endDate.toISOString();
    }
  } catch {
    // fall through
  }

  return undefined;
}

/**
 * Fetch events from the City of Russellville CivicPlus calendar.
 * Parses the schema.org microdata embedded in the HTML.
 */
export async function fetchCivicPlusEvents(): Promise<EventItem[]> {
  try {
    const response = await fetch(`${BASE_URL}/calendar.aspx?view=list`, {
      headers: {
        "User-Agent": "TownSquare/1.0 (local news aggregator)",
      },
    });

    if (!response.ok) {
      console.warn(`[CivicPlus] Calendar returned ${response.status}`);
      return [];
    }

    const html = await response.text();
    const now = new Date();
    const events: EventItem[] = [];

    // Extract each <li> event block within the calendar lists
    // Each event has an eventTitle_{EID} link and schema.org microdata
    const eventPattern =
      /<a\s+id="eventTitle_(\d+)"[^>]*><span>([^<]+)<\/span><\/a>[\s\S]*?<div class="subHeader">([\s\S]*?)<\/div>[\s\S]*?<div class="hidden"[^>]*itemscope[^>]*>([\s\S]*?)<\/div>/g;

    let match;
    while ((match = eventPattern.exec(html)) !== null) {
      const eid = match[1];
      const title = match[2].trim();
      const subHeader = match[3];
      const microdata = match[4];

      // Extract date from subHeader: <div class="date">...</div>
      const dateMatch = subHeader.match(/<div class="date">([\s\S]*?)<\/div>/);
      const rawDateStr = dateMatch ? stripHtml(dateMatch[1]) : "";

      // Extract start date from microdata: <span itemprop="startDate" ...>YYYY-MM-DDTHH:mm:ss</span>
      const startDateMatch = microdata.match(
        /itemprop="startDate"[^>]*>([^<]+)</
      );
      let startDate: string;
      if (startDateMatch) {
        // The microdata has clean ISO-ish format like "2026-03-24T17:00:00"
        const raw = startDateMatch[1].trim();
        // Append Central time offset
        startDate = `${raw}-05:00`;
      } else {
        startDate = parseCivicPlusDateTime(rawDateStr);
      }

      // Skip past events
      const startTime = new Date(startDate);
      if (startTime < now) continue;

      // Parse end time from the human-readable date string
      const endDate = parseCivicPlusEndTime(rawDateStr, startDate);

      // Extract description from microdata
      const descMatch = microdata.match(
        /itemprop="description"[^>]*>([\s\S]*?)<\/p>/
      );
      const description = descMatch ? stripHtml(descMatch[1]) : "";

      // Extract location name from microdata
      const locationMatch = microdata.match(
        /itemprop="location"[\s\S]*?itemprop="name">([^<]+)</
      );
      const location = locationMatch
        ? locationMatch[1].trim()
        : "Russellville, AR";

      // Extract address from microdata
      const streetMatch = microdata.match(
        /itemprop="streetAddress">([^<]+)</
      );
      const cityMatch = microdata.match(
        /itemprop="addressLocality">([^<]+)</
      );
      const stateMatch = microdata.match(
        /itemprop="addressRegion">([^<]+)</
      );
      const zipMatch = microdata.match(
        /itemprop="postalCode">([^<]+)</
      );

      const street = streetMatch ? streetMatch[1].trim() : undefined;
      const city = cityMatch ? cityMatch[1].trim() : "Russellville";
      const state = stateMatch ? stateMatch[1].trim() : "AR";
      const zip = zipMatch ? zipMatch[1].trim() : undefined;

      // Build the event URL
      const eventUrl = `${BASE_URL}/Calendar.aspx?EID=${eid}`;

      // Determine calendar category from the parent div
      // The calendar section title (e.g., "Aquatic Center", "City Calendar") appears
      // before the events in an h2.title
      const categoryTag = getCategoryTag(html, eid);

      const tags = [...DEFAULT_TAGS];
      if (categoryTag && !tags.includes(categoryTag)) {
        tags.push(categoryTag);
      }

      events.push({
        id: generateEventId(eid),
        type: "event",
        title,
        description: description.slice(0, 400),
        source: SOURCE_ID,
        tags,
        community: COMMUNITY,
        url: eventUrl,
        startDate,
        endDate,
        location,
        isAllDay: false,
        geo: street
          ? {
              lat: 0,
              lng: 0,
              address: street,
              city,
              state,
              zip,
            }
          : undefined,
        createdAt: startDate,
        updatedAt: startDate,
      });
    }

    // Deduplicate by title + date
    const seen = new Set<string>();
    return events.filter((event) => {
      const key = `${event.title.toLowerCase().trim()}|${event.startDate.slice(0, 10)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (error) {
    console.error("[CivicPlus] Error fetching calendar:", error);
    return [];
  }
}

/**
 * Try to find the calendar category (section title) for a given event ID.
 * Looks for the nearest <h2 class="title"> before the event.
 */
function getCategoryTag(html: string, eid: string): string | null {
  // Find the position of this event
  const eventPos = html.indexOf(`eventTitle_${eid}`);
  if (eventPos === -1) return null;

  // Search backwards for the nearest <h2 class="title">
  const beforeEvent = html.slice(0, eventPos);
  const titleMatches = [...beforeEvent.matchAll(/<h2 class="title">([^<]+)<\/h2>/g)];
  if (titleMatches.length === 0) return null;

  const lastTitle = titleMatches[titleMatches.length - 1][1].trim();
  return lastTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Fetch civic alerts / news flash from the City of Russellville.
 * Parses the article list HTML from CivicAlerts.aspx.
 */
export async function fetchCivicAlerts(): Promise<NoticeItem[]> {
  try {
    const response = await fetch(`${BASE_URL}/CivicAlerts.aspx`, {
      headers: {
        "User-Agent": "TownSquare/1.0 (local news aggregator)",
      },
    });

    if (!response.ok) {
      console.warn(`[CivicPlus] Alerts returned ${response.status}`);
      return [];
    }

    const html = await response.text();
    const notices: NoticeItem[] = [];

    // Each alert is in a <li id="list-articles-category-{cat}-{id}">
    // with title in aria-label="Open Article {title}" and date in "Posted on {date}"
    const articlePattern =
      /<li\s+id="list-articles-category-\d+-(\d+)"[\s\S]*?aria-label="Open Article ([^"]+)"[\s\S]*?<a\s+href="([^"]+)"[\s\S]*?<div class="article-truncate-3[^"]*"[\s\S]*?<p class="mb-0">([\s\S]*?)<\/p>[\s\S]*?Posted on\s+([A-Za-z]+ \d{1,2}, \d{4})/g;

    let match;
    while ((match = articlePattern.exec(html)) !== null) {
      const articleId = match[1];
      const title = match[2].trim();
      const relativeUrl = match[3].trim();
      const rawDescription = match[4];
      const dateStr = match[5].trim();

      const description = stripHtml(rawDescription).slice(0, 400);
      const postedDate = new Date(dateStr);
      const isoDate = !isNaN(postedDate.getTime())
        ? postedDate.toISOString()
        : new Date().toISOString();

      // Build full URL
      const alertUrl = relativeUrl.startsWith("http")
        ? relativeUrl
        : `${BASE_URL}${relativeUrl}`;

      // Determine severity from title keywords
      let severity: "info" | "warning" | "urgent" | "emergency" = "info";
      const titleLower = title.toLowerCase();
      if (
        titleLower.includes("emergency") ||
        titleLower.includes("evacuat")
      ) {
        severity = "emergency";
      } else if (
        titleLower.includes("urgent") ||
        titleLower.includes("immediate")
      ) {
        severity = "urgent";
      } else if (
        titleLower.includes("warning") ||
        titleLower.includes("notice") ||
        titleLower.includes("alert") ||
        titleLower.includes("advisory")
      ) {
        severity = "warning";
      }

      notices.push({
        id: generateAlertId(articleId),
        type: "notice",
        title,
        description,
        source: SOURCE_ID,
        tags: [...DEFAULT_TAGS, "alert"],
        community: COMMUNITY,
        url: alertUrl,
        severity,
        isActive: true,
        createdAt: isoDate,
        updatedAt: isoDate,
      });
    }

    return notices;
  } catch (error) {
    console.error("[CivicPlus] Error fetching alerts:", error);
    return [];
  }
}
