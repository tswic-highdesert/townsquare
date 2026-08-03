import type { FeedItem, FeedDocument } from "@townsquare/content";
import { parseFeed } from "@townsquare/content";
import type { TownSquareItem } from "./lib/types.js";
import { getAllItemsAsync } from "./data/index.js";
import { generateJSONFeed } from "./lib/feeds.js";

/** Flatten a normalized FeedItem (as stored in content_items.raw) back into the
 *  TownSquareItem shape the feed serializers consume. Inverse of @townsquare/content camelExt. */
export function feedItemToTownSquareItem(fi: FeedItem): TownSquareItem {
  const ts = fi.townSquare;
  const base = {
    id: fi.id,
    title: fi.title,
    description: fi.contentText,
    source: ts.source,
    tags: fi.tags,
    community: ts.community,
    geo: ts.geo ?? undefined,
    url: ts.canonicalUrl ?? undefined,
    createdAt: fi.datePublished,
    updatedAt: fi.dateModified,
  };
  switch (ts.type) {
    case "event":
      return { ...base, type: "event", startDate: ts.startDate, endDate: ts.endDate ?? undefined, location: ts.location, isAllDay: ts.isAllDay, recurrence: ts.recurrence ?? undefined, cost: ts.cost ?? undefined, contactEmail: ts.contactEmail ?? undefined, contactPhone: ts.contactPhone ?? undefined };
    case "notice":
      return { ...base, type: "notice", severity: ts.severity, expires: ts.expires ?? undefined, isActive: ts.isActive };
    case "business":
      return { ...base, type: "business", name: ts.name, category: ts.category, address: ts.address, phone: ts.phone ?? undefined, email: ts.email ?? undefined, website: ts.website ?? undefined, hours: ts.hours ?? undefined };
    case "story":
      // body isn't persisted (stories are summary-only over the feed); fall back to contentText.
      return { ...base, type: "story", body: fi.contentText, author: ts.author ?? undefined, publishedAt: ts.publishedAt, imageUrl: ts.imageUrl ?? undefined };
  }
}

/** Build the enriched feed in-process and validate it through the @townsquare/content
 *  contract. The url arg is vestigial (kept to satisfy ingestTown's fetchFeed
 *  signature); the feed is built from the source registry, not fetched. */
export async function buildFeed(_url?: string): Promise<FeedDocument> {
  const items = await getAllItemsAsync();
  return parseFeed(generateJSONFeed(items));
}
