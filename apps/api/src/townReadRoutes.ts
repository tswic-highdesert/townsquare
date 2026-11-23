/**
 * `GET /api/v1/towns/:townId/items`, `/items/:id` and `/businesses`.
 *
 * The Tier 1 read endpoints from `spec-tier-0-1.md`, and the only thing the
 * shell's bridge calls for `town.items`, `town.item` and `town.businesses`.
 * Anonymous by design: town data is fully open to read, so there is no cookie,
 * no act token and no key here, and the same request gets the same answer for
 * everyone in town.
 *
 * `/api/businesses` stays mounted beside this. It is the older shape of the
 * same list, and nothing is gained by breaking whoever still calls it.
 *
 * Errors use the SDK's own codes in the body, so the shell can hand
 * `invalid_request` and `not_found` to a creation unchanged instead of
 * flattening them into a retryable `unavailable`.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { TownSquareItem } from './today.js'
import {
  ITEM_TYPES,
  ReadRequestError,
  findItem,
  listBusinesses,
  listItems,
  type BusinessQuery,
  type ItemQuery,
  type ItemType,
} from './townRead.js'

export interface TownReadRoutesConfig {
  town: { id: string }
  /** Injected so a test never reaches the network. Same seam as Today. */
  loadItems: () => Promise<readonly TownSquareItem[]>
  now?: () => Date
}

const ROUTE = /^\/api\/v1\/towns\/([^/]+)\/(items|businesses)(?:\/([^/]+))?$/

/** Matches the method table's own bounds, so the two layers agree. */
const MAX_Q = 200
const MAX_TAG = 60
const MAX_CURSOR = 512

export function createTownReadRoutes(cfg: TownReadRoutesConfig) {
  const clock = cfg.now ?? (() => new Date())

  return async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') return false
    const match = ROUTE.exec(url.pathname)
    if (!match) return false
    const [, rawTown = '', collection, rawId] = match

    const send = (body: unknown, status = 200): void => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        // Private for the same reason as Events: a shared cache in front of a
        // per-town answer is a bug the day there is a second town.
        'Cache-Control': status === 200 ? 'private, max-age=30' : 'no-store',
      })
      res.end(JSON.stringify(body))
    }

    const townId = safeDecode(rawTown)
    if (townId !== cfg.town.id) {
      send({ error: 'not_found', message: 'No such town.' }, 404)
      return true
    }

    try {
      if (collection === 'items' && rawId !== undefined) {
        const id = safeDecode(rawId)
        if (!id || id.length > 200) throw new ReadRequestError('An item id is required.')
        const item = findItem(await cfg.loadItems(), id, clock().getTime())
        send(item ?? { error: 'not_found', message: 'No such item, or it is no longer current.' }, item ? 200 : 404)
        return true
      }

      if (collection === 'items') {
        send(listItems(await cfg.loadItems(), itemQuery(url.searchParams), clock().getTime()))
        return true
      }

      if (rawId !== undefined) {
        send({ error: 'not_found', message: 'Businesses are listed, not fetched one by one.' }, 404)
        return true
      }
      send(listBusinesses(await cfg.loadItems(), businessQuery(url.searchParams)))
      return true
    } catch (err) {
      if (err instanceof ReadRequestError) {
        send({ error: 'invalid_request', message: err.message }, 400)
        return true
      }
      throw err
    }
  }
}

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s)
  } catch {
    return null
  }
}

function text(params: URLSearchParams, name: string, max: number): string | undefined {
  const v = params.get(name)
  if (v === null || v === '') return undefined
  if (v.length > max) throw new ReadRequestError(`\`${name}\` is longer than ${max} characters.`)
  return v
}

function pageQuery(params: URLSearchParams) {
  const rawLimit = params.get('limit')
  return {
    since: text(params, 'since', 64),
    cursor: text(params, 'cursor', MAX_CURSOR),
    // `Number('')` is 0 and `Number('abc')` is NaN; both fail the integer
    // check in `townRead.ts` with a message that says what to send instead.
    limit: rawLimit === null || rawLimit === '' ? undefined : Number(rawLimit),
  }
}

function itemQuery(params: URLSearchParams): ItemQuery {
  const type = text(params, 'type', 20)
  if (type !== undefined && !(ITEM_TYPES as readonly string[]).includes(type)) {
    throw new ReadRequestError('`type` must be one of "event", "notice" or "story".')
  }
  return {
    ...pageQuery(params),
    type: type as ItemType | undefined,
    q: text(params, 'q', MAX_Q),
  }
}

function businessQuery(params: URLSearchParams): BusinessQuery {
  return {
    ...pageQuery(params),
    tag: text(params, 'tag', MAX_TAG),
    q: text(params, 'q', MAX_Q),
  }
}
