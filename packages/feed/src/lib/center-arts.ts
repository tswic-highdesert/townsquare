// ============================================================
// Center for the Arts — Scrapes events from tcfta.booktix.com
// (ATU Center for the Arts, 2209 S Knoxville Ave, Russellville, AR)
// ============================================================

import type { EventItem } from "./types.js";
import { stableId } from "../ids";

const SOURCE_URL = "https://tcfta.booktix.com/";
const SOURCE_ID = "center-for-arts";
const COMMUNITY = "Russellville";
const VENUE_NAME = "Center for the Arts";
const VENUE_ADDRESS = "2209 S Knoxville Ave, Russellville, AR";

/** Strip HTML tags and decode common entities */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "\u2013")
    .replace(/&#8212;/g, "\u2014")
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Parse a date range string like "April 24-26, 2026" or "June 12 & 13, 2026" */
function parseDateRange(dateStr: string): { start: string; end?: string } | null {
  const cleaned = dateStr.trim();

  // "Month Day-Day, Year" pattern (e.g., "April 24-26, 2026")
  const rangeMatch = cleaned.match(
    /(\w+)\s+(\d{1,2})\s*[-\u2013]\s*(\d{1,2}),?\s*(\d{4})/
  );
  if (rangeMatch) {
    const month = rangeMatch[1];
    const startDay = parseInt(rangeMatch[2], 10);
    const endDay = parseInt(rangeMatch[3], 10);
    const year = parseInt(rangeMatch[4], 10);
    const startDate = new Date(`${month} ${startDay}, ${year}`);
    const endDate = new Date(`${month} ${endDay}, ${year}`);
    if (!isNaN(startDate.getTime())) {
      return {
        start: startDate.toISOString(),
        end: !isNaN(endDate.getTime()) ? endDate.toISOString() : undefined,
      };
    }
  }

  // "Month Day & Day, Year" pattern (e.g., "June 12 & 13, 2026")
  const ampMatch = cleaned.match(
    /(\w+)\s+(\d{1,2})\s*&\s*(\d{1,2}),?\s*(\d{4})/
  );
  if (ampMatch) {
    const month = ampMatch[1];
    const startDay = parseInt(ampMatch[2], 10);
    const endDay = parseInt(ampMatch[3], 10);
    const year = parseInt(ampMatch[4], 10);
    const startDate = new Date(`${month} ${startDay}, ${year}`);
    const endDate = new Date(`${month} ${endDay}, ${year}`);
    if (!isNaN(startDate.getTime())) {
      return {
        start: startDate.toISOString(),
        end: !isNaN(endDate.getTime()) ? endDate.toISOString() : undefined,
      };
    }
  }

  // "Month Day-Day" without year (e.g., "September 18-19")
  const noYearRangeMatch = cleaned.match(
    /(\w+)\s+(\d{1,2})\s*[-\u2013]\s*(\d{1,2})/
  );
  if (noYearRangeMatch) {
    const month = noYearRangeMatch[1];
    const startDay = parseInt(noYearRangeMatch[2], 10);
    const endDay = parseInt(noYearRangeMatch[3], 10);
    const now = new Date();
    const year = now.getFullYear();
    const startDate = new Date(`${month} ${startDay}, ${year}`);
    const endDate = new Date(`${month} ${endDay}, ${year}`);
    // If the date is in the past, assume next year
    if (startDate.getTime() < now.getTime() - 86400000) {
      startDate.setFullYear(year + 1);
      endDate.setFullYear(year + 1);
    }
    if (!isNaN(startDate.getTime())) {
      return {
        start: startDate.toISOString(),
        end: !isNaN(endDate.getTime()) ? endDate.toISOString() : undefined,
      };
    }
  }

  // Single date: "Month Day, Year" (e.g., "April 30, 2026")
  const singleMatch = cleaned.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (singleMatch) {
    const d = new Date(`${singleMatch[1]} ${singleMatch[2]}, ${singleMatch[3]}`);
    if (!isNaN(d.getTime())) {
      return { start: d.toISOString() };
    }
  }

  // Single date without year: "Month Day" (e.g., "April 30")
  const singleNoYearMatch = cleaned.match(/(\w+)\s+(\d{1,2})/);
  if (singleNoYearMatch) {
    const now = new Date();
    const year = now.getFullYear();
    const d = new Date(`${singleNoYearMatch[1]} ${singleNoYearMatch[2]}, ${year}`);
    if (d.getTime() < now.getTime() - 86400000) {
      d.setFullYear(year + 1);
    }
    if (!isNaN(d.getTime())) {
      return { start: d.toISOString() };
    }
  }

  return null;
}

/** Parse a single BookTix event card HTML block */
function parseEventCard(block: string): EventItem | null {
  try {
    // Extract title from <h3>
    const titleMatch = block.match(/<h3[^>]*>([^<]+)<\/h3>/i);
    if (!titleMatch) return null;
    const title = stripHtml(titleMatch[1]);
    if (!title) return null;

    // Extract event detail URL from "Find Out More" link
    const linkMatch = block.match(/href="(\/dept\/[^"]+)"/i);
    const eventPath = linkMatch ? linkMatch[1] : null;
    const eventUrl = eventPath ? `https://tcfta.booktix.com${eventPath}` : SOURCE_URL;

    // Extract date from the calendar icon section
    // Pattern: <i class="...fa-calendar"></i> Date text
    const dateMatch = block.match(/fa-calendar[^>]*><\/i>\s*([^<]+)/i);
    let dates: { start: string; end?: string } | null = null;
    if (dateMatch) {
      dates = parseDateRange(dateMatch[1]);
    }

    // Fallback: try to find any date-like text in the card
    if (!dates) {
      const fallbackDateMatch = block.match(
        /(\w+\s+\d{1,2}(?:\s*[-&\u2013]\s*\d{1,2})?,?\s*\d{4})/
      );
      if (fallbackDateMatch) {
        dates = parseDateRange(fallbackDateMatch[1]);
      }
    }

    if (!dates) return null;

    // Filter past events
    if (new Date(dates.start) < new Date()) return null;

    // Extract description
    const descMatch = block.match(
      /text-\[#575757\][^>]*>([\s\S]+?)<\/div>/i
    );
    const description = descMatch
      ? stripHtml(descMatch[1]).slice(0, 500)
      : title;

    // Extract price from "On sale" badge or description
    let cost: string | undefined;
    const priceMatch = block.match(/\$\d+(?:\.\d{2})?/);
    if (priceMatch) {
      cost = priceMatch[0];
    }

    // Stable id from the canonical event URL (never title/date), so upstream copy
    // edits don't mint a new tsp_id and orphan RSVPs. Fall back to the source URL
    // only when no /dept/ link was found (rare; still URL-derived, not title-derived).
    const id = stableId("center-arts", eventPath ?? eventUrl);

    return {
      id,
      type: "event",
      title,
      description: description || title,
      source: SOURCE_ID,
      tags: ["arts", "entertainment"],
      community: COMMUNITY,
      geo: {
        lat: 35.2590,
        lng: -93.1377,
        address: VENUE_ADDRESS,
        city: "Russellville",
        state: "AR",
      },
      url: eventUrl,
      startDate: dates.start,
      endDate: dates.end,
      location: VENUE_NAME,
      cost,
      createdAt: dates.start,
      updatedAt: dates.start,
    };
  } catch {
    return null;
  }
}

/** Fetch and parse Center for the Arts events from BookTix */
export async function fetchCenterArtsEvents(): Promise<EventItem[]> {
  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        "User-Agent": "TownSquare/1.0 (local news aggregator)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      console.warn(`[CenterArts] BookTix returned ${response.status}`);
      return [];
    }

    const html = await response.text();

    // Split into individual event cards
    const items = html.split(/event-card-3/);

    const events: EventItem[] = [];
    const seen = new Set<string>();

    // Skip first chunk (before first card)
    for (let i = 1; i < items.length; i++) {
      try {
        const event = parseEventCard(items[i]);
        if (event && !seen.has(event.id)) {
          // Geographic validation: reject events not in Arkansas
          if (event.geo && event.geo.state !== "AR") {
            console.warn(`[CenterArts] Skipping non-AR event: ${event.title}`);
            continue;
          }
          seen.add(event.id);
          events.push(event);
        }
      } catch {
        continue;
      }
    }

    console.log(`[CenterArts] Parsed ${events.length} upcoming events from BookTix`);
    return events;
  } catch (error) {
    console.error("[CenterArts] Error fetching events:", error);
    return [];
  }
}
