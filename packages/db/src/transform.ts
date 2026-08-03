import type { FeedItem } from "@townsquare/content";
import type { NewContentItem } from "./schema.js";

const d = (s: string | null | undefined): Date | undefined => (s ? new Date(s) : undefined);

/** Map a parsed feed item to a content_items insert row. Pure. */
export function toContentRow(townId: string, item: FeedItem, now: Date): NewContentItem {
  const ts = item.townSquare;
  const row: NewContentItem = {
    townId,
    tspId: item.id,
    type: ts.type,
    title: item.title,
    description: item.contentText,
    source: ts.source,
    republishRule: ts.republishRule,
    tags: item.tags,
    community: ts.community,
    geo: ts.geo as Record<string, unknown> | null,
    canonicalUrl: ts.canonicalUrl ?? null,
    raw: item,
    firstSeenAt: now,
    lastSeenAt: now,
    status: "active",
  };

  switch (ts.type) {
    case "event":
      row.startsAt = d(ts.startDate);
      row.endsAt = d(ts.endDate);
      row.location = ts.location;
      row.isAllDay = ts.isAllDay;
      row.recurrence = ts.recurrence;
      row.cost = ts.cost;
      break;
    case "notice":
      row.severity = ts.severity;
      row.expiresAt = d(ts.expires);
      row.isActive = ts.isActive;
      break;
    case "business":
      row.category = ts.category;
      row.address = ts.address;
      row.phone = ts.phone;
      row.website = ts.website;
      row.hours = ts.hours;
      break;
    case "story":
      row.author = ts.author;
      row.publishedAt = d(ts.publishedAt);
      row.imageUrl = ts.imageUrl;
      break;
  }
  return row;
}
