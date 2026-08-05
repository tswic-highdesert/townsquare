/**
 * `GET /api/nearby` — the whole placeable town, in one request.
 *
 * Shaped like `todayRoutes.ts` and for the same reasons: no cookie, identical
 * for every resident, cached for a minute with the in-flight promise shared so
 * a cold start is one scrape rather than one per resident.
 *
 * The difference is what it deliberately does *not* accept. There is no `lat`,
 * no `lng` and no `near` parameter, and adding one would be the whole design
 * change: the resident's browser ranks this list against a position that never
 * leaves the device. See the note at the top of `nearby.ts`.
 */

import { gzip } from 'node:zlib'
import { promisify } from 'node:util'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { assembleNearby, type NearbyPayload } from './nearby.js'
import type { TownSquareItem } from './today.js'

const gzipAsync = promisify(gzip)

export interface NearbyRoutesConfig {
  town: { id: string; name: string; timezone: string }
  /** Injected, so a test never reaches the network. Same reason as Today. */
  loadItems: () => Promise<readonly TownSquareItem[]>
  now?: () => Date
}

/** A minute, matching Today. Open/closed is computed at assembly time. */
const TTL_MS = 60_000

/**
 * Compression is safe here specifically because this response holds nothing
 * secret and nothing per-resident.
 *
 * The reason to think about it at all is BREACH: gzipping a response that mixes
 * an attacker-chosen string with a secret leaks the secret through the
 * compressed length. This route reads no cookie, takes no query parameter, and
 * returns the same bytes to everyone in town — there is no secret in it and
 * nothing an attacker can inject. Without compression the payload is ~160 KB;
 * with it, about a quarter of that.
 */
async function sendJsonGzipped(
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
): Promise<void> {
  const json = JSON.stringify(body)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    // Private, not public: a shared cache in front of a per-town screen is a
    // per-town bug the day Town Square is more than one town.
    'Cache-Control': 'private, max-age=60',
  }

  if (!/\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
    res.writeHead(200, { ...headers, 'Content-Length': Buffer.byteLength(json) })
    res.end(json)
    return
  }

  const packed = await gzipAsync(json)
  res.writeHead(200, {
    ...headers,
    'Content-Encoding': 'gzip',
    'Content-Length': packed.length,
    Vary: 'Accept-Encoding',
  })
  res.end(packed)
}

export function createNearbyRoutes(cfg: NearbyRoutesConfig) {
  const clock = cfg.now ?? (() => new Date())

  let cached: { at: number; payload: NearbyPayload } | null = null
  let inFlight: Promise<NearbyPayload> | null = null

  async function build(): Promise<NearbyPayload> {
    const items = await cfg.loadItems()
    return assembleNearby({ now: clock().toISOString(), town: cfg.town, items })
  }

  async function payload(): Promise<NearbyPayload> {
    const now = clock().getTime()
    if (cached && now - cached.at < TTL_MS) return cached.payload
    if (inFlight) return inFlight

    inFlight = build()
      .then((p) => {
        cached = { at: clock().getTime(), payload: p }
        return p
      })
      .finally(() => {
        inFlight = null
      })

    // A failed scrape serves the last good directory rather than an error, for
    // the same reason Today does: a stale answer to "is the hardware store
    // open" is worth a great deal and a blank screen is worth nothing.
    return inFlight.catch((err: unknown) => {
      if (cached) return cached.payload
      throw err
    })
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (url.pathname !== '/api/nearby' || req.method !== 'GET') return false

    try {
      await sendJsonGzipped(req, res, await payload())
    } catch (err) {
      console.error('nearby: could not assemble', err)
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'unavailable' }))
    }
    return true
  }

  return handle
}
