import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { FeedDocument, FeedItem } from "@townsquare/content";
import type { Db } from "./client.js";
import { contentItems, sourceHealth, type NewContentItem } from "./schema.js";
import { toContentRow } from "./transform.js";

export interface TownConfig { id: string; tspFeedUrl: string }

/** Upsert rows on (town_id, tsp_id): insert new, refresh existing (lastSeenAt + fields), reactivate. */
export async function upsertItems(db: Db, rows: NewContentItem[], now: Date): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(contentItems)
    .values(rows)
    .onConflictDoUpdate({
      target: [contentItems.townId, contentItems.tspId],
      set: {
        title: sql`excluded.title`, description: sql`excluded.description`, tags: sql`excluded.tags`,
        geo: sql`excluded.geo`, canonicalUrl: sql`excluded.canonical_url`,
        startsAt: sql`excluded.starts_at`, endsAt: sql`excluded.ends_at`, location: sql`excluded.location`,
        isAllDay: sql`excluded.is_all_day`, recurrence: sql`excluded.recurrence`, cost: sql`excluded.cost`,
        severity: sql`excluded.severity`, expiresAt: sql`excluded.expires_at`, isActive: sql`excluded.is_active`,
        category: sql`excluded.category`, address: sql`excluded.address`, phone: sql`excluded.phone`,
        website: sql`excluded.website`, hours: sql`excluded.hours`,
        author: sql`excluded.author`, publishedAt: sql`excluded.published_at`, imageUrl: sql`excluded.image_url`,
        raw: sql`excluded.raw`, lastSeenAt: now, status: "active", updatedAt: now,
      },
    });
}

/**
 * Mark items as stale (keep the row) — but only WITHIN sources that actually
 * returned data this run. A source that produced nothing this run (e.g. a
 * transient Courier 429 or Pope County timeout) is left untouched, so its items
 * don't blink out of the public feed until the next successful fetch.
 */
export async function markUnseenStale(
  db: Db,
  townId: string,
  seenTspIds: string[],
  seenSources: string[],
  now: Date
): Promise<void> {
  // Nothing fetched at all this run → don't stale anything (total upstream failure).
  if (seenSources.length === 0) return;
  const base = and(
    eq(contentItems.townId, townId),
    eq(contentItems.status, "active"),
    inArray(contentItems.source, seenSources)
  );
  await db
    .update(contentItems)
    .set({ status: "stale", updatedAt: now })
    .where(seenTspIds.length ? and(base, notInArray(contentItems.tspId, seenTspIds)) : base);
}

/** Recompute per-source item counts from the active items of this town. */
export async function recordSourceHealth(db: Db, townId: string, items: FeedItem[], now: Date): Promise<void> {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.townSquare.source, (counts.get(it.townSquare.source) ?? 0) + 1);
  const seenSources = [...counts.keys()];
  const rows = [...counts.entries()].map(([source, itemCount]) => ({ townId, source, itemCount, status: "ok", lastSeenAt: now }));
  if (rows.length) {
    await db
      .insert(sourceHealth)
      .values(rows)
      .onConflictDoUpdate({
        target: [sourceHealth.townId, sourceHealth.source],
        set: { itemCount: sql`excluded.item_count`, status: sql`excluded.status`, lastSeenAt: now },
      });
  }
  // Flag previously-healthy sources that reported nothing this run as 'degraded',
  // keeping their last itemCount + lastSeenAt so "down since" stays visible for alerting.
  await db
    .update(sourceHealth)
    .set({ status: "degraded" })
    .where(
      seenSources.length
        ? and(eq(sourceHealth.townId, townId), eq(sourceHealth.status, "ok"), notInArray(sourceHealth.source, seenSources))
        : and(eq(sourceHealth.townId, townId), eq(sourceHealth.status, "ok"))
    );
}

/** Full ingest for one town. fetchFeed is injected for testability.
 * fetchFeed must return a valid FeedDocument (callers are responsible for parsing raw JSON
 * via parseFeed from @townsquare/content before passing it in, or return fixture data directly in tests). */
export async function ingestTown(
  db: Db,
  town: TownConfig,
  fetchFeed: (url: string) => Promise<FeedDocument>,
  now: Date
): Promise<{ upserted: number }> {
  const doc = await fetchFeed(town.tspFeedUrl);
  const rows = doc.items.map((it) => toContentRow(town.id, it, now));
  const seenSources = [...new Set(doc.items.map((it) => it.townSquare.source))];
  await upsertItems(db, rows, now);
  await markUnseenStale(db, town.id, doc.items.map((it) => it.id), seenSources, now);
  await recordSourceHealth(db, town.id, doc.items, now);
  return { upserted: rows.length };
}
