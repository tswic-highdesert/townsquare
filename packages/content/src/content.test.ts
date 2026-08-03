import { describe, it, expect } from "vitest";
import { parseItemsResponse, parseContentItem, isDiscoveryOnly, isFeedSummaryOnly, type ContentItem } from "./content.js";

const event = {
  townId: "russellville-ar", tspId: "civic-1", type: "event", title: "Council Meeting", description: "desc",
  source: "city-russellville", republishRule: "full", tags: ["government"], community: "Russellville",
  geo: { lat: 35.27, lng: -93.13, city: "Russellville", state: "AR" }, canonicalUrl: null, status: "active",
  startsAt: "2026-06-05T18:00:00.000Z", endsAt: null, location: "City Hall", isAllDay: false, cost: "Free",
  createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
  firstSeenAt: "2026-06-01T00:00:00.000Z", lastSeenAt: "2026-06-01T00:00:00.000Z", raw: {},
};

describe("content DTOs", () => {
  it("parses an items response and keeps ISO date strings", () => {
    const out = parseItemsResponse({ items: [event] });
    expect(out.items).toHaveLength(1);
    const it0: ContentItem = out.items[0];
    expect(it0.type).toBe("event");
    expect(it0.startsAt).toBe("2026-06-05T18:00:00.000Z");
    expect(it0.geo?.lat).toBe(35.27);
  });

  it("parses a single item", () => {
    expect(parseContentItem(event).tspId).toBe("civic-1");
  });

  it("tolerates unknown extra keys and null geo", () => {
    const out = parseContentItem({ ...event, geo: null, extra: 1 });
    expect(out.geo).toBeNull();
  });

  it("parses a notice with severity + expiresAt + isActive", () => {
    const notice = parseContentItem({ ...event, tspId: "n1", type: "notice", title: "Road closed",
      severity: "warning", expiresAt: "2026-06-10T00:00:00.000Z", isActive: true });
    expect(notice.type).toBe("notice");
    expect(notice.severity).toBe("warning");
    expect(notice.expiresAt).toBe("2026-06-10T00:00:00.000Z");
    expect(notice.isActive).toBe(true);
  });

  it("parses a business with category + contact fields", () => {
    const biz = parseContentItem({ ...event, tspId: "b1", type: "business", title: "Stoby's",
      category: "Diner", address: "405 W Main", phone: "479-555-0100", website: "https://stobys.test", hours: "11 AM - 8 PM" });
    expect(biz.category).toBe("Diner");
    expect(biz.phone).toBe("479-555-0100");
  });

  it("flags discovery-only (Facebook) items", () => {
    expect(isDiscoveryOnly({ ...event, republishRule: "discovery-only" } as unknown as ContentItem)).toBe(true);
    expect(isDiscoveryOnly(event as unknown as ContentItem)).toBe(false);
  });

  it("flags feed-summary-only (Courier) items", () => {
    expect(isFeedSummaryOnly({ republishRule: "feed-summary-only" })).toBe(true);
    expect(isFeedSummaryOnly({ republishRule: "full" })).toBe(false);
  });

  it("throws on a malformed single item (missing required title)", () => {
    const { title, ...bad } = event as Record<string, unknown>;
    expect(() => parseContentItem(bad)).toThrow();
  });

  it("parses a geo with only lat/lng (city/state are optional on the client DTO)", () => {
    const out = parseContentItem({ ...event, geo: { lat: 1, lng: 2 } });
    expect(out.geo).toEqual({ lat: 1, lng: 2 });
  });

  it("drops malformed rows from a LIST instead of failing the whole response", () => {
    const out = parseItemsResponse({ items: [event, { type: "event" }] });
    expect(out.items.map((i) => i.tspId)).toEqual(["civic-1"]);
  });
});
