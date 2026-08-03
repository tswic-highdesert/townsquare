import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Static guard: no fetcher may build an id from wall-clock, randomness, or an
// array index. Ids must come from stableId(source, urlOrUpstreamId).
const LIB = join(__dirname);
const FORBIDDEN = [
  /id\s*[:=]\s*`[^`]*\$\{[^}]*Date\.now/i,
  /id\s*[:=]\s*`[^`]*\$\{[^}]*Math\.random/i,
  /id\s*[:=]\s*`[^`]*\$\{[^}]*\bidx\b/i,
  /id\s*[:=]\s*`[^`]*\$\{[^}]*\bindex\b/i,
];

describe("id construction guard", () => {
  const files = readdirSync(LIB).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  for (const f of files) {
    if (f === "facebook.ts") continue; // discovery-only: dropped before content_items (see assemble.test.ts)
    it(`${f} builds no id from wall-clock/random/index`, () => {
      const src = readFileSync(join(LIB, f), "utf8");
      for (const pat of FORBIDDEN) expect(pat.test(src), `${f} matches ${pat}`).toBe(false);
    });
  }
});
