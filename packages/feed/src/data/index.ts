import { businesses } from "./businesses.js";
import { sources } from "./sources.js";
import { cachedSource } from "../cached-source.js";
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

const CACHE_TTL = 900_000; // 15 minutes
const FACEBOOK_CACHE_TTL = 3_600_000; // Bound paid discovery fetches to once an hour.

const getLiveCourierStories = cachedSource(fetchCourierStories, CACHE_TTL);
const getLiveRSSStories = cachedSource(fetchRSSStories, CACHE_TTL);
const getLiveICalEvents = cachedSource(fetchICalEvents, CACHE_TTL);
const getLiveThrillshareEvents = cachedSource(fetchThrillshareEvents, CACHE_TTL);
const getLiveCivicPlusEvents = cachedSource(fetchCivicPlusEvents, CACHE_TTL);
const getLiveCivicAlerts = cachedSource(fetchCivicAlerts, CACHE_TTL);
const getLiveChamberEvents = cachedSource(fetchChamberEvents, CACHE_TTL);
const getLiveDiscoverRussellvilleEvents = cachedSource(fetchDiscoverRussellvilleEvents, CACHE_TTL);
const getLiveStateParksEvents = cachedSource(fetchStateParksEvents, CACHE_TTL);
const getLiveNWSAlerts = cachedSource(fetchNWSAlerts, CACHE_TTL);
const getLiveMainStreetEvents = cachedSource(fetchMainStreetEvents, CACHE_TTL);
const getLiveEvvntEvents = cachedSource(fetchEvvntEvents, CACHE_TTL);
const getLiveFacebookEvents = cachedSource(fetchFacebookEvents, FACEBOOK_CACHE_TTL);
const getLiveFacebookNotices = cachedSource(fetchFacebookNotices, FACEBOOK_CACHE_TTL);
const getLiveLibraryEvents = cachedSource(fetchLibraryEvents, CACHE_TTL);
const getLiveCenterArtsEvents = cachedSource(fetchCenterArtsEvents, CACHE_TTL);
const getLivePopeCountyEvents = cachedSource(fetchPopeCountyEvents, CACHE_TTL);

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
      lastFetched: getLiveCourierStories.lastFetched(),
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
      lastFetched: getLiveRSSStories.lastFetched(),
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
      lastFetched: getLiveThrillshareEvents.lastFetched(),
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
      lastFetched: getLiveCivicPlusEvents.lastFetched(),
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
      lastFetched: getLiveChamberEvents.lastFetched(),
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
      lastFetched: getLiveDiscoverRussellvilleEvents.lastFetched(),
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
      lastFetched: getLiveStateParksEvents.lastFetched(),
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
      lastFetched: getLiveNWSAlerts.lastFetched(),
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
      lastFetched: getLiveMainStreetEvents.lastFetched(),
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
      lastFetched: getLiveEvvntEvents.lastFetched(),
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
      lastFetched: getLiveFacebookEvents.lastFetched(),
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
      lastFetched: getLiveLibraryEvents.lastFetched(),
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
      lastFetched: getLiveCenterArtsEvents.lastFetched(),
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
      lastFetched: getLivePopeCountyEvents.lastFetched(),
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
      lastFetched: getLiveThrillshareEvents.lastFetched(),
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
