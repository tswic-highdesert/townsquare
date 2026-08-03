// ============================================================
// Facebook Community Posts — Apify-powered fetcher
// Scrapes local Facebook pages & groups for events and notices
// ============================================================

import type { EventItem, NoticeItem } from "./types.js";

const APIFY_TOKEN = process.env.APIFY_API_TOKEN || "";
const SOURCE_ID = "facebook-community";
const COMMUNITY = "Russellville";
const FETCH_TIMEOUT = 300_000; // 5 minutes — Apify sync can be slow

// Skip Apify calls during next build (static generation) to avoid timeouts
const IS_BUILD_TIME = process.env.NEXT_PHASE === "phase-production-build";

// Local scraped data path — written by the facebook_groups_scraper.py pipeline
const LOCAL_SCRAPE_DIR = process.env.FACEBOOK_SCRAPE_DIR || "";

/** Try to read pre-scraped Facebook posts from local JSON files (server-side only) */
function readLocalScrapedPosts(): ApifyPost[] {
  // Only works server-side (Node.js)
  if (typeof window !== "undefined") return [];

  try {
    // Dynamic require to avoid webpack bundling fs for client
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");

    const searchPaths = [
      LOCAL_SCRAPE_DIR,
      path.join(process.cwd(), ".tmp", "facebook_posts"),
      path.join(process.cwd(), "data", "facebook_posts"),
    ].filter(Boolean);

    for (const dir of searchPaths) {
      try {
        if (!fs.existsSync(dir)) continue;

        const files: string[] = fs.readdirSync(dir).filter((f: string) => f.endsWith(".json"));
        const allPosts: ApifyPost[] = [];

        for (const file of files) {
          try {
            const content = fs.readFileSync(path.join(dir, file), "utf-8");
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
              allPosts.push(...data);
            } else if (data && typeof data === "object") {
              if (Array.isArray(data.posts)) {
                allPosts.push(...data.posts);
              } else if (data.text || data.message || data.postText) {
                allPosts.push(data as ApifyPost);
              }
            }
          } catch {
            continue;
          }
        }

        if (allPosts.length > 0) {
          console.log(`[Facebook] Loaded ${allPosts.length} posts from local scrape: ${dir}`);
          return allPosts;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // fs not available (client-side bundle)
  }

  return [];
}

// ---- Facebook page & group URLs ----

const PAGE_URLS = [
  "https://www.facebook.com/CityofRussellville",
  "https://www.facebook.com/RussellvilleFireDept",
  "https://www.facebook.com/CityofRussellvilleRecreationandParks",
  "https://www.facebook.com/downtownrussellville",
];

const GOV_PAGE_SLUGS = new Set([
  "CityofRussellville",
  "RussellvilleFireDept",
  "CityofRussellvilleRecreationandParks",
]);

const GROUP_URLS = [
  "https://www.facebook.com/groups/6183860888337945", // Russellville Word of Mouth
  "https://www.facebook.com/groups/popecountymajority",
];

// ---- Date extraction helpers ----

const MONTH_NAMES =
  "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";

const DATE_PATTERNS = [
  // "March 28", "March 28, 2026", "Mar 28th"
  new RegExp(`${MONTH_NAMES}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:[,\\s]+\\d{4})?`, "gi"),
  // "3/28/2026", "03-28-2026"
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
  // relative references
  /\b(?:this|next)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
  /\b(?:this|next)\s+(?:weekend|week)\b/gi,
  /\btonight\b/gi,
  /\btomorrow\b/gi,
];

const EVENT_KEYWORDS =
  /\b(?:join us|come out|rsvp|register|sign up|tickets|admission|doors open|starts at|happening|workshop|concert|festival|tournament|fundraiser|meeting|gathering|celebration|parade|open house)\b/i;

const LOCATION_KEYWORDS =
  /\b(?:at the|held at|located at|venue|downtown|park|center|library|church|school|stadium|complex|hall|building|plaza|gym|field|lake|river)\b/i;

const NOTICE_KEYWORDS =
  /\b(?:alert|advisory|warning|notice|closure|closed|road work|boil water|outage|emergency|update|announcement|press release|reminder|deadline|cancelled|postponed|rescheduled)\b/i;

const SKIP_PATTERNS =
  /\b(?:happy birthday|rip|rest in peace|prayers|amen|shared a memory|changed .* profile|was tagged)\b/i;

/** Try to parse a rough date from matched text */
function parseRoughDate(dateStr: string): string | null {
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2024) {
      return d.toISOString();
    }
  } catch {
    // ignore
  }

  // Try adding current year
  try {
    const withYear = `${dateStr} ${new Date().getFullYear()}`;
    const d = new Date(withYear);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch {
    // ignore
  }

  return null;
}

/** Extract the first date found in text */
function extractDate(text: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      const parsed = parseRoughDate(match[0]);
      if (parsed) return parsed;
    }
  }
  return null;
}

/** Extract a rough location from text */
function extractLocation(text: string): string | null {
  // Look for "at [Location Name]" pattern
  const atMatch = text.match(/\bat\s+(?:the\s+)?([A-Z][A-Za-z\s&'.-]{2,40})(?:[,.\n!]|$)/);
  if (atMatch) return atMatch[1].trim();

  // Look for known Russellville locations
  const knownLocations = [
    "Downtown Russellville",
    "River Valley Sports Complex",
    "Old Post Park",
    "Russellville Public Library",
    "Lake Dardanelle",
    "Arkansas Tech",
    "Russellville Civic Center",
    "River Valley Arts Center",
    "City Hall",
  ];
  for (const loc of knownLocations) {
    if (text.toLowerCase().includes(loc.toLowerCase())) return loc;
  }

  return null;
}

/** Determine if a page slug belongs to a government source */
function isGovSource(url: string): boolean {
  for (const slug of GOV_PAGE_SLUGS) {
    if (url.includes(slug)) return true;
  }
  return false;
}

/** Generate a stable ID from post data */
function makeId(prefix: string, postId: string | number, idx: number): string {
  const hash = String(postId || idx).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  return `fb-${prefix}-${hash}`;
}

// ---- Apify API calls ----

interface ApifyPost {
  postId?: string;
  id?: string;
  text?: string;
  message?: string;
  postText?: string;
  url?: string;
  postUrl?: string;
  time?: string;
  timestamp?: string;
  date?: string;
  pageName?: string;
  pageUrl?: string;
  groupName?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  reactions?: number;
  [key: string]: unknown;
}

async function callApify(actorId: string, input: Record<string, unknown>): Promise<ApifyPost[]> {
  if (!APIFY_TOKEN) {
    console.warn("[Facebook] No APIFY_API_TOKEN set, skipping fetch");
    return [];
  }

  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[Facebook] Apify ${actorId} returned ${res.status}: ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) {
      console.warn(`[Facebook] Apify ${actorId} timed out after ${FETCH_TIMEOUT / 1000}s`);
    } else {
      console.warn(`[Facebook] Apify ${actorId} error: ${msg}`);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPagePosts(): Promise<ApifyPost[]> {
  return callApify("apify~facebook-posts-scraper", {
    startUrls: PAGE_URLS.map((u) => ({ url: u })),
    resultsLimit: 20,
  });
}

async function fetchGroupPosts(): Promise<ApifyPost[]> {
  return callApify("apify~facebook-groups-scraper", {
    startUrls: GROUP_URLS.map((u) => ({ url: u })),
    resultsLimit: 30,
  });
}

// ---- Post classification & conversion ----

function getPostText(post: ApifyPost): string {
  return post.text || post.message || post.postText || "";
}

function getPostUrl(post: ApifyPost): string {
  return post.url || post.postUrl || "";
}

function getPostDate(post: ApifyPost): string {
  const raw = post.time || post.timestamp || post.date;
  if (raw) {
    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch {
      // fall through
    }
  }
  return new Date().toISOString();
}

function getPostId(post: ApifyPost, idx: number): string {
  return String(post.postId || post.id || idx);
}

/** Convert a Facebook post into an EventItem if it looks event-like */
function postToEvent(post: ApifyPost, idx: number): EventItem | null {
  const text = getPostText(post);
  if (!text || text.length < 20) return null;
  if (SKIP_PATTERNS.test(text)) return null;

  const hasDateRef = DATE_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(text);
  });
  const hasEventKeyword = EVENT_KEYWORDS.test(text);
  const hasLocation = LOCATION_KEYWORDS.test(text);

  // Must have at least a date reference + one other signal
  if (!hasDateRef || (!hasEventKeyword && !hasLocation)) return null;

  const extractedDate = extractDate(text);
  const location = extractLocation(text) || "Russellville, AR";
  const postDate = getPostDate(post);

  // Build title from first line or truncate
  const firstLine = text.split(/[\n.!?]/)[0].trim();
  const title =
    firstLine.length > 10 && firstLine.length < 120
      ? firstLine
      : text.slice(0, 100).trim() + "…";

  return {
    id: makeId("evt", getPostId(post, idx), idx),
    type: "event",
    title,
    description: text.slice(0, 500),
    source: SOURCE_ID,
    tags: ["community", "facebook", "local-event"],
    community: COMMUNITY,
    url: getPostUrl(post),
    createdAt: postDate,
    updatedAt: postDate,
    startDate: extractedDate || postDate,
    location,
  };
}

/** Convert a government-page post into a NoticeItem */
function postToNotice(post: ApifyPost, idx: number): NoticeItem | null {
  const text = getPostText(post);
  if (!text || text.length < 20) return null;
  if (SKIP_PATTERNS.test(text)) return null;

  // For gov pages: default to notice. For others, only if notice keywords match.
  const pageUrl = post.pageUrl || getPostUrl(post) || "";
  const fromGov = isGovSource(pageUrl);

  if (!fromGov && !NOTICE_KEYWORDS.test(text)) return null;

  const postDate = getPostDate(post);
  const firstLine = text.split(/[\n.!?]/)[0].trim();
  const title =
    firstLine.length > 10 && firstLine.length < 120
      ? firstLine
      : text.slice(0, 100).trim() + "…";

  const severity = /\b(?:emergency|urgent|evacuate|danger)\b/i.test(text)
    ? "urgent"
    : /\b(?:warning|closure|closed|boil water|outage)\b/i.test(text)
      ? "warning"
      : "info";

  return {
    id: makeId("ntc", getPostId(post, idx), idx),
    type: "notice",
    title,
    description: text.slice(0, 500),
    source: SOURCE_ID,
    tags: ["community", "facebook", "government", "announcement"],
    community: COMMUNITY,
    url: getPostUrl(post),
    createdAt: postDate,
    updatedAt: postDate,
    severity,
    isActive: true,
  };
}

// ---- Public API ----

/** Get all Facebook posts — try local scraped data first, then Apify */
async function getAllFacebookPosts(): Promise<{ pagePosts: ApifyPost[]; groupPosts: ApifyPost[] }> {
  // 1. Try local scraped data first (free, no API cost)
  const localPosts = readLocalScrapedPosts();
  if (localPosts.length > 0) {
    // Separate page vs group posts based on URL patterns
    const pagePosts = localPosts.filter((p) => {
      const url = p.pageUrl || getPostUrl(p) || "";
      return !url.includes("/groups/");
    });
    const groupPosts = localPosts.filter((p) => {
      const url = p.pageUrl || getPostUrl(p) || "";
      return url.includes("/groups/");
    });
    return { pagePosts, groupPosts };
  }

  // 2. Fall back to Apify if no local data and not build time
  if (IS_BUILD_TIME || !APIFY_TOKEN) {
    return { pagePosts: [], groupPosts: [] };
  }

  const [pagePosts, groupPosts] = await Promise.all([
    fetchPagePosts(),
    fetchGroupPosts(),
  ]);
  return { pagePosts, groupPosts };
}

/** Fetch events extracted from Facebook community posts */
export async function fetchFacebookEvents(): Promise<EventItem[]> {
  const { pagePosts, groupPosts } = await getAllFacebookPosts();
  if (pagePosts.length === 0 && groupPosts.length === 0) return [];

  const events: EventItem[] = [];

  // Group posts are primary event candidates
  for (let i = 0; i < groupPosts.length; i++) {
    const evt = postToEvent(groupPosts[i], i);
    if (evt) events.push(evt);
  }

  // Page posts can also contain events (recreation, downtown, etc.)
  for (let i = 0; i < pagePosts.length; i++) {
    const pageUrl = pagePosts[i].pageUrl || getPostUrl(pagePosts[i]) || "";
    // Skip gov pages for events — those become notices
    if (isGovSource(pageUrl)) continue;
    const evt = postToEvent(pagePosts[i], i + groupPosts.length);
    if (evt) events.push(evt);
  }

  console.log(`[Facebook] Extracted ${events.length} events from ${pagePosts.length + groupPosts.length} posts`);
  return events;
}

/** Fetch notices/announcements from Facebook government pages */
export async function fetchFacebookNotices(): Promise<NoticeItem[]> {
  const { pagePosts } = await getAllFacebookPosts();
  if (pagePosts.length === 0) return [];

  const notices: NoticeItem[] = [];

  for (let i = 0; i < pagePosts.length; i++) {
    const notice = postToNotice(pagePosts[i], i);
    if (notice) notices.push(notice);
  }

  console.log(`[Facebook] Extracted ${notices.length} notices from ${pagePosts.length} page posts`);
  return notices;
}
