/**
 * Yours, as the shell sees it.
 *
 * Declared here rather than imported from `@townsquare/saves`, the same way
 * `todayData.ts` declares the Today payload: the shell and the API are separate
 * services, and the wire shape is a contract rather than a shared object.
 */

/** Mirrors `SAVE_KINDS` in `@townsquare/saves`. `story` is the one that
 * points at a page we do not host. */
export type SaveKind = 'business' | 'event' | 'creation' | 'story'

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

/**
 * Null rather than a throw, and that includes the network being gone.
 *
 * `fetch` rejects on a dropped connection rather than resolving with a
 * non-ok response, so the two functions below used to keep their "returns
 * null on any refusal" promise for an HTTP refusal and break it for the one
 * case a bookmark button is most likely to meet: a phone with no signal. The
 * news reader's save control sat on "Removing" forever because of it, and
 * Yours had the same unhandled rejection waiting in `unsave`.
 */
async function post(body: unknown): Promise<Response | null> {
  try {
    return await fetch('/api/saves', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return null
  }
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
  if (!res?.ok) return null
  return ((await res.json()) as { save: SavedThing }).save
}

export async function unsaveThing(kind: SaveKind, refId: string): Promise<boolean> {
  const res = await post({ remove: true, kind, refId })
  return res?.ok === true
}
