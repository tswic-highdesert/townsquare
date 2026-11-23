/**
 * The Tier 1 read API, as pure functions.
 *
 * `town.items`, `town.item` and `town.businesses` in a creation all land here,
 * by way of the shell's bridge and `townReadRoutes.ts`. This module decides
 * what a creation is allowed to see of an ingested item and how a long list is
 * paged, and nothing in it touches a socket, so both are testable without one.
 *
 * Two promises here are SDK promises, which means they outlive this file:
 *
 * - **A field that ships is a field forever.** SDK 1 never breaks, so every
 *   projection below is an allowlist. A new column in a scrape reaches no
 *   creation until somebody adds it here on purpose.
 * - **A cursor is opaque.** It encodes where the last page ended, not an
 *   offset, so a scrape landing between two pages neither repeats nor skips a
 *   row the builder already has.
 */

import { cleanByline } from './news.js'
import type {
  BusinessItem,
  EventItem,
  NoticeItem,
  StoryItem,
  TownSquareItem,
} from '../../../packages/feed/src/lib/types.js'

/** What `town.items` serves. Businesses have their own method. */
export const ITEM_TYPES = ['event', 'notice', 'story'] as const
export type ItemType = (typeof ITEM_TYPES)[number]

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 200

/**
 * A malformed read, answered as `invalid_request`.
 *
 * The bridge already validates params against the method table before a call
 * leaves the shell, so a creation normally never gets this far with a bad
 * one. This is the same rule held a second time for anything that calls the
 * API without going through the bridge.
 */
export class ReadRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReadRequestError'
  }
}

export interface PageQuery {
  since?: string
  limit?: number
  cursor?: string
}

export interface ItemQuery extends PageQuery {
  type?: ItemType
  q?: string
}

export interface BusinessQuery extends PageQuery {
  tag?: string
  q?: string
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

// ── projections ─────────────────────────────────────────────────────────────

interface ItemBase {
  id: string
  type: ItemType
  title: string
  description: string
  source: string
  tags: string[]
  url?: string
  geo?: TownSquareItem['geo']
  createdAt: string
  updatedAt: string
}

export type PublicEvent = ItemBase & {
  type: 'event'
  startDate: string
  endDate?: string
  location: string
  isAllDay?: boolean
  recurrence?: string
  cost?: string
}

export type PublicNotice = ItemBase & {
  type: 'notice'
  severity: NoticeItem['severity']
  expires?: string
  isActive: boolean
}

/**
 * A story is its headline, the source's own summary and a link out.
 *
 * No `body`: every story in the feed has `body === description` today, and
 * several sources are `feed-summary-only`, so a body field would either repeat
 * the summary or one day republish an article we were only allowed to link
 * to. No `imageUrl` either: the public feed rewrites it to a path on the
 * shell's own API, which a creation's CSP cannot load.
 */
export type PublicStory = ItemBase & {
  type: 'story'
  author: string | null
  publishedAt: string
}

export type PublicItem = PublicEvent | PublicNotice | PublicStory

/**
 * A directory listing as a creation sees it.
 *
 * The first seven fields are the shape `/api/businesses` has always returned
 * and that creations already read, so they keep their names and their
 * absent-when-missing behaviour. `hours` and `tags` are additions: the SDK
 * docs promise hours, and `tags` is what the `tag` filter matches against.
 */
export interface PublicBusiness {
  id: string
  name: string
  category: string
  address: string
  phone?: string
  website?: string
  geo?: BusinessItem['geo']
  hours?: string
  tags: string[]
}

function base(item: EventItem | NoticeItem | StoryItem): ItemBase {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    description: item.description,
    source: item.source,
    tags: [...(item.tags ?? [])],
    url: item.url,
    geo: item.geo,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export function projectItem(item: EventItem | NoticeItem | StoryItem): PublicItem {
  switch (item.type) {
    case 'event':
      return {
        ...base(item),
        type: 'event',
        startDate: item.startDate,
        endDate: item.endDate,
        location: item.location,
        isAllDay: item.isAllDay,
        recurrence: item.recurrence,
        cost: item.cost,
      }
    case 'notice':
      return {
        ...base(item),
        type: 'notice',
        severity: item.severity,
        expires: item.expires,
        isActive: item.isActive,
      }
    case 'story':
      return {
        ...base(item),
        type: 'story',
        // A reporter's work email arrives inside the byline; same rule as News.
        author: cleanByline(item.author),
        publishedAt: item.publishedAt,
      }
  }
}

export function projectBusiness(b: BusinessItem): PublicBusiness {
  return {
    id: b.id,
    name: b.name,
    category: b.category,
    address: b.address,
    phone: b.phone,
    website: b.website,
    geo: b.geo,
    hours: b.hours,
    tags: [...(b.tags ?? [])],
  }
}

// ── visibility ──────────────────────────────────────────────────────────────

/**
 * Whether an ingested item is still something the town would show.
 *
 * `town.item` promises null for a stale item, and the list must agree with
 * it, or a creation could page past a notice it is then told does not exist.
 * A notice is stale once it is inactive or past its expiry, which is the same
 * rule Today uses for its civic card. Past events are already dropped
 * upstream by the feed.
 */
function isLive(item: TownSquareItem, nowMs: number): item is EventItem | NoticeItem | StoryItem {
  if (item.type === 'business') return false
  if (item.type === 'notice') {
    return item.isActive && (!item.expires || Date.parse(item.expires) > nowMs)
  }
  return true
}

export function findItem(
  items: readonly TownSquareItem[],
  id: string,
  nowMs: number,
): PublicItem | null {
  const found = items.find((i) => i.id === id)
  return found && isLive(found, nowMs) ? projectItem(found) : null
}

// ── paging ──────────────────────────────────────────────────────────────────

/** Sort position plus id, so two rows never tie and a cursor is exact. */
type Key = readonly [number | string, string]

function compareKeys(a: Key, b: Key): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1
  return 0
}

function encodeCursor(key: Key): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url')
}

function decodeCursor(cursor: string, kind: 'number' | 'string'): Key {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === kind &&
      typeof parsed[1] === 'string'
    ) {
      return [parsed[0] as number | string, parsed[1]]
    }
  } catch {
    // Falls through to the same answer as a well-formed cursor of the wrong shape.
  }
  throw new ReadRequestError('That cursor is not one this list handed out. Pass `nextCursor` back unchanged.')
}

function sinceMs(since: string | undefined): number | null {
  if (since === undefined) return null
  const ms = Date.parse(since)
  if (!Number.isFinite(ms)) {
    throw new ReadRequestError('`since` must be an ISO 8601 date, like 2026-08-01 or 2026-08-01T00:00:00Z.')
  }
  return ms
}

function limitOf(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ReadRequestError(`\`limit\` must be a whole number from 1 to ${MAX_LIMIT}.`)
  }
  return limit
}

/**
 * One page of `rows`, in key order, starting after `cursor`.
 *
 * `since` keeps rows updated at or after it, so a creation that syncs nightly
 * asks only for what changed. A row whose `updatedAt` does not parse is kept
 * rather than dropped: it cannot be proven old.
 */
function paginate<T extends { updatedAt: string }, P>(
  rows: readonly T[],
  query: PageQuery,
  keyOf: (row: T) => Key,
  keyKind: 'number' | 'string',
  project: (row: T) => P,
): Page<P> {
  const limit = limitOf(query.limit)
  const since = sinceMs(query.since)
  const after = query.cursor === undefined ? null : decodeCursor(query.cursor, keyKind)

  const keyed = rows
    .filter((row) => {
      if (since === null) return true
      const updated = Date.parse(row.updatedAt)
      return !Number.isFinite(updated) || updated >= since
    })
    .map((row) => ({ row, key: keyOf(row) }))
    .filter(({ key }) => after === null || compareKeys(key, after) > 0)
    .sort((a, b) => compareKeys(a.key, b.key))

  const page = keyed.slice(0, limit)
  const last = page[page.length - 1]
  return {
    items: page.map(({ row }) => project(row)),
    nextCursor: keyed.length > limit && last ? encodeCursor(last.key) : null,
  }
}

function matches(haystack: Array<string | undefined>, q: string | undefined): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return haystack.some((s) => s?.toLowerCase().includes(needle))
}

/**
 * `town.items`: events, notices and stories, newest first.
 *
 * Newest by `createdAt`, which is the order the feed already assembles in and
 * the one a "what is new in town" creation wants without sorting.
 */
export function listItems(
  items: readonly TownSquareItem[],
  query: ItemQuery,
  nowMs: number,
): Page<PublicItem> {
  const rows = items
    .filter((i): i is EventItem | NoticeItem | StoryItem => isLive(i, nowMs))
    .filter((i) => !query.type || i.type === query.type)
    .filter((i) =>
      matches(
        [i.title, i.description, i.type === 'event' ? i.location : undefined, ...(i.tags ?? [])],
        query.q,
      ),
    )

  return paginate(
    rows,
    query,
    (i) => {
      const created = Date.parse(i.createdAt)
      return [Number.isFinite(created) ? -created : 0, i.id]
    },
    'number',
    projectItem,
  )
}

/**
 * `town.businesses`: the directory, by name.
 *
 * `tag` keeps the match `/api/businesses` has always made, a case-insensitive
 * substring of any tag or of the category, because creations already send
 * tags like "home health" and expect "Home health care service" back.
 */
export function listBusinesses(items: readonly TownSquareItem[], query: BusinessQuery): Page<PublicBusiness> {
  const tag = query.tag?.toLowerCase()
  const rows = items
    .filter((i): i is BusinessItem => i.type === 'business')
    .filter(
      (b) =>
        !tag ||
        (b.tags ?? []).some((t) => t.toLowerCase().includes(tag)) ||
        (b.category ?? '').toLowerCase().includes(tag),
    )
    .filter((b) => matches([b.name, b.category, b.address, b.description, ...(b.tags ?? [])], query.q))

  return paginate(rows, query, (b) => [(b.name ?? '').toLowerCase(), b.id], 'string', projectBusiness)
}
