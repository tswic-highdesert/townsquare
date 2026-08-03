// ============================================================
// Polite HTTP — a browser-like fetch with bounded retries.
// Used by source fetchers so a transient 429 / 5xx / slow connect doesn't
// silently zero out a source on a cron run.
// ============================================================

/** A desktop-browser User-Agent. Some news CDNs (notably BLOX/TownNews, which
 *  hosts couriernews.com) rate-limit or block non-browser agents with a 429;
 *  presenting as a normal reader plus polite pacing avoids that. */
export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchRetryOptions {
  /** Headers merged over the default User-Agent. */
  headers?: Record<string, string>;
  /** Per-attempt timeout (aborts the request). Default 8000ms. */
  timeoutMs?: number;
  /** Extra attempts after the first. Default 2 (so up to 3 requests). */
  retries?: number;
  /** Base backoff, doubled each retry. Default 500ms. */
  backoffMs?: number;
  /** Hard cap on any single backoff wait — also caps a server's Retry-After.
   *  We deliberately never wait long: this runs on a ~15-min cron, so it's
   *  better to skip a stubborn source and pick it up next run than to burn the
   *  fetch budget honoring a multi-minute Retry-After. Default 2000ms. */
  maxBackoffMs?: number;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** Parse a Retry-After header (delta-seconds or HTTP-date) into a capped ms wait. */
function parseRetryAfter(header: string | null, capMs: number): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.min(Math.max(0, secs) * 1000, capMs);
  const when = Date.parse(header);
  if (!Number.isNaN(when)) return Math.min(Math.max(0, when - Date.now()), capMs);
  return null;
}

/**
 * fetch() with a per-attempt timeout, a browser User-Agent, and bounded retries
 * on transient failures (429/5xx + network/timeout errors). Backoff is capped
 * small on purpose (see maxBackoffMs).
 *
 * Returns the final Response — whether ok or not — so callers keep their existing
 * `if (!res.ok)` handling. Throws only when every attempt failed at the network
 * layer (e.g. connect timeout on all tries); callers already catch and degrade.
 */
export async function fetchWithRetry(url: string, opts: FetchRetryOptions = {}): Promise<Response> {
  const {
    headers = {},
    timeoutMs = 8000,
    retries = 2,
    backoffMs = 500,
    maxBackoffMs = 2000,
  } = opts;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": BROWSER_UA, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Success, a non-retryable status, or out of attempts → hand it back.
      if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === retries) {
        return res;
      }
      const wait =
        parseRetryAfter(res.headers.get("retry-after"), maxBackoffMs) ??
        Math.min(maxBackoffMs, backoffMs * 2 ** attempt);
      await sleep(wait + Math.floor(Math.random() * 150));
    } catch (err) {
      // Network error / timeout (AbortSignal) — retry until attempts run out.
      lastErr = err;
      if (attempt === retries) throw err;
      await sleep(Math.min(maxBackoffMs, backoffMs * 2 ** attempt) + Math.floor(Math.random() * 150));
    }
  }
  // Unreachable (the loop always returns or throws), but satisfies the type.
  throw lastErr;
}
