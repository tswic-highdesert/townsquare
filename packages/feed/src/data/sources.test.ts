import { describe, it, expect } from "vitest";
import { sources } from "./sources.js";

const DEAD = ["first-baptist", "st-andrews", "rv-sports-complex", "united-way", "downtown-main-street", "rv-arts-center", "rv-library"];

describe("source registry", () => {
  it("disables every dead placeholder source", () => {
    for (const id of DEAD) {
      const s = sources.find((x) => x.id === id);
      expect(s, `missing source ${id}`).toBeDefined();
      expect(s!.enabled, `${id} should be disabled`).toBe(false);
    }
  });

  it("leaves sources with a live fetcher enabled (enabled !== false)", () => {
    for (const id of ["the-courier", "russellville-sd", "nws-weather", "center-for-arts"]) {
      const s = sources.find((x) => x.id === id);
      expect(s!.enabled).not.toBe(false);
    }
  });
});
