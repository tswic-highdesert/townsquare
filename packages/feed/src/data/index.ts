import { businesses } from "./businesses.js";
import { sources } from "./sources.js";
import { withTimeout } from "../timeout";
import { fetchCourierStories, fetchRSSStories } from "../lib/rss";
import { fetchICalEvents } from "../lib/ical";
import { fetchThrillshareEvents } from "../lib/thrillshare";
import { fetchCivicPlusEvents, fetchCivicAlerts } from "../lib/civicplus";
import { fetchChamberEvents } from "../lib/chamber";
import { fetchDiscoverRussellvilleEvents } from "../lib/discover-russellville";
import { fetchStateParksEvents } from "../lib/state-parks";
import { fetchNWSAlerts } from "../lib/nws-alerts";
import { fetchLibraryEvents } from "../lib/library";
import { fetchMainStreetEvents } from "../lib/mainstreet";
import { fetchFacebookEvents, fetchFacebookNotices } from "../lib/facebook";
import { fetchEvvntEvents } from "../lib/evvnt";
import { fetchCenterArtsEvents } from "../lib/center-arts";
import { fetchPopeCountyEvents } from "../lib/pope-county";
import type { TownSquareItem, StoryItem, EventItem, NoticeItem, BusinessItem, Source } from "../lib/types";

export { sources };

/** Source status tracking */
export interface SourceStatus {
  id: string;
  name: string;
  type: "live" | "seeded";
  itemCount: number;
  lastFetched?: string;
}

/** Cache for fetched data (module-level, persists during build/request) */
let cachedCourierStories: StoryItem[] | null = null;
let cachedRSSStories: StoryItem[] | null = null;
let cachedICalEvents: EventItem[] | null = null;
let cachedThrillshareEvents: EventItem[] | null = null;
let cachedCivicPlusEvents: EventItem[] | null = null;
let cachedCivicAlerts: NoticeItem[] | null = null;
let cachedChamberEvents: EventItem[] | null = null;
let cachedDiscoverRussellvilleEvents: EventItem[] | null = null;
let cachedStateParksEvents: EventItem[] | null = null;
let cachedNWSAlerts: NoticeItem[] | null = null;
let cachedLibraryEvents: EventItem[] | null = null;
let cachedMainStreetEvents: EventItem[] | null = null;
let cachedEvvntEvents: EventItem[] | null = null;
let cachedFacebookEvents: EventItem[] | null = null;
let cachedFacebookNotices: NoticeItem[] | null = null;
let cachedCenterArtsEvents: EventItem[] | null = null;
let cachedPopeCountyEvents: EventItem[] | null = null;
let lastFetchTime = 0;
let lastFacebookFetchTime = 0;
const CACHE_TTL = 900_000; // 15 minutes
const FACEBOOK_CACHE_TTL = 3_600_000; // 60 minutes — Apify runs cost money

const FETCH_TIMEOUT_MS = 12_000;
/** Bound a source fetch; on timeout/error fall back to the empty list so one
 *  slow/hung upstream can't stall the cron run. */
function bounded<T>(p: Promise<T[]>): Promise<T[]> {
  return withTimeout(p, FETCH_TIMEOUT_MS).catch(() => [] as T[]);
}

/** Fetch live Courier stories with caching */
async function getLiveCourierStories(): Promise<StoryItem[]> {
  const now = Date.now();
  if (cachedCourierStories && now - lastFetchTime < CACHE_TTL) {
    return cachedCourierStories;
  }
  try {
    cachedCourierStories = await fetchCourierStories();
    lastFetchTime = now;
    return cachedCourierStories;
  } catch {
    console.warn("[Data] Failed to fetch Courier stories, using cache or empty");
    return cachedCourierStories || [];
  }
}

/** Fetch live RSS stories (ATU News, etc.) with caching */
async function getLiveRSSStories(): Promise<StoryItem[]> {
  const now = Date.now();
  if (cachedRSSStories && now - lastFetchTime < CACHE_TTL) {
    return cachedRSSStories;
  }
  try {
    cachedRSSStories = await fetchRSSStories();
    lastFetchTime = now;
    return cachedRSSStories;
  } catch {
    console.warn("[Data] Failed to fetch RSS stories, using cache or empty");
    return cachedRSSStories || [];
  }
}

/** Fetch live iCal events with caching */
async function getLiveICalEvents(): Promise<EventItem[]> {
  const now = Date.now();
  if (cachedICalEvents && now - lastFetchTime < CACHE_TTL) {
    return cachedICalEvents;
  }
  try {
    cachedICalEvents = await fetchICalEvents();
    lastFetchTime = now;
    return cachedICalEvents;
  } catch {
    console.warn("[Data] Failed to fetch iCal events, using cache or empty");
    return cachedICalEvents || [];
  }
}

/** Fetch live Thrillshare events (Russellville SD) with caching */
async function getLiveThrillshareEvents(): Promise<EventItem[]> {
  const now = Date.now();
  if (cachedThrillshareEvents && now - lastFetchTime < CACHE_TTL) {
    return cachedThrillshareEvents;
  }
  try {
    cachedThrillshareEvents = await fetchThrillshareEvents();
    lastFetchTime = now;
    return cachedThrillshareEvents;
  } catch {
    console.warn("[Data] Failed to fetch Thrillshare events, using cache or empty");
    return cachedThrillshareEvents || [];
  }
}

/** Fetch live CivicPlus events (City of Russellville) with caching */
async function getLiveCivicPlusEvents(): Promise<EventItem[]> {
  const now = Date.now();
  if (cachedCivicPlusEvents && now - lastFetchTime < CACHE_TTL) {
    return cachedCivicPlusEvents;
  }
  try {
    cachedCivicPlusEvents = await fetchCivicPlusEvents();
    lastFetchTime = now;
    return cachedCivicPlusEvents;
  } catch {
    console.warn("[Data] Failed to fetch CivicPlus events, using cache or empty");
    return cachedCivicPlusEvents || [];
  }
}

/** Fetch live CivicPlus alerts (City of Russellville) with caching */
async function getLiveCivicAlerts(): Promise<NoticeItem[]> {
  const now = Date.now();
  if (cachedCivicAlerts && now - lastFetchTime < CACHE_TTL) {
    return cachedCivicAlerts;
  }
  try {
    cachedCivicAlerts = await fetchCivicAlerts();
    lastFetchTime = now;
    return cachedCivicAlerts;
  } catch {
    console.warn("[Data] Failed to fetch CivicPlus alerts, using cache or empty");
    return cachedCivicAlerts || [];
  }
}

/** Fetch live Chamber of Commerce events with caching */
async function getLiveChamberEvents(): Promise<EventItem[]> {
  const now = Date.now();
  if (cachedChamberEvents && now - lastFetchTime < CACHE_TTL) {
    return cachedChamberEvents;
  }
  try {
    cachedChamberEvents = await fetchChamberEvents();
    lastFetchTime = now;
    return cachedChamberEvents;
  } catch {
    console.warn("[Data] Failed to fetch Chamber events, using cache or empty");
    return cachedChamberEvents || [];
  }
}

/** Fetch live Discover Russellville events with caching */
async function getLiveDiscoverRussellvilleEvents(): Promise<EventItem[]> {
  const now = Date.now();
  if (cachedDiscoverRussellvilleEvents && now - lastFetchTime < CACHE_TTL) {
    return cachedDiscoverRussellvilleEvents;
  }
  try {
    cachedDiscoverRussellvilleEvents = await fetchDiscoverRussellvilleEvents();
    lastFetchTime = now;
    return cachedDiscoverRussellvilleEvents;
  } catch {
    console.warn("[Data] Failed to fetch Discover Russellville events, using cache or empty");
    return cachedDiscoverRussellvilleEvents || [];
  }
}

/** Fetch live State Parks events (Lake Dardanelle) with caching */
async function getLiveStateParksEvents(): Promise<EventItem[]> {
  const now = Date.now();
  if (cachedStateParksEvents && now - lastFetchTime < CACHE_TTL) {
    return cachedStateParksEvents;
  }
  try {
    cachedStateParksEvents = await fetchStateParksEvents();
    lastFetchTime = now;
    return cachedStateParksEvents;
  } catch {
    console.warn("[Data] Failed to fetch State Parks events, using cache or empty");
    return cachedStateParksEvents || [];
  }
}

/** Fetch live NWS weather alerts with caching */
async function getLiveNWSAlerts(): Promise<NoticeItem[]> {
  const now = Date.now();
  if (cachedNWSAlerts && now - lastFetchTime < CACHE_TTL) {
    return cachedNWSAlerts;
  }
  try {
    cachedNWSAlerts = await fetchNWSAlerts();
    lastFetchTime = now;
    return cachedNWSAlerts;
  } catch {
    console.warn("[Data] Failed to fetch NWS alerts, using cache or empty");
    return cachedNWSAlerts || [];
  }
}

/** Fetch live Main Street Russellville events with caching */
async function getLiveMainStreetEvents(): Promise<EventItem[]> {
  const now = Date.now();
  if (cachedMainStreetEvents && now - lastFetchTime < CACHE_TTL) {
    return cachedMainStreetEvents;
  }
  try {
    cachedMainStreetEvents = await fetchMainStreetEvents();
    lastFetchTime = now;
    return cachedMainStreetEvents;
  } catch {
    console.warn("[Data] Failed to fetch Main Street events, using cache or empty");
    return cachedMainStreetEvents || [];
  }
}

/** Fetch live Evvnt/Courier events with caching */
async function getLiveEvvntEvents(): Promise<EventItem[]> {
  const now = Date.now();
  if (cachedEvvntEvents && now - lastFetchTime < CACHE_TTL) {
    return cachedEvvntEvents;
  }
  try {
    cachedEvvntEvents = await fetchEvvntEvents();
    lastFetchTime = now;
    return cachedEvvntEvents;
  } catch {
    console.warn("[Data] Failed to fetch Evvnt events, using cache or empty");
    return cachedEvvntEvents || [];
  }
}

/** Fetch live Facebook events with caching (60-min TTL) */
async function getLiveFacebookEvents(): Promise<EventItem[]> {
  const now = Date.now();
  if (cachedFacebookEvents && now - lastFacebookFetchTime < FACEBOOK_CACHE_TTL) {
    return cachedFacebookEvents;
  }
  try {
    cachedFacebookEvents = await fetchFacebookEvents();
    lastFacebookFetchTime = now;
    return cachedFacebookEvents;
  } catch {
    console.warn("[Data] Failed to fetch Facebook events, using cache or empty");
    return cachedFacebookEvents || [];
  }
}

/** Fetch live Facebook notices with caching (60-min TTL) */
async function getLiveFacebookNotices(): Promise<NoticeItem[]> {
  const now = Date.now();
  if (cachedFacebookNotices && now - lastFacebookFetchTime < FACEBOOK_CACHE_TTL) {
    return cachedFacebookNotices;
  }
  try {
    cachedFacebookNotices = await fetchFacebookNotices();
    lastFacebookFetchTime = now;
    return cachedFacebookNotices;
  } catch {
    console.warn("[Data] Failed to fetch Facebook notices, using cache or empty");
    return cachedFacebookNotices || [];
  }
}

/** Fetch live Pope County Library events with caching */
async function getLiveLibraryEvents(): Promise<EventItem[]> {
  const now = Date.now();
  if (cachedLibraryEvents && now - lastFetchTime < CACHE_TTL) {
    return cachedLibraryEvents;
  }
  try {
    cachedLibraryEvents = await fetchLibraryEvents();
    lastFetchTime = now;
    return cachedLibraryEvents;
  } catch {
    console.warn("[Data] Failed to fetch Library events, using cache or empty");
    return cachedLibraryEvents || [];
  }
}

/** Fetch live Center for the Arts events with caching */
async function getLiveCenterArtsEvents(): Promise<EventItem[]> {
  const now = Date.now();
  if (cachedCenterArtsEvents && now - lastFetchTime < CACHE_TTL) {
    return cachedCenterArtsEvents;
  }
  try {
    cachedCenterArtsEvents = await fetchCenterArtsEvents();
    lastFetchTime = now;
    return cachedCenterArtsEvents;
  } catch {
    console.warn("[Data] Failed to fetch Center for the Arts events, using cache or empty");
    return cachedCenterArtsEvents || [];
  }
}

/** Fetch live Pope County government meetings with caching */
async function getLivePopeCountyEvents(): Promise<EventItem[]> {
  const now = Date.now();
  if (cachedPopeCountyEvents && now - lastFetchTime < CACHE_TTL) {
    return cachedPopeCountyEvents;
  }
  try {
    cachedPopeCountyEvents = await fetchPopeCountyEvents();
    lastFetchTime = now;
    return cachedPopeCountyEvents;
  } catch {
    console.warn("[Data] Failed to fetch Pope County events, using cache or empty");
    return cachedPopeCountyEvents || [];
  }
}

/** Deduplicate stories by title similarity */
function deduplicateStories(items: StoryItem[]): StoryItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Deduplicate events by title + date */
function deduplicateEvents(items: EventItem[]): EventItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.title.toLowerCase().trim()}|${item.startDate.slice(0, 10)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Assemble the public-facing item list: include businesses, drop items whose
 * source is `discovery-only` (e.g. Facebook — an operator signal, never shown
 * to users), and sort newest-first. Pure + unit-testable (no network).
 *
 * Two intentional design points (please don't "clean up"):
 * - Facebook is still fetched upstream because `getSourceStatuses` needs its
 *   counts; it's dropped here purely by its `discovery-only` rule.
 * - The filter is permissive-by-default: an item whose source isn't found is
 *   INCLUDED. We'd rather show an item than silently hide it because a
 *   `sources.ts` row is missing.
 */
export function assemblePublicItems(
  events: EventItem[],
  notices: NoticeItem[],
  stories: StoryItem[],
  businessItems: BusinessItem[]
): TownSquareItem[] {
  const all: TownSquareItem[] = [...events, ...notices, ...stories, ...businessItems];
  return all
    .filter((item) => {
      const src = getSource(item.source);
      return src?.republishRule !== "discovery-only" && src?.enabled !== false;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Find an item by id within a given list. Pure + unit-testable. */
export function findItemById(items: TownSquareItem[], id: string): TownSquareItem | undefined {
  return items.find((item) => item.id === id);
}

/** Async by-id lookup over the live public feed. */
// TODO: O(1) lookup once the ingest layer exists (currently scans the cached full feed).
export async function getItemByIdAsync(id: string): Promise<TownSquareItem | undefined> {
  const items = await getAllItemsAsync();
  return findItemById(items, id);
}

/** Get all items including live feeds, sorted by most recent first */
export async function getAllItemsAsync(): Promise<TownSquareItem[]> {
  const [courierStories, rssStories, icalEvents, thrillshareEvents, civicPlusEvents, civicAlerts, chamberEvents, discoverRussellvilleEvents, stateParksEvents, nwsAlerts, mainStreetEvents, evvntEvents, facebookEvents, facebookNotices, libraryEvents, centerArtsEvents, popeCountyEvents] = await Promise.all([
    bounded(getLiveCourierStories()),
    bounded(getLiveRSSStories()),
    bounded(getLiveICalEvents()),
    bounded(getLiveThrillshareEvents()),
    bounded(getLiveCivicPlusEvents()),
    bounded(getLiveCivicAlerts()),
    bounded(getLiveChamberEvents()),
    bounded(getLiveDiscoverRussellvilleEvents()),
    bounded(getLiveStateParksEvents()),
    bounded(getLiveNWSAlerts()),
    bounded(getLiveMainStreetEvents()),
    bounded(getLiveEvvntEvents()),
    bounded(getLiveFacebookEvents()),
    bounded(getLiveFacebookNotices()),
    bounded(getLiveLibraryEvents()),
    bounded(getLiveCenterArtsEvents()),
    bounded(getLivePopeCountyEvents()),
  ]);

  const allStories = deduplicateStories([...courierStories, ...rssStories]);
  const allEventsDeduped = deduplicateEvents([...icalEvents, ...thrillshareEvents, ...civicPlusEvents, ...chamberEvents, ...discoverRussellvilleEvents, ...stateParksEvents, ...mainStreetEvents, ...evvntEvents, ...facebookEvents, ...libraryEvents, ...centerArtsEvents, ...popeCountyEvents]);

  // Drop events whose startDate is more than 1 day in the past.
  // Individual fetchers do this too, but not all of them do — this is the
  // belt-and-suspenders pass so past events never leak into the aggregated feed.
  const oneDayAgoMs = Date.now() - 86_400_000;
  const allEvents = allEventsDeduped.filter((e) => {
    const end = e.endDate ? new Date(e.endDate).getTime() : new Date(e.startDate).getTime();
    return end >= oneDayAgoMs;
  });

  const allNotices = [...civicAlerts, ...nwsAlerts, ...facebookNotices];

  return assemblePublicItems(allEvents, allNotices, allStories, businesses);
}

/** Get source statuses — which are live vs seeded */
export async function getSourceStatuses(): Promise<SourceStatus[]> {
  const [courierStories, rssStories, icalEvents, thrillshareEvents, civicPlusEvents, civicAlerts, chamberEvents, discoverRvEvents, stateParksEventsStatus, nwsAlertsStatus, mainStreetEventsStatus, evvntEventsStatus, facebookEventsStatus, facebookNoticesStatus, libraryEventsStatus, centerArtsEventsStatus, popeCountyEventsStatus] = await Promise.all([
    getLiveCourierStories(),
    getLiveRSSStories(),
    getLiveICalEvents(),
    getLiveThrillshareEvents(),
    getLiveCivicPlusEvents(),
    getLiveCivicAlerts(),
    getLiveChamberEvents(),
    getLiveDiscoverRussellvilleEvents(),
    getLiveStateParksEvents(),
    getLiveNWSAlerts(),
    getLiveMainStreetEvents(),
    getLiveEvvntEvents(),
    getLiveFacebookEvents(),
    getLiveFacebookNotices(),
    getLiveLibraryEvents(),
    getLiveCenterArtsEvents(),
    getLivePopeCountyEvents(),
  ]);

  const statuses: SourceStatus[] = [];

  // The Courier
  const courierSource = sources.find((s) => s.id === "the-courier");
  if (courierSource && courierStories.length > 0) {
    statuses.push({
      id: "the-courier",
      name: courierSource.name,
      type: "live",
      itemCount: courierStories.length,
      lastFetched: new Date().toISOString(),
    });
  }

  // ATU — combine iCal events + RSS stories
  const atuSource = sources.find((s) => s.id === "arkansas-tech");
  const atuRssStories = rssStories.filter((s) => s.source === "arkansas-tech");
  const atuIcalEvents = icalEvents.filter((e) => e.source === "arkansas-tech");
  const atuLiveCount = atuIcalEvents.length + atuRssStories.length;
  if (atuSource && atuLiveCount > 0) {
    statuses.push({
      id: "arkansas-tech",
      name: atuSource.name,
      type: "live",
      itemCount: atuLiveCount,
      lastFetched: new Date().toISOString(),
    });
  }

  // Russellville School District
  const rsdSource = sources.find((s) => s.id === "russellville-sd");
  if (rsdSource && thrillshareEvents.length > 0) {
    statuses.push({
      id: "russellville-sd",
      name: rsdSource.name,
      type: "live",
      itemCount: thrillshareEvents.length,
      lastFetched: new Date().toISOString(),
    });
  }

  // City of Russellville (CivicPlus)
  const cityRvSource = sources.find((s) => s.id === "city-russellville");
  const cityRvLiveCount = civicPlusEvents.length + civicAlerts.length;
  if (cityRvSource && cityRvLiveCount > 0) {
    statuses.push({
      id: "city-russellville",
      name: cityRvSource.name,
      type: "live",
      itemCount: cityRvLiveCount,
      lastFetched: new Date().toISOString(),
    });
  }

  // Russellville Area Chamber of Commerce
  const chamberSource = sources.find((s) => s.id === "chamber");
  if (chamberSource && chamberEvents.length > 0) {
    statuses.push({
      id: "chamber",
      name: chamberSource.name,
      type: "live",
      itemCount: chamberEvents.length,
      lastFetched: new Date().toISOString(),
    });
  }

  // Discover Russellville
  const discoverRvSource = sources.find((s) => s.id === "discover-russellville");
  if (discoverRvSource && discoverRvEvents.length > 0) {
    statuses.push({
      id: "discover-russellville",
      name: discoverRvSource.name,
      type: "live",
      itemCount: discoverRvEvents.length,
      lastFetched: new Date().toISOString(),
    });
  }

  // Lake Dardanelle State Park
  const lakeDardanelleSource = sources.find((s) => s.id === "lake-dardanelle");
  if (lakeDardanelleSource && stateParksEventsStatus.length > 0) {
    statuses.push({
      id: "lake-dardanelle",
      name: lakeDardanelleSource.name,
      type: "live",
      itemCount: stateParksEventsStatus.length,
      lastFetched: new Date().toISOString(),
    });
  }

  // National Weather Service
  const nwsSource = sources.find((s) => s.id === "nws-weather");
  if (nwsSource && nwsAlertsStatus.length > 0) {
    statuses.push({
      id: "nws-weather",
      name: nwsSource.name,
      type: "live",
      itemCount: nwsAlertsStatus.length,
      lastFetched: new Date().toISOString(),
    });
  }

  // Main Street Russellville
  const mainStreetSource = sources.find((s) => s.id === "main-street");
  if (mainStreetSource && mainStreetEventsStatus.length > 0) {
    statuses.push({
      id: "main-street",
      name: mainStreetSource.name,
      type: "live",
      itemCount: mainStreetEventsStatus.length,
      lastFetched: new Date().toISOString(),
    });
  }

  // Courier Events (Evvnt)
  const courierEventsSource = sources.find((s) => s.id === "courier-events");
  if (courierEventsSource && evvntEventsStatus.length > 0) {
    statuses.push({
      id: "courier-events",
      name: courierEventsSource.name,
      type: "live",
      itemCount: evvntEventsStatus.length,
      lastFetched: new Date().toISOString(),
    });
  }

  // Facebook Community
  const facebookSource = sources.find((s) => s.id === "facebook-community");
  const facebookLiveCount = facebookEventsStatus.length + facebookNoticesStatus.length;
  if (facebookSource && facebookLiveCount > 0) {
    statuses.push({
      id: "facebook-community",
      name: facebookSource.name,
      type: "live",
      itemCount: facebookLiveCount,
      lastFetched: new Date().toISOString(),
    });
  }

  // Pope County Library System
  const librarySource = sources.find((s) => s.id === "pope-county-library");
  if (librarySource && libraryEventsStatus.length > 0) {
    statuses.push({
      id: "pope-county-library",
      name: librarySource.name,
      type: "live",
      itemCount: libraryEventsStatus.length,
      lastFetched: new Date().toISOString(),
    });
  }

  // Center for the Arts
  const centerArtsSource = sources.find((s) => s.id === "center-for-arts");
  if (centerArtsSource && centerArtsEventsStatus.length > 0) {
    statuses.push({
      id: "center-for-arts",
      name: centerArtsSource.name,
      type: "live",
      itemCount: centerArtsEventsStatus.length,
      lastFetched: new Date().toISOString(),
    });
  }

  // Pope County Government
  const popeCountySource = sources.find((s) => s.id === "pope-county");
  if (popeCountySource && popeCountyEventsStatus.length > 0) {
    statuses.push({
      id: "pope-county",
      name: popeCountySource.name,
      type: "live",
      itemCount: popeCountyEventsStatus.length,
      lastFetched: new Date().toISOString(),
    });
  }

  // Pottsville School District (via Thrillshare)
  const pottsvilleSource = sources.find((s) => s.id === "pottsville-sd");
  const pottsvilleEvents = thrillshareEvents.filter((e) => e.source === "pottsville-sd");
  if (pottsvilleSource && pottsvilleEvents.length > 0) {
    statuses.push({
      id: "pottsville-sd",
      name: pottsvilleSource.name,
      type: "live",
      itemCount: pottsvilleEvents.length,
      lastFetched: new Date().toISOString(),
    });
  }

  return statuses;
}

// ---- Minimal synchronous exports ----

/** Keep sync access empty to avoid showing seeded/demo content. */
export function getAllItems(): TownSquareItem[] {
  return [];
}

/** Get a source by id */
export function getSource(id: string): Source | undefined {
  return sources.find((s) => s.id === id);
}

export function getActiveNotices(): NoticeItem[] {
  return [];
}

export function getUpcomingEvents(): EventItem[] {
  return [];
}
