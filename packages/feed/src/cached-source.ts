import { withTimeout } from "./timeout.js";

/** Independent source clocks prevent a fast source from keeping another fresh.
 * Concurrent readers share a fetch. A timeout leaves the prior snapshot and its
 * original timestamp intact; a late response cannot refresh the cache.
 */
export function cachedSource<T>(fetcher: () => Promise<T[]>, ttl: number, timeout = 12_000) {
  let items: T[] | null = null;
  let fetchedAt: number | undefined;
  let checkedAt: number | undefined;
  let lastDataAt: number | undefined;
  let state: "uninitialized" | "available" | "empty" | "error" = "uninitialized";
  let pending: Promise<T[]> | undefined;
  const read = async (): Promise<T[]> => {
    if (items !== null && fetchedAt !== undefined && Date.now() - fetchedAt < ttl) return items;
    if (pending) return pending;
    checkedAt = Date.now();
    pending = withTimeout(Promise.resolve().then(fetcher), timeout)
      .then((result) => {
        items = result; fetchedAt = Date.now();
        state = result.length ? "available" : "empty";
        if (result.length) lastDataAt = fetchedAt;
        return result;
      })
      .catch(() => { state = "error"; return items ?? []; })
      .finally(() => { pending = undefined; });
    return pending;
  };
  read.lastFetched = () => fetchedAt === undefined ? undefined : new Date(fetchedAt).toISOString();
  read.health = () => ({
    state, itemCount: items?.length ?? 0,
    checkedAt: checkedAt === undefined ? null : new Date(checkedAt).toISOString(),
    lastFetched: read.lastFetched() ?? null,
    lastDataAt: lastDataAt === undefined ? null : new Date(lastDataAt).toISOString(),
    stale: state === "error" || (lastDataAt !== undefined && Date.now() - lastDataAt > ttl * 2),
  });
  return read;
}
