import { afterEach, expect, it, vi } from "vitest";
import { fetchDiscoverRussellvilleEvents } from "./discover-russellville";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("honors source winter timezone and exclusive all-day end dates", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:winter
DTSTART;TZID=America/Chicago:20261204T113000
SUMMARY:Winter program
END:VEVENT
BEGIN:VEVENT
UID:all-day
DTSTART;VALUE=DATE:20261205
DTEND;VALUE=DATE:20261206
SUMMARY:One-day event
END:VEVENT
END:VCALENDAR`)));
  const events = await fetchDiscoverRussellvilleEvents();
  expect(events[0].startDate).toBe("2026-12-04T17:30:00.000Z");
  expect(events[1]).toMatchObject({
    startDate: "2026-12-05T06:00:00.000Z", endDate: "2026-12-06T06:00:00.000Z", isAllDay: true,
  });
});

it("keeps a calendar series and its rescheduled exception as separate stable items", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  const calendar = (exceptionStart: string) => `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:0i2p7q5c00vmei1p96dakrcm4a@google.com
DTSTART;TZID=America/Chicago:20261006T113000
RRULE:FREQ=WEEKLY;UNTIL=20261103T055959Z;BYDAY=TU
SUMMARY:LDSP What's For Lunch?
END:VEVENT
BEGIN:VEVENT
UID:0i2p7q5c00vmei1p96dakrcm4a@google.com
RECURRENCE-ID;TZID=America/Chicago:20261027T113000
DTSTART;TZID=America/Chicago:${exceptionStart}
SUMMARY:LDSP Tuesday Programs
END:VEVENT
END:VCALENDAR`;
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(calendar("20261027T113000")))
    .mockResolvedValueOnce(new Response(calendar("20261028T120000")));
  vi.stubGlobal("fetch", fetchMock);

  const events = await fetchDiscoverRussellvilleEvents();
  expect(events).toHaveLength(2);
  expect(events[0].id).toBe("dr-0i2p7q5c00vmei1p96dakrcm4a-google-com");
  expect(new Set(events.map((event) => event.id)).size).toBe(2);
  expect(events.map((event) => event.title)).toContain("LDSP Tuesday Programs");
  const rescheduled = await fetchDiscoverRussellvilleEvents();
  expect(rescheduled[1].id).toBe(events[1].id);
  expect(rescheduled[1].startDate).not.toBe(events[1].startDate);
});
