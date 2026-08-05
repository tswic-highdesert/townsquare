/**
 * Yours, as the shell sees it.
 *
 * Declared here rather than imported from `@townsquare/saves`, the same way
 * `todayData.ts` declares the Today payload: the shell and the API are separate
 * services, and the wire shape is a contract rather than a shared object.
 */

export type SaveKind = 'business' | 'event' | 'creation'

export interface SavedThing {
  id: string
  kind: SaveKind
  refId: string
  title: string
  detail: string | null
  url: string | null
  savedAt: number
}

/** A creation this resident owns. Attribution is set at approval, never claimed. */
export interface BuiltCreation {
  slug: string
  name: string
  tagline: string
  status: 'active' | 'hidden' | 'blocked'
  updatedAt: number
}

export interface YoursPayload {
  saves: SavedThing[]
  built: BuiltCreation[]
}

/** Null when nobody is signed in. Yours is the one screen that requires it. */
export async function fetchYours(): Promise<YoursPayload | null> {
  const res = await fetch('/api/yours', { credentials: 'same-origin' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`yours ${res.status}`)
  return (await res.json()) as YoursPayload
}

export interface SaveRequest {
  kind: SaveKind
  refId: string
  title: string
  detail?: string
  url?: string
}

async function post(body: unknown): Promise<Response> {
  return fetch('/api/saves', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Save something, and get the row back.
 *
 * Returns null on any refusal rather than throwing. The caller is a bookmark
 * button: it optimistically shows the saved state and rolls back if this comes
 * back empty, and there is nothing useful it would do with an exception that it
 * does not do with a null.
 */
export async function saveThing(input: SaveRequest): Promise<SavedThing | null> {
  const res = await post(input)
  if (!res.ok) return null
  return ((await res.json()) as { save: SavedThing }).save
}

export async function unsaveThing(kind: SaveKind, refId: string): Promise<boolean> {
  const res = await post({ remove: true, kind, refId })
  return res.ok
}
