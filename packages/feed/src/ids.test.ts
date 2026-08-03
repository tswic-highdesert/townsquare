import { describe, it, expect } from "vitest";
import { stableId } from "./ids.js";

describe("stableId", () => {
  it("is deterministic for the same source + key", () => {
    expect(stableId("evvnt", "abc123")).toBe(stableId("evvnt", "abc123"));
  });

  it("prefixes with the source and slugifies the key", () => {
    expect(stableId("center-arts", "/dept/the-nutcracker")).toBe("center-arts-dept-the-nutcracker");
  });

  it("hashes long keys to a stable short suffix instead of truncating", () => {
    const long = "https://example.com/" + "a".repeat(300);
    const id = stableId("library", long);
    expect(id.startsWith("library-")).toBe(true);
    expect(id.length).toBeLessThanOrEqual(80);
    expect(stableId("library", long)).toBe(id); // stable across calls
  });

  it("distinguishes different keys", () => {
    expect(stableId("rss", "url-a")).not.toBe(stableId("rss", "url-b"));
  });
});
