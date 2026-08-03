import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "lib", "center-arts.ts"), "utf8");

describe("center-arts id stability", () => {
  it("does not build the id from slugify(title) + month/day", () => {
    expect(src).not.toMatch(/center-arts-\$\{slugify\(title\)\}/);
    expect(src).not.toMatch(/getMonth\(\)\s*\+\s*1\}-\$\{[^}]*getDate/);
  });

  it("derives the id from the event URL via stableId", () => {
    expect(src).toMatch(/stableId\(\s*["']center-arts["']\s*,\s*eventPath/);
  });
});
