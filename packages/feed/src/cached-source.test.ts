import { afterEach, expect, it, vi } from "vitest";
import { cachedSource } from "./cached-source.js";

afterEach(() => vi.useRealTimers());

it("refreshes sources independently instead of letting an unrelated fetch renew them", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const fetchA = vi.fn().mockResolvedValue(["a"]);
  const fetchB = vi.fn().mockResolvedValue(["b"]);
  const a = cachedSource(fetchA, 1000);
  const b = cachedSource(fetchB, 1000);
  await a();
  vi.setSystemTime(900); await b();
  vi.setSystemTime(1001); await a();
  expect(fetchA).toHaveBeenCalledTimes(2);
  expect(fetchB).toHaveBeenCalledTimes(1);
  expect(a.lastFetched()).toBe("1970-01-01T00:00:01.001Z");
  expect(b.lastFetched()).toBe("1970-01-01T00:00:00.900Z");
});

it("coalesces concurrent readers and keeps the actual fetch timestamp on cache hits", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const fetcher = vi.fn().mockResolvedValue(["event"]);
  const read = cachedSource(fetcher, 1000);
  await Promise.all([read(), read(), read()]);
  vi.setSystemTime(500); await read();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(read.lastFetched()).toBe("1970-01-01T00:00:00.000Z");
});

it("preserves stale data and timestamp after timeout, ignores late completion, then retries", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  let resolveLate: (value: string[]) => void = () => {};
  const fetcher = vi.fn().mockResolvedValueOnce(["original"])
    .mockImplementationOnce(() => new Promise<string[]>((resolve) => { resolveLate = resolve; }))
    .mockResolvedValueOnce(["fresh"]);
  const read = cachedSource(fetcher, 1000, 50);
  await read();
  vi.setSystemTime(1001);
  const slow = read(); await vi.advanceTimersByTimeAsync(51);
  expect(await slow).toEqual(["original"]);
  resolveLate(["late"]); await Promise.resolve();
  expect(read.lastFetched()).toBe("1970-01-01T00:00:00.000Z");
  expect(await read()).toEqual(["fresh"]);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
