import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithRetry } from "./http.js";

/** Build a minimal Response-like object good enough for fetchWithRetry. */
function res(status: number, headers: Record<string, string> = {}): Response {
  const h = new Headers(headers);
  return { ok: status >= 200 && status < 300, status, headers: h } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchWithRetry", () => {
  it("returns immediately on a 2xx (single request)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);

    const r = await fetchWithRetry("https://x/feed", { backoffMs: 1, maxBackoffMs: 2 });

    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends a browser User-Agent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithRetry("https://x/feed", { backoffMs: 1 });

    const init = fetchMock.mock.calls[0][1];
    expect(init.headers["User-Agent"]).toMatch(/Mozilla\/5\.0/);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(429))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal("fetch", fetchMock);

    const r = await fetchWithRetry("https://x/feed", { backoffMs: 1, maxBackoffMs: 2 });

    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on a network error then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal("fetch", fetchMock);

    const r = await fetchWithRetry("https://x/feed", { backoffMs: 1, maxBackoffMs: 2 });

    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caps a large Retry-After instead of waiting it out", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(429, { "retry-after": "3600" })) // 1 hour
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal("fetch", fetchMock);

    const start = Date.now();
    const r = await fetchWithRetry("https://x/feed", { backoffMs: 1, maxBackoffMs: 30 });
    const elapsed = Date.now() - start;

    expect(r.status).toBe(200);
    expect(elapsed).toBeLessThan(1000); // capped at ~30ms, nowhere near an hour
  });

  it("gives up after retries and returns the last retryable response (no throw)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(429));
    vi.stubGlobal("fetch", fetchMock);

    const r = await fetchWithRetry("https://x/feed", { retries: 1, backoffMs: 1, maxBackoffMs: 2 });

    expect(r.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it("throws when every attempt errors at the network layer", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("connect timeout"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithRetry("https://x/feed", { retries: 1, backoffMs: 1, maxBackoffMs: 2 })
    ).rejects.toThrow("connect timeout");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on a non-retryable 4xx (e.g. 404)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(404));
    vi.stubGlobal("fetch", fetchMock);

    const r = await fetchWithRetry("https://x/feed", { backoffMs: 1, maxBackoffMs: 2 });

    expect(r.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
