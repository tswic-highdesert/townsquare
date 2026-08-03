/**
 * A token bucket per method class, on the host side of the port.
 *
 * The case this exists for is not an attacker. It is the runaway `useEffect`
 * that calls `records.list` on every render, which a generated app produces
 * roughly once a week. Catching it here costs no network round trip and no
 * server capacity, and the app author sees `rate_limited` immediately instead
 * of finding out from a moderator.
 *
 * The server enforces its own, authoritative limits from the act token. This
 * one is a courtesy that happens to absorb the common failure.
 */

export type MethodClass = 'read' | 'write' | 'storage' | 'local'

export interface BucketSpec {
  /** Sustained rate, tokens per second. */
  perSecond: number
  /** Maximum tokens the bucket can hold, which is the burst allowance. */
  burst: number
}

export const DEFAULT_BUCKETS: Readonly<Record<MethodClass, BucketSpec>> = Object.freeze({
  // Generous: reading is what a well-behaved app does constantly.
  read: { perSecond: 20, burst: 40 },
  // Tight: a write is a durable change to a shared town record, attributed to a
  // real person. There is no legitimate app that needs more than this.
  write: { perSecond: 1, burst: 5 },
  storage: { perSecond: 5, burst: 20 },
  // `app.*` never leaves the host page, so it is metered only to keep a hot
  // loop from flooding the port.
  local: { perSecond: 30, burst: 60 },
})

/** Which bucket a method draws from. */
export function methodClass(method: string): MethodClass {
  if (method.startsWith('app.')) return 'local'
  if (method.startsWith('storage.')) return 'storage'
  if (method === 'records.create' || method === 'records.update') return 'write'
  return 'read'
}

interface Bucket {
  tokens: number
  updatedAt: number
}

export interface LimiterOptions {
  buckets?: Readonly<Record<MethodClass, BucketSpec>>
  /** Injectable so tests do not have to sleep. */
  now?: () => number
}

export class RateLimiter {
  private readonly specs: Readonly<Record<MethodClass, BucketSpec>>
  private readonly now: () => number
  private readonly buckets = new Map<MethodClass, Bucket>()

  constructor(opts: LimiterOptions = {}) {
    this.specs = opts.buckets ?? DEFAULT_BUCKETS
    this.now = opts.now ?? (() => Date.now())
  }

  /**
   * @returns `null` when the call may proceed, or milliseconds to wait.
   *
   * Returning the wait rather than a bare boolean is what lets the SDK put a
   * real `retryAfter` on the error. The SDK deliberately does not retry on its
   * own: a silent retry is how a runaway loop becomes a sustained one.
   */
  take(method: string, cost = 1): number | null {
    const cls = methodClass(method)
    const spec = this.specs[cls]
    const now = this.now()

    let bucket = this.buckets.get(cls)
    if (!bucket) {
      bucket = { tokens: spec.burst, updatedAt: now }
      this.buckets.set(cls, bucket)
    }

    const elapsed = Math.max(0, now - bucket.updatedAt) / 1000
    bucket.tokens = Math.min(spec.burst, bucket.tokens + elapsed * spec.perSecond)
    bucket.updatedAt = now

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost
      return null
    }

    const deficit = cost - bucket.tokens
    return Math.ceil((deficit / spec.perSecond) * 1000)
  }
}
