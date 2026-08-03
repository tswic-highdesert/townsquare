import { describe, it, expect } from "vitest";
import { toContentRow } from "./transform.js";
import type { FeedItem } from "@townsquare/content";

const now = new Date("2026-06-02T12:00:00Z");

const eventItem: FeedItem = {
  id: "civic-1", title: "Council Meeting", contentText: "desc", url: "u",
  datePublished: "2026-06-01T00:00:00Z", dateModified: "2026-06-01T00:00:00Z", tags: ["government"],
  townSquare: { type: "event", source: "city-russellville", republishRule: "full", community: "Russellville", geo: null, canonicalUrl: null, startDate: "2026-06-05T18:00:00Z", endDate: null, location: "City Hall", isAllDay: false, recurrence: null, cost: "Free", contactEmail: null, contactPhone: null },
};

describe("toContentRow", () => {
  it("maps shared identity fields + sets seen/status", () => {
    const row = toContentRow("russellville-ar", eventItem, now);
    expect(row.townId).toBe("russellville-ar");
    expect(row.tspId).toBe("civic-1");
    expect(row.type).toBe("event");
    expect(row.title).toBe("Council Meeting");
    expect(row.source).toBe("city-russellville");
    expect(row.republishRule).toBe("full");
    expect(row.tags).toEqual(["government"]);
    expect(row.status).toBe("active");
    expect(row.firstSeenAt).toEqual(now);
    expect(row.lastSeenAt).toEqual(now);
    expect(row.raw).toBe(eventItem);
  });

  it("maps event-specific fields incl. startsAt as a Date", () => {
    const row = toContentRow("russellville-ar", eventItem, now);
    expect(row.startsAt).toEqual(new Date("2026-06-05T18:00:00Z"));
    expect(row.location).toBe("City Hall");
    expect(row.cost).toBe("Free");
    expect(row.severity).toBeUndefined();
  });

  it("maps notice severity + expiresAt", () => {
    const notice: FeedItem = { ...eventItem, id: "n1", townSquare: { type: "notice", source: "nws-weather", republishRule: "full", community: "Russellville", geo: null, canonicalUrl: null, severity: "warning", expires: "2026-06-10T00:00:00Z", isActive: true } };
    const row = toContentRow("russellville-ar", notice, now);
    expect(row.severity).toBe("warning");
    expect(row.expiresAt).toEqual(new Date("2026-06-10T00:00:00Z"));
    expect(row.isActive).toBe(true);
    expect(row.startsAt).toBeUndefined();
  });
});
