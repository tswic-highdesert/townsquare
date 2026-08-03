import { describe, it, expect, vi } from "vitest";

// Mock the network-bound assembly so the test is pure: buildFeed must take live
// TownSquareItems → generateJSONFeed → parseFeed and return a valid FeedDocument.
// One item of EACH discriminated type exercises the full contract (the real guard
// against the producer emitting something the consumer rejects).
vi.mock("./data", () => ({
  getAllItemsAsync: async () => [
    {
      id: "thrillshare-russellville-sd-42", type: "event", title: "Band Concert", description: "HS band",
      source: "russellville-sd", tags: ["school"], community: "Russellville",
      geo: { lat: 35.27, lng: -93.13, city: "Russellville", state: "AR" }, url: "https://rsdk12.net/e/42",
      createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z",
      startDate: "2026-06-12T19:00:00Z", location: "RHS Auditorium",
    },
    {
      id: "nws-abc", type: "notice", title: "Heat Advisory", description: "Stay hydrated",
      source: "nws-weather", tags: [], community: "Russellville",
      createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z",
      severity: "warning", isActive: true,
    },
    {
      id: "biz-001", type: "business", title: "Stoby's", description: "Restaurant",
      source: "chamber", tags: ["rvts-curated"], community: "Russellville",
      createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z",
      name: "Stoby's", category: "Restaurant", address: "405 W Parkway Dr",
    },
    {
      id: "courier-xyz", type: "story", title: "Local headline", description: "summary",
      source: "the-courier", tags: [], community: "Russellville",
      createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z",
      body: "full text", publishedAt: "2026-06-01T00:00:00Z",
    },
  ],
  // Permissive registry stub: any source resolves to a valid 'full' rule.
  getSource: (id: string) => ({ id, name: id, republishRule: "full" }),
}));

import { buildFeed } from "./buildFeed.js";

describe("buildFeed", () => {
  it("produces a FeedDocument that passes parseFeed for all four item types", async () => {
    const doc = await buildFeed();
    expect(doc.items).toHaveLength(4);
    const byType = Object.fromEntries(doc.items.map((i) => [i.townSquare.type, i]));
    expect(Object.keys(byType).sort()).toEqual(["business", "event", "notice", "story"]);
    expect(byType.event.id).toBe("thrillshare-russellville-sd-42");
    expect(byType.event.townSquare.source).toBe("russellville-sd");
  });
});
