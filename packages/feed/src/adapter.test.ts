import { describe, it, expect } from "vitest";
import type { FeedItem } from "@townsquare/content";
import { feedItemToTownSquareItem } from "./buildFeed.js";

const eventFeedItem: FeedItem = {
  id: "evvnt-1", title: "Concert", contentText: "A show", url: "https://x/#evvnt-1",
  datePublished: "2026-06-01T00:00:00Z", dateModified: "2026-06-01T00:00:00Z", tags: ["music"],
  townSquare: {
    type: "event", source: "courier-events", republishRule: "full", community: "Russellville",
    geo: { lat: 35.2, lng: -93.1, city: "Russellville", state: "AR" }, canonicalUrl: "https://x/e/1",
    startDate: "2026-06-10T18:00:00Z", endDate: null, location: "The Hall", isAllDay: false,
    recurrence: null, cost: null, contactEmail: "a@b.c", contactPhone: null,
  },
};

describe("feedItemToTownSquareItem", () => {
  it("flattens an event FeedItem into a TownSquareItem", () => {
    const ts = feedItemToTownSquareItem(eventFeedItem);
    expect(ts).toMatchObject({
      id: "evvnt-1", type: "event", title: "Concert", description: "A show",
      source: "courier-events", community: "Russellville", url: "https://x/e/1",
      startDate: "2026-06-10T18:00:00Z", location: "The Hall", contactEmail: "a@b.c",
    });
    expect(ts.createdAt).toBe("2026-06-01T00:00:00Z");
  });
});
