import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { eq, and } from "drizzle-orm";
import { getDb, closeDb, type Db } from "./client.js";
import { contentItems, sourceHealth } from "./schema.js";
import { ingestTown } from "./ingest.js";
import type { FeedDocument } from "@townsquare/content";

import { execSync } from "node:child_process";

/**
 * Needs Docker, not a live database. Skipped rather than failed when Docker is
 * absent: a red suite on a laptop without Docker running trains people to
 * ignore red suites, and this file has nothing to say about the code when it
 * cannot start a container.
 */
function dockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "ignore", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}
const HAS_DOCKER = dockerAvailable();

let container: StartedPostgreSqlContainer;
let db: Db;
const TOWN = { id: "russellville-ar", tspFeedUrl: "http://feed.test/json" };

function feed(items: FeedDocument["items"]): FeedDocument {
  return { version: "1.1", items };
}
function ev(id: string): FeedDocument["items"][number] {
  return {
    id, title: id, contentText: "", url: "u", datePublished: "2026-06-01T00:00:00Z", dateModified: "2026-06-01T00:00:00Z", tags: [],
    townSquare: { type: "event", source: "chamber", republishRule: "full", community: "Russellville", geo: null, canonicalUrl: null, startDate: "2026-06-05T18:00:00Z", endDate: null, location: "x", isAllDay: false, recurrence: null, cost: null, contactEmail: null, contactPhone: null },
  };
}
/** Same as ev() but with an explicit source — for multi-source stale tests. */
function evS(id: string, source: string): FeedDocument["items"][number] {
  const base = ev(id);
  return { ...base, townSquare: { ...base.townSquare, source } };
}

beforeAll(async () => {
  if (!HAS_DOCKER) return;
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  db = getDb(container.getConnectionUri());
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
}, 120_000);

afterAll(async () => {
  if (db) await closeDb(db);
  await container?.stop();
});

describe.skipIf(!HAS_DOCKER)("ingestTown", () => {
  it("inserts items from the feed", async () => {
    await ingestTown(db, TOWN, async () => feed([ev("a"), ev("b")]), new Date("2026-06-02T00:00:00Z"));
    const rows = await db.select().from(contentItems).where(eq(contentItems.townId, TOWN.id));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "active")).toBe(true);
  });

  it("marks items absent on a later run as stale (not deleted) and refreshes lastSeenAt", async () => {
    await ingestTown(db, TOWN, async () => feed([ev("a")]), new Date("2026-06-03T00:00:00Z"));
    const a = (await db.select().from(contentItems).where(and(eq(contentItems.townId, TOWN.id), eq(contentItems.tspId, "a"))))[0];
    const b = (await db.select().from(contentItems).where(and(eq(contentItems.townId, TOWN.id), eq(contentItems.tspId, "b"))))[0];
    expect(a.status).toBe("active");
    expect(a.lastSeenAt).toEqual(new Date("2026-06-03T00:00:00Z"));
    expect(b.status).toBe("stale");
  });

  it("records source health counts", async () => {
    const health = await db.select().from(sourceHealth).where(eq(sourceHealth.townId, TOWN.id));
    const chamber = health.find((h) => h.source === "chamber");
    expect(chamber?.itemCount).toBe(1);
  });

  it("does NOT stale items from a source that returned nothing this run (partial-failure safe)", async () => {
    const T = { id: "iso-partial", tspFeedUrl: "http://x" };
    await ingestTown(db, T, async () => feed([evS("a", "chamber"), evS("x", "nws-weather")]), new Date("2026-06-10T00:00:00Z"));
    // nws-weather "fails" (returns nothing) on the next run; chamber still returns "a"
    await ingestTown(db, T, async () => feed([evS("a", "chamber")]), new Date("2026-06-10T00:15:00Z"));
    const x = (await db.select().from(contentItems).where(and(eq(contentItems.townId, T.id), eq(contentItems.tspId, "x"))))[0];
    expect(x.status).toBe("active"); // not blinked out by a transient source failure
    const nws = (await db.select().from(sourceHealth).where(and(eq(sourceHealth.townId, T.id), eq(sourceHealth.source, "nws-weather"))))[0];
    expect(nws.status).toBe("degraded");
  });

  it("still stales items removed within a source that DID return data", async () => {
    const T = { id: "iso-within", tspFeedUrl: "http://x" };
    await ingestTown(db, T, async () => feed([evS("a", "chamber"), evS("b", "chamber")]), new Date("2026-06-10T01:00:00Z"));
    await ingestTown(db, T, async () => feed([evS("a", "chamber")]), new Date("2026-06-10T01:15:00Z"));
    const b = (await db.select().from(contentItems).where(and(eq(contentItems.townId, T.id), eq(contentItems.tspId, "b"))))[0];
    expect(b.status).toBe("stale");
  });
});
