/**
 * `GET /api/directory` — the whole directory, in one request.
 *
 * Shaped like `nearbyRoutes.ts`, and deliberately identical to it in every
 * property that matters: no cookie, no query parameter, the same bytes for
 * every resident in town, cached for a minute with the in-flight promise
 * shared so a cold start is one scrape rather than one per resident.
 *
 * What it does not accept is the design. There is no `lat`, no `lng`, no
 * `near`, no `q` and no `category` — the whole directory goes over the wire
 * unsorted and the resident's browser filters and measures it. A server that
 * narrowed this list would have to be told what somebody was looking for, on a
 * request carrying their session cookie, and "what did my neighbour search the
 * town directory for" is not a thing Town Square should be able to answer. See
 * the note at the top of `directory.ts`.
 *
 * The price is the same one Nearby already pays and it is measured rather than
 * guessed: 741 listings, about 280 KB of JSON, roughly 60 KB over the wire
 * gzipped. It buys a browse screen, a category screen and a random draw that
 * all work off one fetch with the radio off.
 */

import { gzip } from 'node:zlib'
import { promisify } from 'node:util'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { assembleDirectory, type DirectoryPayload } from './directory.js'
import type { TownSquareItem } from './today.js'

const gzipAsync = promisify(gzip)

export interface DirectoryRoutesConfig {
  town: { id: string; name: string; timezone: string }
  /** Injected, so a test never reaches the network. Same reason as Today. */
  loadItems: () => Promise<readonly TownSquareItem[]>
  now?: () => Date
}

/**
 * A minute, matching Today and Nearby.
 *
 * Open/closed is computed at assembly time, so the TTL is the resolution of
 * every "closes in 40 minutes" on the screen. A longer cache would be cheaper
 * and would eventually tell somebody a place is open a few minutes after it
 * shut, which is the one direction this screen is not allowed to be wrong in.
 */
const TTL_MS = 60_000

/**
 * Compression is safe here for the same narrow reason it is on Nearby.
 *
 * BREACH needs a secret and an attacker-controlled string in one compressed
 * response. This route reads no cookie, takes no parameter, and returns the
 * same bytes to the whole town: there is no secret in it and nothing anyone can
 * inject into it.
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

export function createDirectoryRoutes(cfg: DirectoryRoutesConfig) {
  const clock = cfg.now ?? (() => new Date())

  let cached: { at: number; payload: DirectoryPayload } | null = null
  let inFlight: Promise<DirectoryPayload> | null = null

  async function build(): Promise<DirectoryPayload> {
    const items = await cfg.loadItems()
    return assembleDirectory({ now: clock().toISOString(), town: cfg.town, items })
  }

  async function payload(): Promise<DirectoryPayload> {
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
    // the same reason Today and Nearby do: a stale answer to "who fixes tyres"
    // is worth a great deal and a blank screen is worth nothing. The open/closed
    // states in a stale copy are stale too, which is why the screen prints the
    // time the copy was assembled rather than implying it is live.
    return inFlight.catch((err: unknown) => {
      if (cached) return cached.payload
      throw err
    })
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (url.pathname !== '/api/directory' || req.method !== 'GET') return false

    try {
      await sendJsonGzipped(req, res, await payload())
    } catch (err) {
      console.error('directory: could not assemble', err)
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'unavailable' }))
    }
    return true
  }

  /**
   * Warm the cache without anybody asking, the way Today does.
   *
   * The first request assembles the whole town, and the resident who happens to
   * make it should not be the one who waits for the scrape.
   */
  handle.warm = (): void => {
    void payload().catch((err: unknown) => console.error('directory: warm failed', err))
  }

  return handle
}
