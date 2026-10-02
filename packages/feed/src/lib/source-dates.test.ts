import { afterEach, expect, it, vi } from "vitest";
import { fetchPopeCountyEvents } from "./pope-county.js";
import { fetchEvvntEvents } from "./evvnt.js";
import { parseCivicPlusDateTime, parseCivicPlusEndTime } from "./civicplus.js";
import { parseFeaturedDateString } from "./library.js";
import { combineDateAndTime as parkDate } from "./state-parks.js";
import { combineDateAndTime as mainStreetDate } from "./mainstreet.js";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("reads Pope County winter meeting times in Chicago and does not invent missing times", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  const item = (id: number, title: string) => `<a class="cal_item" href="calendar-view?id=${id}"><div style="font-size:16px">DEC</div><div style="font-size:18px">4</div><strong class="cal_cat">Meeting</strong><div class="cal_title">${title}</div></a>`;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(item(1, "Quorum Court 5:30 PM") + item(2, "Time not announced"))));
  const events = await fetchPopeCountyEvents();
  expect(events).toHaveLength(1);
  expect(events[0].startDate).toBe("2026-12-04T23:30:00.000Z");
});

it("preserves explicit Evvnt offsets and interprets date-only entries locally", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  const base = { title: "Community program", venue: { town: "Russellville" } };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ rawEvents: [
    { ...base, objectID: 1, start_time: "2026-12-04T17:30:00-06:00" },
    { ...base, objectID: 2, start_date: "2026-12-05", end_time: "2026-12-05" },
  ] })));
  const events = await fetchEvvntEvents();
  expect(events[0].startDate).toBe("2026-12-04T23:30:00.000Z");
  expect(events[1]).toMatchObject({ startDate: "2026-12-05T06:00:00.000Z", endDate: "2026-12-06T05:59:59.000Z" });
});

it("parses CivicPlus winter ranges without inventing today's date on bad input", () => {
  const text = "December 4, 2026, 5:00 PM - 6:00 PM";
  const start = parseCivicPlusDateTime(text);
  expect(start).toBe("2026-12-04T23:00:00.000Z");
  expect(parseCivicPlusEndTime(text, start)).toBe("2026-12-05T00:00:00.000Z");
  expect(() => parseCivicPlusDateTime("Date to be announced")).toThrow();
});

it("parses library, park and Main Street source text without host timezone dependence", () => {
  expect(parkDate("Friday, December 4, 2026", "9 a.m.")).toBe("2026-12-04T15:00:00.000Z");
  expect(mainStreetDate("Dec 04, 2026", "6:00 PM CST")).toBe("2026-12-05T00:00:00.000Z");
  expect(parseFeaturedDateString("Friday, December 4, 2026 at 1:00pm - 3:00pm")?.startDate).toBe("2026-12-04T19:00:00.000Z");
});
