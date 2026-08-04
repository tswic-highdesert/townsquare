/**
 * The host side of the port. Every call a creation makes lands here.
 *
 * The path is deliberately short and has no default branch. An unknown method
 * resolves to nothing rather than to something, params are validated against a
 * schema before a handler sees them, and permission is decided from the
 * *approved, frozen* manifest — never from the `townsquare.json` in the served
 * bundle, and never from anything the guest sent us.
 *
 * The guest's own copy of its grants is advisory. A creation that skips the SDK
 * and hand-writes port messages arrives right here and is checked identically,
 * which is the property the boundary suite exists to prove.
 */

import type { Manifest } from '@townsquare/manifest'
import { checkCall, type ActingUser } from '@townsquare/sdk'
import {
  isMethod,
  isRequestEnvelope,
  responseErr,
  responseOk,
  wireError,
  LIMITS,
  type Method,
  type Response as WireResponse,
  type WireError,
} from '@townsquare/shared'
import { RateLimiter, methodClass } from './limiter.js'

/**
 * What the host can actually do on a creation's behalf.
 *
 * `app.*` is handled by the frame itself and never reaches a data source. The
 * rest is supplied by the shell, which is the only party holding a credential.
 */
export interface TownDataSource {
  info(): Promise<unknown>
  thisWeek(): Promise<unknown>
  items(params: unknown): Promise<unknown>
  item(id: string): Promise<unknown>
  businesses(params: unknown): Promise<unknown>
}

/**
 * Who is looking at this creation.
 *
 * A function rather than a value because the answer is fetched with the act
 * token and projected server side, so the shell never holds an email or a user
 * id in a shape it could forward into a frame. The `user` on the context below
 * is the *permission* view — enough to decide whether a write is allowed — and
 * this is the only thing whose result is ever handed to the guest.
 */
export interface IdentitySource {
  current(): Promise<{ handle: string; verified: boolean } | null>
}

/**
 * Private scratch space for this creation and this resident.
 *
 * `undefined` is the value of an unset key, not an error, because reading a
 * preference nobody has set yet is the first thing every app that uses this
 * does.
 */
export interface StorageSource {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
}

/** Handled locally, in the host page, with no round trip. */
export interface FrameControls {
  ready(): void
  setHeight(px: number): void
  setTitle(text: string): void
}

export interface BridgeContext {
  /** The approved manifest from the version row. The permission boundary. */
  manifest: Manifest
  /** null when nobody is signed in, which is the common case. */
  user: ActingUser | null
  town: TownDataSource
  /** Absent until the shell has an act token. `user.current` then reports
   * itself unavailable rather than silently answering "nobody is signed in",
   * which is a different and much more misleading claim. */
  identity?: IdentitySource
  /** Absent until the shell can mint an act token. */
  storage?: StorageSource
  frame: FrameControls
  limiter?: RateLimiter
  /** Surfaced to the shell for the incident log. */
  onIncident?(kind: string, detail: Record<string, unknown>): void
}

/** Cost in tokens. Writes are expensive because they are durable and attributed. */
const COSTS: Readonly<Partial<Record<Method, number>>> = Object.freeze({
  'records.create': 10,
  'records.update': 10,
  'storage.set': 5,
})

export class Bridge {
  private readonly ctx: BridgeContext
  private readonly limiter: RateLimiter
  private inFlight = 0

  constructor(ctx: BridgeContext) {
    this.ctx = ctx
    this.limiter = ctx.limiter ?? new RateLimiter()
  }

  /**
   * Handle one inbound envelope.
   *
   * @returns the response to post back, or `null` when the message was not a
   *   well-formed request at all. Dropping a malformed envelope silently is
   *   correct: there is no id to correlate a reply to, so anything we sent
   *   would be unmatched noise the guest must then handle.
   */
  async handle(raw: unknown): Promise<WireResponse | null> {
    if (!isRequestEnvelope(raw)) return null
    const { id, method, params } = raw

    // Oversized params are rejected before any schema runs. Zod on a 10 MB
    // object is itself the denial of service.
    if (!withinSizeLimit(params)) {
      return responseErr(id, wireError('too_large', 'Request parameters are too large.'))
    }

    if (this.inFlight >= LIMITS.maxInFlight) {
      return responseErr(
        id,
        wireError('rate_limited', 'Too many Town Square calls in flight at once.', {
          retryAfter: 1,
        }),
      )
    }

    // Permission and params, in that order. Probing a capability you were never
    // granted must not tell you the shape of its arguments.
    const allowed = checkCall(method, params, { manifest: this.ctx.manifest, user: this.ctx.user })
    if (!allowed.ok) return responseErr(id, allowed.error)

    // `checkCall` only succeeds for a method that is in the table, so this is
    // belt to those braces. It is here so the compiler knows it too, rather
    // than being told to trust a cast.
    if (!isMethod(method)) {
      return responseErr(id, wireError('invalid_request', `Unknown method: ${method}`))
    }

    const wait = this.limiter.take(method, COSTS[method] ?? 1)
    if (wait !== null) {
      if (methodClass(method) === 'write') {
        this.ctx.onIncident?.('rate_limit_storm', { method })
      }
      return responseErr(
        id,
        wireError('rate_limited', 'Slow down.', { retryAfter: Math.ceil(wait / 1000) }),
      )
    }

    this.inFlight++
    try {
      const result = await this.run(method, params)
      return responseOk(id, result)
    } catch (err) {
      // Nothing from an upstream exception reaches the guest. A connection
      // string, a query, or a stack path in a message is a leak, and the guest
      // is untrusted code that can post whatever it sees to a declared host.
      return responseErr(id, toWireError(err))
    } finally {
      this.inFlight--
    }
  }

  private async run(method: Method, params: unknown): Promise<unknown> {
    const { town, frame } = this.ctx

    switch (method) {
      case 'app.ready':
        frame.ready()
        return null
      case 'app.setHeight':
        frame.setHeight(params as number)
        return null
      case 'app.setTitle':
        frame.setTitle(params as string)
        return null

      case 'town.info':
        return town.info()
      case 'town.thisWeek':
        return town.thisWeek()
      case 'town.items':
        return town.items(params)
      case 'town.item':
        return town.item(params as string)
      case 'town.businesses':
        return town.businesses(params)

      case 'user.current': {
        // Anonymous is a legitimate answer and by far the most common one, so
        // it is `null` rather than an error. A creation that assumes a signed-in
        // user is broken for most of the town, and this is where it finds out.
        const identity = this.ctx.identity
        if (!identity) throw new NotYetError(method)
        return identity.current()
      }

      case 'storage.get': {
        const storage = this.ctx.storage
        if (!storage) throw new NotYetError(method)
        return storage.get(params as string)
      }
      case 'storage.set': {
        const storage = this.ctx.storage
        if (!storage) throw new NotYetError(method)
        // The params schema is a tuple, so this shape is already guaranteed by
        // the time it gets here.
        const [key, value] = params as [string, unknown]
        await storage.set(key, value)
        return null
      }

      // Records arrive in Phase 8. Until then they must fail as
      // *unimplemented*, not as permission failures: a builder who declared
      // the permission correctly should not be told they did not.
      case 'records.list':
      case 'records.get':
      case 'records.create':
      case 'records.update':
      case 'records.history':
        throw new NotYetError(method)
    }
  }
}

/**
 * A capability that is declared, permitted, and simply not built yet.
 *
 * Distinct from `permission_denied` on purpose. Conflating them would teach a
 * builder to go re-edit a manifest that was already right.
 */
export class NotYetError extends Error {
  constructor(readonly method: string) {
    super(`${method} is not available yet in this town.`)
    this.name = 'NotYetError'
  }
}

/**
 * An error the guest is *meant* to see, as opposed to one it is protected from.
 *
 * Most upstream failures are flattened to `unavailable` on the way out,
 * because an exception message can carry a connection string or a stack path.
 * But some answers are the point of the call — "that value is too large",
 * "nobody is signed in" — and flattening those would leave a builder with a
 * retryable error for a condition retrying can never fix. A source raises this
 * when it has an answer worth passing on, and nothing else crosses.
 */
export class BridgeCallError extends Error {
  constructor(readonly wire: WireError) {
    super(wire.message)
    this.name = 'BridgeCallError'
  }
}

function toWireError(err: unknown): WireError {
  if (err instanceof BridgeCallError) {
    return err.wire
  }
  if (err instanceof NotYetError) {
    return wireError('unavailable', err.message)
  }
  return wireError('unavailable', 'Town Square could not complete that request.')
}

/**
 * Bound the serialized size of params.
 *
 * Measured by serializing, because a deeply nested object is small by property
 * count and enormous by cost. A structure that cannot be serialized at all
 * (a cycle, most often) is rejected here rather than thrown deeper in.
 */
function withinSizeLimit(params: unknown): boolean {
  if (params === undefined || params === null) return true
  try {
    return JSON.stringify(params).length <= LIMITS.maxParamsBytes
  } catch {
    return false
  }
}
