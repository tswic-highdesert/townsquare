import { describe, it, expect } from "vitest";
import { assemblePublicItems, getSource } from "./index.js";
import { businesses } from "./businesses.js";
import type { EventItem } from "../lib/types";

const evt = (id: string, source: string, createdAt: string): EventItem => ({
  id, type: "event", title: id, description: "", source, tags: [], community: "Russellville",
  createdAt, updatedAt: createdAt, startDate: createdAt, location: "x",
});

describe("assemblePublicItems", () => {
  it("drops items from discovery-only sources (facebook-community)", () => {
    const items = assemblePublicItems([evt("a", "facebook-community", "2026-06-01T00:00:00Z"), evt("b", "the-courier", "2026-06-02T00:00:00Z")], [], [], []);
    expect(items.map((i) => i.id)).toEqual(["b"]);
  });

  it("drops items from disabled sources", () => {
    const items = assemblePublicItems([evt("a", "rv-library", "2026-06-01T00:00:00Z"), evt("b", "the-courier", "2026-06-02T00:00:00Z")], [], [], []);
    expect(items.map((i) => i.id)).toEqual(["b"]);
  });

  it("sorts newest-first and includes unknown sources (permissive)", () => {
    const items = assemblePublicItems([evt("old", "mystery", "2026-06-01T00:00:00Z"), evt("new", "mystery", "2026-06-03T00:00:00Z")], [], [], []);
    expect(items.map((i) => i.id)).toEqual(["new", "old"]);
  });

  it("getSource resolves a known id", () => {
    expect(getSource("the-courier")?.name).toContain("Courier");
  });

  it("keeps every directory business (rvts-directory is enabled + non-discovery)", () => {
    const out = assemblePublicItems([], [], [], businesses);
    const bizIds = out.filter((i) => i.type === "business").map((i) => i.id);
    expect(businesses.length).toBeGreaterThan(0);
    expect(bizIds).toHaveLength(businesses.length);
    // every real listing lives under rvts-directory — never a false "chamber" endorsement
    expect(businesses.every((b) => b.source === "rvts-directory")).toBe(true);
    // ids are unique (stable per-place keys, no collisions)
    expect(new Set(bizIds).size).toBe(bizIds.length);
  });
});
