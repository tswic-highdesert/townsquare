import { describe, it, expect } from "vitest";
import { parseFeed } from "./feed.js";

const sampleEvent = {
  id: "civic-council-2026-06-05",
  title: "City Council Meeting",
  content_text: "Regular session.",
  url: "https://russellville.gettownsquare.com/#civic-council-2026-06-05",
  date_published: "2026-06-01T00:00:00Z",
  date_modified: "2026-06-01T00:00:00Z",
  tags: ["government"],
  _town_square: {
    type: "event",
    source: "city-russellville",
    republish_rule: "full",
    community: "Russellville",
    geo: null,
    canonical_url: null,
    start_date: "2026-06-05T18:00:00Z",
    end_date: null,
    location: "City Hall",
    is_all_day: false,
    recurrence: null,
    cost: "Free",
    contact_email: null,
    contact_phone: null,
  },
};

const feedDoc = {
  version: "https://jsonfeed.org/version/1.1",
  title: "Russellville Town Square",
  items: [sampleEvent],
};

describe("parseFeed", () => {
  it("parses a valid feed document and returns typed items", () => {
    const doc = parseFeed(feedDoc);
    expect(doc.items).toHaveLength(1);
    const item = doc.items[0];
    expect(item.id).toBe("civic-council-2026-06-05");
    expect(item.townSquare.type).toBe("event");
    if (item.townSquare.type === "event") {
      expect(item.townSquare.startDate).toBe("2026-06-05T18:00:00Z");
      expect(item.townSquare.location).toBe("City Hall");
    }
    expect(item.townSquare.republishRule).toBe("full");
  });

  it("throws on a malformed item (missing required event field)", () => {
    const bad = { ...feedDoc, items: [{ ...sampleEvent, _town_square: { ...sampleEvent._town_square, start_date: undefined } }] };
    expect(() => parseFeed(bad)).toThrow();
  });

  it("parses a notice item", () => {
    const notice = {
      id: "nws-1", title: "Flood Warning", content_text: "", url: "u",
      date_published: "2026-06-01T00:00:00Z", date_modified: "2026-06-01T00:00:00Z", tags: [],
      _town_square: { type: "notice", source: "nws-weather", republish_rule: "full", community: "Russellville", geo: null, canonical_url: null, severity: "warning", expires: "2026-06-10T00:00:00Z", is_active: true },
    };
    const doc = parseFeed({ ...feedDoc, items: [notice] });
    expect(doc.items[0].townSquare.type).toBe("notice");
  });

  it("parses a business item with camelCased fields", () => {
    const biz = {
      id: "b1", title: "Joe's Diner", content_text: "", url: "u",
      date_published: "2026-06-01T00:00:00Z", date_modified: "2026-06-01T00:00:00Z", tags: [],
      _town_square: { type: "business", source: "chamber", republish_rule: "full", community: "Russellville", geo: null, canonical_url: null, name: "Joe's Diner", category: "Restaurant", address: "100 Main St", phone: null, email: null, website: null, hours: null },
    };
    const item = parseFeed({ ...feedDoc, items: [biz] }).items[0];
    expect(item.townSquare.type).toBe("business");
    if (item.townSquare.type === "business") {
      expect(item.townSquare.category).toBe("Restaurant");
      expect(item.townSquare.address).toBe("100 Main St");
    }
  });

  it("parses a story item (camelCased) and keeps republishRule", () => {
    const story = {
      id: "s1", title: "News", content_text: "summary", url: "u",
      date_published: "2026-06-01T00:00:00Z", date_modified: "2026-06-01T00:00:00Z", tags: [],
      _town_square: { type: "story", source: "the-courier", republish_rule: "feed-summary-only", community: "Russellville", geo: null, canonical_url: null, author: "Reporter", published_at: "2026-06-01T00:00:00Z", image_url: null },
    };
    const item = parseFeed({ ...feedDoc, items: [story] }).items[0];
    expect(item.townSquare.type).toBe("story");
    if (item.townSquare.type === "story") {
      expect(item.townSquare.publishedAt).toBe("2026-06-01T00:00:00Z");
      expect(item.townSquare.author).toBe("Reporter");
    }
    expect(item.townSquare.republishRule).toBe("feed-summary-only");
  });
});
