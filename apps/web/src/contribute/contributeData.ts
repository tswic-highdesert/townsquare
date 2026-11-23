/**
 * Contributing, as the shell sees it.
 *
 * The wire shapes are declared here rather than imported from
 * `@townsquare/contributions`, the same way `todayData.ts` and `savesData.ts`
 * declare theirs: the shell and the API are separate services and the payload
 * is a contract between them, not a shared object. When they drift, they drift
 * at a boundary somebody can see.
 *
 * Nothing in this file decides anything. Which types a resident may use, what
 * happens when they are short of vouches, whether a correction needs a human,
 * and where they are on the daily ladder are all answered by the service and
 * arrive here as data. The composer's job is to render the answer, never to
 * predict it — a client that guessed the gate would be a second implementation
 * of the policy, and the two would disagree on the day it mattered.
 */

import { msg, t } from '../i18n/index.js'

export type ContributionType = 'event' | 'correction' | 'notice' | 'collection' | 'photo'

/** The type's own noun, for places that would otherwise print the machine value. */
export const TYPE_NAMES: Record<ContributionType, string> = {
  event: msg('event'),
  correction: msg('correction'),
  notice: msg('notice'),
  collection: msg('collection'),
  photo: msg('photo'),
}

/** What the chooser shows for one type, straight from the gate matrix. */
export interface GateAvailability {
  type: ContributionType
  label: string
  standing: 'signed_in' | 'verified' | 'organisation'
  allowed: boolean
  /**
   * What happens if they use it anyway.
   *
   * `hold` is the difference between a locked row that reads as a door and one
   * that reads as a wall: the work is kept and posts the moment the vouches
   * land. The chooser says so rather than making somebody find out.
   */
  ifUsed: 'publish' | 'review' | 'hold' | 'refuse' | 'unavailable'
  reason: string | null
}

export interface PauseState {
  level: 'clear' | 'noticed' | 'paused'
  count: number
  attempts: number
  retryAt: number | null
  escalated: boolean
  stillAllowed: readonly string[]
}

export interface ContributeOptions {
  types: GateAvailability[]
  pause: PauseState
  /** The quiet line under the publish bar, or nothing at all. */
  notice: string | null
}

export type Attribution =
  | { kind: 'resident'; userId: string; handle: string }
  | {
      kind: 'resident_via_creation'
      userId: string
      handle: string
      creationId: string
      creationName: string
    }
  | { kind: 'organisation'; orgId: string; orgName: string; userId: string; handle: string }
  | {
      kind: 'creation'
      creationId: string
      creationName: string
      ownerId: string
      ownerHandle: string
    }
  | { kind: 'source'; label: string }

export type ContributionStatus =
  | 'held_for_verification'
  | 'queued'
  | 'scheduled'
  | 'published'
  | 'declined'
  | 'withdrawn'

export interface Contribution {
  id: string
  type: ContributionType
  content: Record<string, unknown>
  attribution: Attribution
  status: ContributionStatus
  route: 'none' | 'owner' | 'moderator'
  recordId: string | null
  recordVersion: number | null
  scheduledFor: number | null
  /**
   * The moderator's words, shown verbatim.
   *
   * Never summarised and never truncated in the UI. This is the only moment
   * the platform tells a resident no, and how it reads decides whether they
   * contribute again.
   */
  decisionNote: string | null
  decidedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface Draft {
  id: string
  type: ContributionType
  content: Record<string, unknown>
  title: string
  createdAt: number
  updatedAt: number
}

export interface MinePayload {
  contributions: Contribution[]
  drafts: Draft[]
  pause: PauseState
  notice: string | null
}

export interface SubmitResult {
  contribution: Contribution
  outcome: 'published' | 'queued' | 'scheduled' | 'held_for_verification'
  duplicate: boolean
  recordId: string | null
  pause: PauseState
}

/** Every failure this surface can show, with the service's own sentence. */
export interface ContributeError {
  error: 'invalid' | 'forbidden' | 'not_found' | 'conflict' | 'stale' | 'paused' | 'unavailable'
  message: string
}

export function isError(value: unknown): value is ContributeError {
  return typeof value === 'object' && value !== null && 'error' in value
}

/* ── the natural-language date field ─────────────────────────────────────── */

export interface WhenReading {
  startsAt: number
  /** "Saturday 14 June, 7pm", read back in full so a skim cannot misread it. */
  label: string
}

/**
 * What the service heard, which is never a decision.
 *
 * Five shapes, matching the five states the composer draws. `ambiguous` is the
 * important one: two readings and nothing picked, because defaulting to pm is
 * right most of the time in a town with evening ball games and wrong every
 * Saturday morning at the market.
 */
export type WhenResult =
  | { kind: 'empty' }
  | { kind: 'ok'; text: string; reading: WhenReading }
  | { kind: 'ambiguous'; text: string; readings: WhenReading[] }
  | { kind: 'needs_time'; text: string; dayLabel: string }
  | { kind: 'unreadable'; text: string }

/* ── calls ───────────────────────────────────────────────────────────────── */

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
}

/** Null when nobody is signed in. Contributing is a signed-in surface. */
export async function fetchOptions(): Promise<ContributeOptions | null> {
  const res = await fetch('/api/contribute/options', { credentials: 'same-origin' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`contribute options ${res.status}`)
  return (await res.json()) as ContributeOptions
}

export async function fetchMine(): Promise<MinePayload | null> {
  const res = await fetch('/api/contributions', { credentials: 'same-origin' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`contributions ${res.status}`)
  return (await res.json()) as MinePayload
}

/**
 * Read a date the way somebody would say it.
 *
 * A POST because the words go in a body: a date somebody is halfway through
 * typing has no business in an access log or a browser history.
 */
export async function readWhen(text: string): Promise<WhenResult> {
  if (!text.trim()) return { kind: 'empty' }
  try {
    const res = await post('/api/contribute/when', { text })
    if (!res.ok) return { kind: 'unreadable', text }
    return (await res.json()) as WhenResult
  } catch { return { kind: 'unreadable', text } }
}

export async function submit(input: {
  type: ContributionType
  content: unknown
  draftId?: string
}): Promise<SubmitResult | ContributeError> {
  try {
    const res = await post('/api/contributions', input.draftId ? { draftId: input.draftId } : input)
    const body = (await res.json()) as SubmitResult | ContributeError
    return res.ok ? (body as SubmitResult) : (body as ContributeError)
  } catch {
    return { error: 'unavailable', message: t('We could not confirm your submission. Your text is still here. Check your contributions before trying again.') }
  }
}

export async function saveDraft(input: {
  id?: string | null
  type: ContributionType
  content: unknown
}): Promise<Draft | ContributeError> {
  try {
    const res = await post('/api/drafts', input)
    const body = (await res.json()) as { draft: Draft } | ContributeError
    return res.ok ? (body as { draft: Draft }).draft : (body as ContributeError)
  } catch {
    return { error: 'unavailable', message: t('Draft not saved. Keep this page open and try again when your connection returns.') }
  }
}

export async function discardDraft(id: string): Promise<boolean> {
  try {
    const res = await post(`/api/drafts/${id}/discard`, {})
    if (!res.ok) return false
    return ((await res.json()) as { discarded: boolean }).discarded
  } catch { return false }
}

export async function withdraw(id: string): Promise<Contribution | ContributeError> {
  try {
    const res = await post(`/api/contributions/${id}/withdraw`, {})
    const body = (await res.json()) as { contribution: Contribution } | ContributeError
    return res.ok ? (body as { contribution: Contribution }).contribution : (body as ContributeError)
  } catch {
    return { error: 'unavailable', message: t('We could not confirm the withdrawal. Check the status and try again.') }
  }
}

export interface RecordVersion {
  id: string
  version: number
  data: Record<string, unknown>
  author: Attribution
  revertedFrom: number | null
  createdAt: number
}

export interface RecordHistory {
  record: { id: string; type: string; currentVersion: number; data: Record<string, unknown> }
  versions: RecordVersion[]
}

export async function fetchHistory(recordId: string): Promise<RecordHistory | null> {
  const res = await fetch(`/api/records/${recordId}/history`, { credentials: 'same-origin' })
  if (!res.ok) return null
  return (await res.json()) as RecordHistory
}

/* ── shaping what the composer collected ─────────────────────────────────── */

/**
 * The directory, for the place picker and the correction target.
 *
 * Reuses the same listing endpoint Nearby reads. A place on an event is a real
 * listing rather than a string somebody typed, so the event moves if the
 * business's address does, and so the escape hatch can take a name and never
 * an address.
 */
export interface Listing {
  id: string
  name: string
  category: string
  address: string
  phone?: string
}

/**
 * The whole directory, fetched once and searched in the browser.
 *
 * It reads `/api/nearby` rather than `/api/businesses`, and the reason is a bug
 * this had first: `/api/businesses` caps at 200 rows, so filtering its response
 * meant the picker could only ever find businesses in the first two hundred of
 * seven hundred and forty one. Stoby's is not in the first two hundred. A
 * search box that silently cannot find most of the town is worse than no search
 * box, because a resident concludes the listing does not exist and stops.
 *
 * `/api/nearby` is the payload the Nearby screen already loads: every placeable
 * listing, uncapped, 54 KB over the wire gzipped, and it takes no cookie and no
 * coordinates in either direction. Searching it here rather than server-side
 * keeps that property — the town does not learn what somebody typed into a
 * place picker.
 */
let directory: Promise<Listing[]> | null = null

function loadDirectory(): Promise<Listing[]> {
  directory ??= fetch('/api/nearby', { credentials: 'same-origin' })
    .then((res) => (res.ok ? res.json() : { places: [] }))
    .then((body: { places?: Array<Record<string, unknown>> }) =>
      (body.places ?? []).map((p) => ({
        id: String(p['id'] ?? ''),
        name: String(p['name'] ?? ''),
        category: String(p['detail'] ?? ''),
        address: String(p['address'] ?? ''),
        ...(typeof p['phone'] === 'string' ? { phone: p['phone'] } : {}),
      })),
    )
    // A failed load must not poison the cache: the next keystroke should try
    // again rather than leave the picker permanently empty.
    .catch(() => {
      directory = null
      return []
    })
  return directory
}

export async function searchListings(query: string): Promise<Listing[]> {
  const trimmed = query.trim().toLowerCase()
  if (trimmed.length < 2) return []
  const all = await loadDirectory()
  // Names that start with what was typed first: somebody typing "sto" wants
  // Stoby's above "Big Sto Auto", and a plain `includes` buries it.
  const starts: Listing[] = []
  const contains: Listing[] = []
  for (const l of all) {
    const name = l.name.toLowerCase()
    if (name.startsWith(trimmed)) starts.push(l)
    else if (name.includes(trimmed)) contains.push(l)
  }
  return [...starts, ...contains].slice(0, 8)
}

/** The categories the event chips offer. Closed, so the feed can be filtered. */
export const EVENT_CATEGORIES = ['music', 'church', 'sport', 'market', 'kids', 'civic'] as const

export const EVENT_CATEGORY_NAMES: Record<(typeof EVENT_CATEGORIES)[number], string> = {
  music: msg('music'),
  church: msg('church'),
  sport: msg('sport'),
  market: msg('market'),
  kids: msg('kids'),
  civic: msg('civic'),
}

/** The fields a correction may touch. One correction, one field. */
export const CORRECTION_FIELDS = [
  { field: 'phone', label: msg('Phone') },
  { field: 'hours', label: msg('Hours') },
  { field: 'address', label: msg('Address') },
  { field: 'name', label: msg('Name') },
  { field: 'closed', label: msg('Closed for good') },
] as const

/**
 * The rungs an organisation may reach for.
 *
 * Three, not four. `emergency` breaks through a silent phone and is the one
 * channel nobody can turn off, so it is not a thing a person types into a
 * form; it comes from an authority with its own siren. The service refuses it
 * and this list is why the composer never offers it.
 */
export const NOTICE_SEVERITIES = [
  {
    value: 'informational',
    name: msg('A notice'),
    what: msg('Appears under Notices and in the week ahead. Nobody makes a sound.'),
    note: msg('most notices'),
  },
  {
    value: 'advisory',
    name: msg('Time sensitive'),
    what: msg('A quiet push, and it stays at the top of Today until it passes.'),
    note: null,
  },
  {
    value: 'urgent',
    name: msg('Urgent'),
    what: msg('Wakes up every phone in Russellville, tonight, including people asleep. Held for a moderator before it sends.'),
    note: null,
  },
] as const
