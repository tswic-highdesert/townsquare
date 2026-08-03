/**
 * The host to guest wire protocol.
 *
 * The only module both sides import. Versioned independently of `sdk` and
 * `manifest_version` so the transport can evolve without touching either.
 *
 * Shape of the conversation: the guest posts exactly one `hello` on
 * `window.postMessage`; the host replies with `init` and transfers a
 * `MessagePort`; all further traffic is request/response on that port. The
 * one-shot handshake means a second frame, or a re-navigated frame, cannot
 * take over an established channel.
 */

import type { ErrorCode, WireError } from './errors.js'

export const PROTOCOL_VERSION = 1

/**
 * A flat closed enum, never `namespace` plus `fn` concatenated from a
 * guest-supplied string. Handlers live in a `Map`, so `{"method":"__proto__"}`
 * resolves to nothing instead of walking the prototype chain.
 */
export const METHODS = [
  'app.ready',
  'app.setHeight',
  'app.setTitle',

  'town.info',
  'town.thisWeek',
  'town.items',
  'town.item',
  'town.businesses',

  'user.current',

  'records.list',
  'records.get',
  'records.create',
  'records.update',
  'records.history',

  'storage.get',
  'storage.set',
] as const

export type Method = (typeof METHODS)[number]

const METHOD_SET: ReadonlySet<string> = new Set(METHODS)

export function isMethod(v: unknown): v is Method {
  return typeof v === 'string' && METHOD_SET.has(v)
}

/** guest to host, on `window.postMessage`, exactly once */
export interface Hello {
  ts: typeof PROTOCOL_VERSION
  kind: 'hello'
  /** SDK major the guest was built against. */
  sdk: number
  /** Telemetry only. Never trusted for a decision. */
  sdkBuild?: string
}

/** host to guest, on `window.postMessage`, transferring the port */
export interface Init {
  ts: typeof PROTOCOL_VERSION
  kind: 'init'
  town: { id: string; name: string; timezone: string }
  /** CSS custom properties, already resolved for the active theme. */
  theme: Record<string, string>
  display: { surface: 'full' | 'card'; height: 'auto' | number }
  /**
   * ADVISORY ONLY. Lets the SDK fail fast with a good message instead of a
   * round trip. Never the boundary: the host re-checks every call against the
   * frozen manifest, so a guest that lies to itself here gains nothing.
   */
  grants: {
    identity: 'none' | 'handle'
    read: string[]
    write: string[]
    storage: boolean
  }
}

/** guest to host, on the port */
export interface Request {
  ts: typeof PROTOCOL_VERSION
  kind: 'req'
  /** Guest-generated, unique within the frame. */
  id: string
  method: Method
  params: unknown
}

/** host to guest, on the port */
export type Response =
  | { ts: typeof PROTOCOL_VERSION; kind: 'res'; id: string; ok: true; result: unknown }
  | { ts: typeof PROTOCOL_VERSION; kind: 'res'; id: string; ok: false; error: WireError }

/** host to guest, unsolicited, on the port */
export interface Event {
  ts: typeof PROTOCOL_VERSION
  kind: 'evt'
  event: 'theme' | 'visibility' | 'teardown'
  data: unknown
}

export type Envelope = Hello | Init | Request | Response | Event

/** Guard the shape before touching any field. */
export function isHello(v: unknown): v is Hello {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  return d['ts'] === PROTOCOL_VERSION && d['kind'] === 'hello' && typeof d['sdk'] === 'number'
}

export function isRequest(v: unknown): v is Request {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  return (
    d['ts'] === PROTOCOL_VERSION &&
    d['kind'] === 'req' &&
    typeof d['id'] === 'string' &&
    d['id'].length > 0 &&
    d['id'].length <= 64 &&
    isMethod(d['method'])
  )
}

export function isResponse(v: unknown): v is Response {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  return (
    d['ts'] === PROTOCOL_VERSION &&
    d['kind'] === 'res' &&
    typeof d['id'] === 'string' &&
    typeof d['ok'] === 'boolean'
  )
}

/** Limits enforced on the host side of the port. */
export const LIMITS = Object.freeze({
  /** Serialized request params. */
  maxParamsBytes: 256 * 1024,
  /** Concurrent unsettled requests per frame. */
  maxInFlight: 32,
  /** Per request, host side. */
  timeoutMs: 15_000,
  /** Guest must complete the handshake within this window. */
  handshakeTimeoutMs: 10_000,
  /** Guest must call `app.ready()` within this window or we show a failed state. */
  readyTimeoutMs: 10_000,
  /** Reported heights are clamped to this range. */
  minHeight: 200,
  maxHeight: 4000,
  /** Skeleton height before the guest reports. */
  skeletonHeight: 320,
  /** `app.setTitle` */
  maxTitleChars: 80,
})

export function responseOk(id: string, result: unknown): Response {
  return { ts: PROTOCOL_VERSION, kind: 'res', id, ok: true, result }
}

export function responseErr(id: string, error: WireError): Response {
  return { ts: PROTOCOL_VERSION, kind: 'res', id, ok: false, error }
}

export type { ErrorCode, WireError }
