import { withTimeout } from "./timeout.js";

/** Independent source clocks prevent a fast source from keeping another fresh.
 * Concurrent readers share a fetch. A timeout leaves the prior snapshot and its
 * original timestamp intact; a late response cannot refresh the cache.
 */
export function cachedSource<T>(fetcher: () => Promise<T[]>, ttl: number, timeout = 12_000) {
  let items: T[] | null = null;
  let fetchedAt: number | undefined;
  let pending: Promise<T[]> | undefined;
  const read = async (): Promise<T[]> => {
    if (items !== null && fetchedAt !== undefined && Date.now() - fetchedAt < ttl) return items;
    if (pending) return pending;
    pending = withTimeout(Promise.resolve().then(fetcher), timeout)
      .then((result) => { items = result; fetchedAt = Date.now(); return result; })
      .catch(() => items ?? [])
      .finally(() => { pending = undefined; });
    return pending;
  };
  read.lastFetched = () => fetchedAt === undefined ? undefined : new Date(fetchedAt).toISOString();
  return read;
}
