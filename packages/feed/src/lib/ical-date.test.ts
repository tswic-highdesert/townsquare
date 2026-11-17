import { expect, it } from "vitest";
import { parseICalDate } from "./ical-date.js";

it("uses Chicago daylight and standard offsets on both sides of the transition", () => {
  expect(parseICalDate("20260704T113000")).toBe("2026-07-04T16:30:00.000Z");
  expect(parseICalDate("20261204T113000")).toBe("2026-12-04T17:30:00.000Z");
  expect(parseICalDate("20261101T003000")).toBe("2026-11-01T05:30:00.000Z");
  expect(parseICalDate("20261101T023000")).toBe("2026-11-01T08:30:00.000Z");
});

it("honors UTC and explicit source zones independently of server timezone", () => {
  expect(parseICalDate("20261204T113000Z")).toBe("2026-12-04T11:30:00.000Z");
  expect(parseICalDate("20261204T113000", "America/New_York")).toBe("2026-12-04T16:30:00.000Z");
});

it("keeps all-day end dates exclusive across daylight saving changes", () => {
  const start = parseICalDate("20261101");
  const end = parseICalDate("20261102");
  expect(start).toBe("2026-11-01T05:00:00.000Z");
  expect(end).toBe("2026-11-02T06:00:00.000Z");
  expect(Date.parse(end) - Date.parse(start)).toBe(25 * 60 * 60 * 1000);
});

it("rejects invalid dates and nonexistent spring-forward times", () => {
  expect(() => parseICalDate("20260230")).toThrow("Invalid iCal date");
  expect(() => parseICalDate("20260308T023000")).toThrow("Nonexistent iCal wall time");
});
