/**
 * Turning whatever arrived into a typed record, or refusing it.
 *
 * One function per type, all pure, and **the same function runs at submit and
 * again at publish.** Not an equivalent one. The MCP service learned this the
 * expensive way — `validate` and `submit` there run the identical check,
 * because the moment the authoring-time pass is advisory and the real one is
 * stricter, builders learn the advice is optional and a human reviews the
 * difference. A contribution held for two days while a moderator gets to it is
 * exactly the window in which "clean when submitted" stops meaning anything.
 *
 * Two conventions worth knowing:
 *
 * **Over-length is refused, never truncated.** Cutting a person's sentence off
 * mid-word and publishing the stump is the rudest thing a form can do, and the
 * composer already shows the counter, so anything arriving over the limit is
 * either a client bug or somebody bypassing the client.
 *
 * **Nothing here reads an author.** There is no `author`, `handle`, `orgId` or
 * `postedBy` key in any input shape below, so there is nothing for a caller to
 * forge. Attribution is assembled from the session in `service.ts`.
 */

import { createHash } from 'node:crypto'
import { ContributionError } from './errors.js'
import {
  CORRECTION_FIELDS,
  EVENT_CATEGORIES,
  COMPOSABLE_SEVERITIES,
  type CollectionContent,
  type CollectionItem,
  type ContributionContent,
  type ContributionType,
  type CorrectionContent,
  type CorrectionField,
  type EventCategory,
  type EventContent,
  type EventCost,
  type NoticeContent,
  type NoticeSeverity,
  type PhotoContent,
  type PlaceRef,
} from './model.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** Matches the counters in the composer, which is where a resident learns them. */
export const LIMITS = {
  eventTitle: 140,
  eventDescription: 600,
  correctionReason: 300,
  correctionValue: 200,
  noticeTitle: 140,
  noticeBody: 400,
  collectionName: 80,
  collectionDescription: 200,
  collectionItems: 100,
  photoCaption: 90,
  placeName: 160,
  tags: 8,
  tagLength: 32,
  url: 500,
} as const

/**
 * How far ahead a scheduled notice may sit, and how far back an event may start.
 *
 * The backward window exists because an event that already happened is not
 * information, it is clutter in the one feed residents act on by driving
 * somewhere. A day of slack, so somebody adding this morning's market at noon
 * is not fighting the form.
 */
const EVENT_BACKDATE_MS = DAY_MS
const EVENT_HORIZON_MS = 730 * DAY_MS
const SCHEDULE_HORIZON_MS = 90 * DAY_MS

export function validateContent(
  type: ContributionType,
  raw: unknown,
  now: number,
): ContributionContent {
  const body = object(raw, 'content')
  switch (type) {
    case 'event':
      return event(body, now)
    case 'correction':
      return correction(body)
    case 'notice':
      return notice(body, now)
    case 'collection':
      return collection(body)
    case 'photo':
      return photo(body)
  }
}

function event(body: Record<string, unknown>, now: number): EventContent {
  const startsAt = instant(body['startsAt'], 'startsAt')
  if (startsAt < now - EVENT_BACKDATE_MS) {
    throw new ContributionError(
      'invalid',
      'that start time has already passed; an event nobody can still get to is not information',
    )
  }
  if (startsAt > now + EVENT_HORIZON_MS) {
    throw new ContributionError('invalid', 'that start time is more than two years away')
  }

  const endsAt = body['endsAt'] === undefined || body['endsAt'] === null
    ? null
    : instant(body['endsAt'], 'endsAt')
  if (endsAt !== null && endsAt <= startsAt) {
    throw new ContributionError('invalid', 'it cannot finish before it starts')
  }

  return {
    kind: 'event',
    title: required(body['title'], LIMITS.eventTitle, 'title'),
    startsAt,
    endsAt,
    place: place(body['place']),
    category: oneOf(body['category'], EVENT_CATEGORIES, 'category') as EventCategory,
    description: optional(body['description'], LIMITS.eventDescription, 'description') ?? '',
    link: link(body['link']),
    cost: oneOf(body['cost'] ?? 'free', ['free', 'paid', 'donation'] as const, 'cost') as EventCost,
    tags: tags(body['tags']),
  }
}

function correction(body: Record<string, unknown>): CorrectionContent {
  const field = oneOf(body['field'], CORRECTION_FIELDS, 'field') as CorrectionField
  return {
    kind: 'correction',
    // Only directory listings have a source to correct against. A correction
    // to something with no prior value is not a correction, it is a claim, and
    // a claim goes in as the thing it actually is.
    targetType: 'business',
    targetRef: required(body['targetRef'], 120, 'targetRef'),
    targetLabel: required(body['targetLabel'], LIMITS.placeName, 'targetLabel'),
    field,
    beforeValue: optional(body['beforeValue'], LIMITS.correctionValue, 'beforeValue') ?? '',
    newValue: required(body['newValue'], LIMITS.correctionValue, 'newValue'),
    // Required, and it is the only field in this whole package whose absence is
    // refused for a reason that is not structural: it is what a reviewer reads.
    reason: required(body['reason'], LIMITS.correctionReason, 'reason'),
  }
}

function notice(body: Record<string, unknown>, now: number): NoticeContent {
  // Composable rungs only. `emergency` is refused here rather than in the gate
  // matrix, because it is not a question of who is allowed to send one: nobody
  // types an emergency into a form. See `COMPOSABLE_SEVERITIES`.
  const severity = oneOf(body['severity'], COMPOSABLE_SEVERITIES, 'severity') as NoticeSeverity
  const raw = body['publishAt']
  let publishAt: number | null = null
  if (raw !== undefined && raw !== null) {
    publishAt = instant(raw, 'publishAt')
    if (publishAt > now + SCHEDULE_HORIZON_MS) {
      throw new ContributionError('invalid', 'that send time is more than ninety days away')
    }
    // A send time in the past is "now", not an error. Nothing is gained by
    // making somebody re-pick a time that has quietly slipped past while they
    // were typing.
    if (publishAt <= now) publishAt = null
  }

  return {
    kind: 'notice',
    title: required(body['title'], LIMITS.noticeTitle, 'title'),
    body: required(body['body'], LIMITS.noticeBody, 'body'),
    severity,
    publishAt,
  }
}

function collection(body: Record<string, unknown>): CollectionContent {
  const raw = body['items']
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ContributionError('invalid', 'a collection needs at least one thing in it')
  }
  if (raw.length > LIMITS.collectionItems) {
    throw new ContributionError(
      'invalid',
      `a collection holds up to ${LIMITS.collectionItems} things`,
    )
  }

  const items: CollectionItem[] = raw.map((entry, at) => {
    const row = object(entry, `items[${at}]`)
    return {
      kind: oneOf(row['kind'], ['business', 'story', 'event'] as const, `items[${at}].kind`) as
        CollectionItem['kind'],
      refId: required(row['refId'], 120, `items[${at}].refId`),
      label: required(row['label'], LIMITS.placeName, `items[${at}].label`),
    }
  })

  // Order is the contribution, so it is kept exactly as given — but the same
  // thing twice is a slip rather than a curation decision, and the second copy
  // is dropped rather than published.
  const seen = new Set<string>()
  const unique = items.filter((i) => {
    const key = `${i.kind}:${i.refId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return {
    kind: 'collection',
    name: required(body['name'], LIMITS.collectionName, 'name'),
    description: optional(body['description'], LIMITS.collectionDescription, 'description'),
    items: unique,
  }
}

function photo(body: Record<string, unknown>): PhotoContent {
  return {
    kind: 'photo',
    imageRef: required(body['imageRef'], 200, 'imageRef'),
    caption: required(body['caption'], LIMITS.photoCaption, 'caption'),
    place: place(body['place']),
  }
}

// ── field helpers ───────────────────────────────────────────────────────────

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContributionError('invalid', `${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function optional(value: unknown, max: number, field: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new ContributionError('invalid', `${field} must be text`)
  const trimmed = value.trim()
  if (trimmed.length > max) {
    throw new ContributionError(
      'invalid',
      `${field} is ${trimmed.length - max} characters over the limit of ${max}; nothing was cut, trim it yourself`,
    )
  }
  return trimmed || null
}

function required(value: unknown, max: number, field: string): string {
  const text = optional(value, max, field)
  if (!text) throw new ContributionError('invalid', `${field} is required`)
  return text
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ContributionError('invalid', `${field} must be one of ${allowed.join(', ')}`)
  }
  return value as T
}

/**
 * A time, as an instant.
 *
 * Refused rather than parsed. `readWhen` turns prose into readings a resident
 * confirms; by the time something reaches this function the guessing is over,
 * and a service that quietly re-guessed here would be the second reader of a
 * sentence nobody is standing next to.
 */
function instant(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ContributionError('invalid', `${field} must be a confirmed time, in milliseconds`)
  }
  return Math.round(value)
}

/**
 * A place, which is a listing or a name and never an address.
 *
 * The escape hatch takes a name because Town Square stores no address for
 * anybody, and the whole privacy claim is only as good as its least careful
 * text field.
 */
function place(value: unknown): PlaceRef | null {
  if (value === undefined || value === null) return null
  const row = object(value, 'place')
  const name = required(row['name'], LIMITS.placeName, 'place.name')
  const listingId = optional(row['listingId'], 120, 'place.listingId')
  return { listingId, name }
}

/** Rendered as an anchor in the shell, so the scheme is checked, not trusted. */
function link(value: unknown): string | null {
  const raw = optional(value, LIMITS.url, 'link')
  if (!raw) return null
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new ContributionError('invalid', 'a link must be a full web address')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ContributionError('invalid', 'a link must be http or https')
  }
  return parsed.toString()
}

function tags(value: unknown): readonly string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new ContributionError('invalid', 'tags must be a list')
  if (value.length > LIMITS.tags) {
    throw new ContributionError('invalid', `up to ${LIMITS.tags} tags`)
  }
  const out: string[] = []
  for (const entry of value) {
    const tag = required(entry, LIMITS.tagLength, 'tag').toLowerCase()
    if (!out.includes(tag)) out.push(tag)
  }
  return out
}

// ── the pin ─────────────────────────────────────────────────────────────────

/**
 * A digest over the content, key order and all.
 *
 * `JSON.stringify` alone would make the pin depend on the order keys happened
 * to be written in, so two byte-identical contributions could hash differently
 * and a round-trip through any store that rebuilds the object would look like
 * tampering. Sorting the keys is what makes "the moderator read exactly this"
 * a claim rather than a hope.
 */
export function digestContent(content: ContributionContent): string {
  return createHash('sha256').update(canonical(content)).digest('hex')
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
}
