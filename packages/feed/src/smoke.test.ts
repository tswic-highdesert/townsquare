import { describe, it, expect } from "vitest";
import { PACKAGE } from "./index.js";

describe("@townsquare/feed", () => {
  it("loads", () => {
    expect(PACKAGE).toBe("@townsquare/feed");
  });
});
