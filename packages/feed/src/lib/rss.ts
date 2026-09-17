// ============================================================
// RSS Feed Fetcher — Parses RSS feeds into Town Square items
// ============================================================

import { XMLParser } from "fast-xml-parser";
import type { StoryItem } from "./types.js";
import { stableId } from "../ids";
import { fetchWithRetry, sleep } from "./http.js";

/** Raw RSS item from parsed XML */
interface RSSItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  "dc:creator"?: string;
  enclosure?: {
    "@_url"?: string;
    "@_type"?: string;
  };
  guid?: string | { "#text"?: string };
}

/** RSS feed configuration */
export interface FeedConfig {
  url: string;
  section: string;
  tags: string[];
}

/** RSS feed configuration with source info */
export interface RSSFeedConfig extends FeedConfig {
  sourceId: string;
  sourceName: string;
  community: string;
}

/** The Courier RSS feed URLs */
export const COURIER_FEEDS: FeedConfig[] = [
  {
    url: "https://www.couriernews.com/search/?f=rss&t=article&c=news/local&l=25&sd=desc&s=start_time",
    section: "news/local",
    tags: ["local-news"],
  },
  {
    url: "https://www.couriernews.com/search/?f=rss&t=article&c=sports/local_sports&l=25&sd=desc&s=start_time",
    section: "sports/local_sports",
    tags: ["sports"],
  },
  {
    url: "https://www.couriernews.com/search/?f=rss&t=article&c=opinion&l=25&sd=desc&s=start_time",
    section: "opinion",
    tags: ["opinion", "editorial"],
  },
  {
    url: "https://www.couriernews.com/search/?f=rss&t=article&c=news/education&l=25&sd=desc&s=start_time",
    section: "news/education",
    tags: ["education"],
  },
];

/** Additional RSS feeds (non-Courier sources) */
export const RSS_FEEDS: RSSFeedConfig[] = [
  {
    url: "https://www.arkansastechnews.com/feed/",
    section: "atu-news",
    tags: ["university", "atu", "campus-news"],
    sourceId: "arkansas-tech",
    sourceName: "Arkansas Tech University",
    community: "Russellville",
  },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

/**
 * Decode HTML entities left in text.
 *
 * Some sources double-encode, so the XML parser hands back a literal
 * `&#8217;` rather than the apostrophe it stands for. That reaches the screen
 * as `ATU&#8217;s`, so text is decoded once more after parsing.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (whole, name) => {
      const decoded = NAMED_ENTITIES[name.toLowerCase()];
      return decoded === undefined ? whole : decoded;
    });
}

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, "")).trim();
}

/** Generate a deterministic ID from a URL or title */
function generateId(url: string, title: string): string {
  // Prefer the article URL (stable); title only as a last resort for link-less
  // items. Stories aren't RSVP-able, so a title fallback can't orphan an RSVP.
  return stableId("courier", url || title);
}

/** Parse a single RSS feed and return StoryItems */
async function parseFeed(config: FeedConfig): Promise<StoryItem[]> {
  try {
    const response = await fetchWithRetry(config.url, { timeoutMs: 8000, retries: 2 });

    if (!response.ok) {
      console.warn(
        `[RSS] Feed ${config.section} returned ${response.status}`
      );
      return [];
    }

    const xml = await response.text();
    const parsed = parser.parse(xml);

    const channel = parsed?.rss?.channel;
    if (!channel) {
      console.warn(`[RSS] No channel found in feed ${config.section}`);
      return [];
    }

    // Handle both single item and array of items
    const rawItems: RSSItem[] = Array.isArray(channel.item)
      ? channel.item
      : channel.item
        ? [channel.item]
        : [];

    return rawItems
      .map((item): StoryItem | null => {
        const title = decodeEntities(item.title?.toString() ?? "").trim();
        const link = item.link?.toString().trim();
        if (!title) return null;

        const description = item.description
          ? stripHtml(item.description.toString())
          : "";
        const author = item["dc:creator"]?.toString().trim();
        const pubDate = item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString();

        // Get image from enclosure
        const imageUrl = item.enclosure?.["@_url"] || undefined;

        return {
          id: generateId(link || "", title),
          type: "story",
          title,
          description: description.slice(0, 300),
          body: description,
          source: "the-courier",
          tags: [...config.tags],
          community: "Russellville",
          url: link || undefined,
          author: author || undefined,
          publishedAt: pubDate,
          imageUrl: imageUrl,
          createdAt: pubDate,
          updatedAt: pubDate,
        };
      })
      .filter((item): item is StoryItem => item !== null);
  } catch (error) {
    console.error(`[RSS] Error fetching feed ${config.section}:`, error);
    return [];
  }
}

/** Parse a generic RSS feed with custom source info */
async function parseGenericFeed(config: RSSFeedConfig): Promise<StoryItem[]> {
  try {
    const response = await fetchWithRetry(config.url, { timeoutMs: 8000, retries: 2 });

    if (!response.ok) {
      console.warn(`[RSS] Feed ${config.section} returned ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const parsed = parser.parse(xml);

    const channel = parsed?.rss?.channel;
    if (!channel) {
      console.warn(`[RSS] No channel found in feed ${config.section}`);
      return [];
    }

    const rawItems: RSSItem[] = Array.isArray(channel.item)
      ? channel.item
      : channel.item
        ? [channel.item]
        : [];

    return rawItems
      .map((item): StoryItem | null => {
        const title = decodeEntities(item.title?.toString() ?? "").trim();
        const link = item.link?.toString().trim();
        if (!title) return null;

        const description = item.description
          ? stripHtml(item.description.toString())
          : "";
        const author = item["dc:creator"]?.toString().trim();
        const pubDate = item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString();

        const imageUrl = item.enclosure?.["@_url"] || undefined;

        const slug = (link || title)
          .replace(/[^a-zA-Z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase()
          .slice(0, 60);

        return {
          id: `rss-${config.sourceId}-${slug}`,
          type: "story",
          title,
          description: description.slice(0, 300),
          body: description,
          source: config.sourceId,
          tags: [...config.tags],
          community: config.community,
          url: link || undefined,
          author: author || undefined,
          publishedAt: pubDate,
          imageUrl: imageUrl,
          createdAt: pubDate,
          updatedAt: pubDate,
        };
      })
      .filter((item): item is StoryItem => item !== null);
  } catch (error) {
    console.error(`[RSS] Error fetching feed ${config.section}:`, error);
    return [];
  }
}

/** Fetch all additional RSS feeds and return deduplicated stories */
export async function fetchRSSStories(): Promise<StoryItem[]> {
  const results = await Promise.allSettled(
    RSS_FEEDS.map((feed) => parseGenericFeed(feed))
  );

  const allStories: StoryItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allStories.push(...result.value);
    }
  }

  const seen = new Set<string>();
  return allStories.filter((story) => {
    const key = story.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Fetch all Courier RSS feeds and return deduplicated stories */
export async function fetchCourierStories(): Promise<StoryItem[]> {
  // Fetch the Courier feeds one at a time with a small stagger. Hitting the
  // BLOX/TownNews CDN with 4 concurrent requests reliably triggers a 429; a
  // polite sequential trickle (plus the browser UA + retry in fetchWithRetry)
  // does not. parseFeed already degrades to [] on any per-feed failure.
  const allStories: StoryItem[] = [];
  for (let i = 0; i < COURIER_FEEDS.length; i++) {
    if (i > 0) await sleep(300);
    allStories.push(...(await parseFeed(COURIER_FEEDS[i])));
  }

  // Deduplicate by title similarity (exact match after lowercase)
  const seen = new Set<string>();
  return allStories.filter((story) => {
    const key = story.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
