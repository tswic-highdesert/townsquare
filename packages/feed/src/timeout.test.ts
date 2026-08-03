import { describe, it, expect } from "vitest";
import { withTimeout } from "./timeout.js";

describe("withTimeout", () => {
  it("resolves when the promise beats the deadline", async () => {
    await expect(withTimeout(Promise.resolve(42), 50)).resolves.toBe(42);
  });

  it("rejects when the deadline passes first", async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve("late"), 50));
    await expect(withTimeout(slow, 10)).rejects.toThrow(/timed out/i);
  });
});
