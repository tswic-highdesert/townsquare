/**
 * Private scratch space for one creation and one resident.
 *
 * Not a database, and the difference is the whole design. This is where an app
 * keeps *your* filter settings, *your* dismissed banner, *your* last map
 * position. Anything the town should see belongs in `records`, where it is
 * versioned, attributed and reusable by another creation — and a builder who
 * reaches for storage to hold shared data is building something nobody else
 * can ever read from.
 *
 * The scope is `(creationId, userId)` and both come from the act token. Not
 * from a parameter, not from a header, not from anything the guest can shape.
 * That is what makes cross-tenant access structurally impossible rather than
 * carefully avoided: there is no argument to pass that would address someone
 * else's row.
 */

import {
  checkKey,
  checkQuota,
  measureValue,
  type Usage,
  MAX_KEYS,
  MAX_TOTAL_BYTES,
} from './limits.js'
import type { StorageStore } from './store.js'

/** Named after the wire error codes, so the API maps them without a table. */
export type StorageFailure =
  | { ok: false; code: 'invalid_request'; message: string }
  | { ok: false; code: 'too_large'; message: string; usage?: Usage }

export type GetResult = { ok: true; value: unknown; found: boolean } | StorageFailure
export type SetResult = { ok: true; usage: Usage } | StorageFailure
export type RemoveResult = { ok: true; removed: boolean; usage: Usage } | StorageFailure

export interface Scope {
  creationId: string
  userId: string
}

export class CreationStorage {
  private readonly store: StorageStore
  private readonly clock: () => number

  constructor(opts: { store: StorageStore; now?: () => number }) {
    this.store = opts.store
    this.clock = opts.now ?? (() => Date.now())
  }

  /**
   * Read one key.
   *
   * An unset key is `undefined` and a success, not a `not_found`. Reading a
   * preference that has never been set is the normal first-run path for every
   * app that uses this, and making it an error would put a try/catch around
   * the most ordinary call in the API.
   */
  async get(scope: Scope, rawKey: unknown): Promise<GetResult> {
    const key = checkKey(rawKey)
    if (!key.ok) return { ok: false, code: 'invalid_request', message: key.message }

    const entry = await this.store.get(scope.creationId, scope.userId, key.key)
    return { ok: true, value: entry ? entry.value : undefined, found: entry !== null }
  }

  /**
   * Write one key, or remove it by writing `undefined`.
   *
   * Removal shares the verb deliberately. Without it a creation that fills its
   * quota has no way back — the SDK exposes `get` and `set` and nothing else,
   * so a separate delete method would be a contract change for the one case
   * that most needs to work. `set(key, undefined)` reads naturally as "there
   * is no value for this now", and `undefined` survives the structured clone
   * across the port, so it stays distinguishable from a stored `null`.
   */
  async set(scope: Scope, rawKey: unknown, value: unknown): Promise<SetResult> {
    const key = checkKey(rawKey)
    if (!key.ok) return { ok: false, code: 'invalid_request', message: key.message }

    if (value === undefined) {
      const removed = await this.remove(scope, key.key)
      return removed.ok ? { ok: true, usage: removed.usage } : removed
    }

    const measured = measureValue(value)
    if (!measured.ok) {
      return measured.problem === 'too_large'
        ? { ok: false, code: 'too_large', message: measured.message }
        : { ok: false, code: 'invalid_request', message: measured.message }
    }

    const [existing, current] = await Promise.all([
      this.store.get(scope.creationId, scope.userId, key.key),
      this.store.usage(scope.creationId, scope.userId),
    ])

    const verdict = checkQuota({
      existingBytes: current.bytes,
      existingKeys: current.keys,
      replacing: existing ? { bytes: existing.bytes } : null,
      incomingBytes: measured.bytes,
    })
    if (!verdict.ok) {
      return { ok: false, code: 'too_large', message: verdict.message, usage: verdict.usage }
    }

    await this.store.put(
      scope.creationId,
      scope.userId,
      { key: key.key, value: measured.value, bytes: measured.bytes },
      this.clock(),
    )
    return { ok: true, usage: verdict.usage }
  }

  async remove(scope: Scope, rawKey: unknown): Promise<RemoveResult> {
    const key = checkKey(rawKey)
    if (!key.ok) return { ok: false, code: 'invalid_request', message: key.message }

    const removed = await this.store.remove(scope.creationId, scope.userId, key.key)
    const after = await this.store.usage(scope.creationId, scope.userId)
    return {
      ok: true,
      removed,
      usage: { ...after, maxBytes: MAX_TOTAL_BYTES, maxKeys: MAX_KEYS },
    }
  }

  /** For an account screen showing what an app has kept. Never for the guest. */
  async usage(scope: Scope): Promise<Usage> {
    const current = await this.store.usage(scope.creationId, scope.userId)
    return { ...current, maxBytes: MAX_TOTAL_BYTES, maxKeys: MAX_KEYS }
  }
}
