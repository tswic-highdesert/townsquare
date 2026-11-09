/**
 * Every `@townsquare/sdk` method, described as data.
 *
 * This file is the demo's logic and has no UI in it. A view only needs to:
 *   1. render `method.inputs` as form fields (all values are strings),
 *   2. pass those values to `method.run(values)` (see `useSdkCall`),
 *   3. show `method.code(values)` as the equivalent snippet.
 * Swap the view freely; nothing here depends on how it looks.
 *
 * Signatures and requirements follow `packages/sdk/generated/AGENTS.md`.
 */

import { app, records, storage, town, user } from '@townsquare/sdk'

/**
 * The record type this demo defines in `public/townsquare.json`. Written as a
 * literal at each call site too, because reviewers expect record types to be
 * literal strings they can match against the manifest.
 */
export const DEMO_RECORD_TYPE = 'sdk_demo_note'

export type Namespace = 'app' | 'town' | 'user' | 'records' | 'storage'

export interface InputField {
  name: string
  label: string
  kind: 'text' | 'number' | 'json' | 'select'
  /** Only for `kind: 'select'`. An empty string means "not set". */
  options?: string[]
  /** Prefilled value, as a string like every other form value. */
  initial?: string
  /** Optional fields are left out of the call when blank. */
  optional?: boolean
  hint?: string
}

export type InputValues = Record<string, string>

export interface SdkMethod {
  /** e.g. `town.items`, unique, usable as a React key. */
  id: string
  namespace: Namespace
  signature: string
  /** What the method returns or does, in one line. */
  summary: string
  /**
   * Why a creation would use it: the kind of feature it makes possible and
   * when to reach for it. Plain language, shown under "When to use it".
   */
  why: string
  /** The manifest permission the call needs, or `null` for none. */
  requires: string | null
  inputs: InputField[]
  /** Returns the SDK result. `app.*` calls return nothing. */
  run(values: InputValues): Promise<unknown> | void
  /** The equivalent line of code for the current inputs. */
  code(values: InputValues): string
  /** Anything a developer would trip over with this method. */
  note?: string
}

/** Thrown for bad form input before any SDK call is made. */
export class InputError extends Error {
  readonly code = 'invalid_input'
  constructor(message: string) {
    super(message)
    this.name = 'InputError'
  }
}

// ── value parsing ──────────────────────────────────────────────────────────

function text(values: InputValues, name: string): string | undefined {
  const v = values[name]?.trim()
  return v ? v : undefined
}

function requiredText(values: InputValues, name: string): string {
  const v = text(values, name)
  if (v === undefined) throw new InputError(`"${name}" is required.`)
  return v
}

function number(values: InputValues, name: string): number | undefined {
  const v = text(values, name)
  if (v === undefined) return undefined
  const n = Number(v)
  if (!Number.isInteger(n)) throw new InputError(`"${name}" must be a whole number.`)
  return n
}

function json(values: InputValues, name: string): unknown {
  const v = requiredText(values, name)
  try {
    return JSON.parse(v)
  } catch {
    throw new InputError(`"${name}" is not valid JSON.`)
  }
}

function jsonObject(values: InputValues, name: string): Record<string, unknown> {
  const v = json(values, name)
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new InputError(`"${name}" must be a JSON object, like {"text": "hi"}.`)
  }
  return v as Record<string, unknown>
}

/** Builds an options object with blank fields left out entirely. */
function options(values: InputValues, fields: Array<[string, 'text' | 'number']>) {
  const out: Record<string, string | number> = {}
  for (const [name, kind] of fields) {
    const v = kind === 'number' ? number(values, name) : text(values, name)
    if (v !== undefined) out[name] = v
  }
  return out
}

/** Renders an argument list for `code()`; never throws on bad input. */
function show(value: unknown): string {
  if (value === undefined) return ''
  return JSON.stringify(value).replace(/"([a-zA-Z_]\w*)":/g, '$1: ')
}

function safe(fn: () => string): string {
  try {
    return fn()
  } catch {
    return '// fix the inputs to see the code'
  }
}

function optsCode(opts: Record<string, unknown>): string {
  return Object.keys(opts).length ? show(opts) : ''
}

// ── shared input sets ──────────────────────────────────────────────────────

const paging: InputField[] = [
  { name: 'limit', label: 'limit', kind: 'number', optional: true, initial: '10', hint: '1 to 200' },
  { name: 'cursor', label: 'cursor', kind: 'text', optional: true, hint: 'nextCursor from the previous page' },
  { name: 'since', label: 'since', kind: 'text', optional: true, hint: 'ISO timestamp, for periodic syncs' },
]
const pagingFields: Array<[string, 'text' | 'number']> = [
  ['limit', 'number'],
  ['cursor', 'text'],
  ['since', 'text'],
]

const recordId: InputField = { name: 'id', label: 'id', kind: 'text', hint: 'from records.list or records.create' }

export const NOT_YET =
  'The host does not serve records yet (Phase 8), so this answers "not available yet". ' +
  'The call and manifest are already correct and will work unchanged once it lands.'

export const EMPTY_LOCALLY =
  'The local shell does not serve town content yet (apps/web/src/townData.ts), so under ' +
  'pnpm dev this returns empty lists or null. That is the real answer, not a bug in the demo.'

// ── the catalog ────────────────────────────────────────────────────────────

export const METHODS: SdkMethod[] = [
  // app: fire-and-forget, so there is never a result or an error to show.
  {
    id: 'app.ready',
    namespace: 'app',
    signature: 'app.ready(): void',
    summary: 'Tell Town Square the app has rendered.',
    why: 'Every creation needs this. Until it is called, Town Square shows a loading skeleton, and after 10 seconds it swaps your app for a "did not load" message. Call it as soon as the first screen is drawn, even if data is still loading.',
    requires: null,
    inputs: [],
    run: () => app.ready(),
    code: () => 'app.ready()',
    note: 'Already called once from main.tsx on first paint. Calling it again is harmless.',
  },
  {
    id: 'app.setHeight',
    namespace: 'app',
    signature: 'app.setHeight(px: number): void',
    summary: 'Ask the host to resize the frame (clamped to 200-4000px).',
    why: 'Makes the frame fit your content so visitors scroll the page, not a small box inside it. Town Square cannot see inside the frame, so the app has to report its own height. This demo does it automatically whenever its content changes.',
    requires: null,
    inputs: [{ name: 'px', label: 'px', kind: 'number', initial: '720' }],
    run: (v) => {
      const px = number(v, 'px')
      if (px === undefined) throw new InputError('"px" is required.')
      app.setHeight(px)
    },
    code: (v) => safe(() => `app.setHeight(${number(v, 'px') ?? ''})`),
    note: 'The demo also reports its own height whenever it resizes (main.tsx), so a value set here lasts until the next resize.',
  },
  {
    id: 'app.setTitle',
    namespace: 'app',
    signature: 'app.setTitle(text: string): void',
    summary: 'Set the line Town Square shows above the app (80 chars, plain text).',
    why: "Shows live status above your app, like \"12 cameras mapped\" or \"3 events today\". Not for your app's name: Town Square already shows that from the manifest.",
    requires: null,
    inputs: [{ name: 'text', label: 'text', kind: 'text', initial: 'Testing the SDK' }],
    run: (v) => {
      const t = requiredText(v, 'text')
      if (t.length > 80) throw new InputError('"text" is over 80 characters.')
      app.setTitle(t)
    },
    code: (v) => `app.setTitle(${show(text(v, 'text') ?? '')})`,
  },

  // town: public information, no permission needed.
  {
    id: 'town.info',
    namespace: 'town',
    signature: 'town.info(): Promise<TownInfo>',
    summary: 'The town id, display name and IANA timezone.',
    why: "Tells you which town you are in and its timezone. Use the timezone for anything with dates, so \"today\" means today in the town, not on the visitor's device. Also handy for a greeting like \"Welcome to Russellville\".",
    requires: null,
    inputs: [],
    run: () => town.info(),
    code: () => 'await town.info()',
  },
  {
    id: 'town.thisWeek',
    namespace: 'town',
    signature: 'town.thisWeek(): Promise<ThisWeek>',
    summary: 'Events and notices bucketed into today, weekend, comingUp and notices.',
    why: "The quickest way to show what is happening: today, this weekend, coming up, and notices, already sorted in the town's timezone. Use it for a \"this week\" view instead of filtering town.items yourself, since the grouping rules are tricky and match the rest of Town Square.",
    requires: null,
    inputs: [],
    run: () => town.thisWeek(),
    code: () => 'await town.thisWeek()',
    note: EMPTY_LOCALLY,
  },
  {
    id: 'town.items',
    namespace: 'town',
    signature: 'town.items(opts?): Promise<{ items, nextCursor }>',
    summary: 'Ingested town content: events, notices, stories. Cursor-paginated.',
    why: 'For anything that lists or searches town content: a news feed, an events calendar, a search box. Filter by type or text, page through with the cursor, and pass since when refreshing so you only fetch what changed.',
    requires: null,
    inputs: [
      { name: 'type', label: 'type', kind: 'select', options: ['', 'event', 'notice', 'story'], optional: true },
      { name: 'q', label: 'q', kind: 'text', optional: true, hint: 'search text' },
      ...paging,
    ],
    run: (v) => town.items(options(v, [['type', 'text'], ['q', 'text'], ...pagingFields])),
    code: (v) =>
      safe(() => `await town.items(${optsCode(options(v, [['type', 'text'], ['q', 'text'], ...pagingFields]))})`),
    note: EMPTY_LOCALLY,
  },
  {
    id: 'town.item',
    namespace: 'town',
    signature: 'town.item(id: string): Promise<Item | null>',
    summary: 'One ingested item by id. Returns null when missing or stale.',
    why: 'Shows one event, notice or story in full, for example a detail view after someone taps a list entry. Returns null when it is gone, so you can say "no longer available" instead of showing an error.',
    requires: null,
    inputs: [{ name: 'id', label: 'id', kind: 'text', hint: 'an id from town.items' }],
    run: (v) => town.item(requiredText(v, 'id')),
    code: (v) => `await town.item(${show(text(v, 'id') ?? '')})`,
    note: EMPTY_LOCALLY,
  },
  {
    id: 'town.businesses',
    namespace: 'town',
    signature: 'town.businesses(opts?): Promise<{ items, nextCursor }>',
    summary: 'The town business directory. Cursor-paginated.',
    why: "Start here for anything about local places: a restaurant ranking, a shop-local map, a \"what's open now\" list. It holds about 700 real listings with addresses, hours and coordinates, kept current, so you never maintain your own list that goes stale.",
    requires: null,
    inputs: [
      { name: 'tag', label: 'tag', kind: 'text', optional: true, hint: 'e.g. restaurant' },
      { name: 'q', label: 'q', kind: 'text', optional: true, hint: 'search text' },
      ...paging,
    ],
    run: (v) => town.businesses(options(v, [['tag', 'text'], ['q', 'text'], ...pagingFields])),
    code: (v) =>
      safe(
        () => `await town.businesses(${optsCode(options(v, [['tag', 'text'], ['q', 'text'], ...pagingFields]))})`,
      ),
  },

  // user
  {
    id: 'user.current',
    namespace: 'user',
    signature: 'user.current(): Promise<User | null>',
    summary: 'The signed-in handle and whether they are verified.',
    why: 'Lets your app adapt to who is looking: greet a signed-in resident by handle, or show "sign in to contribute" to everyone else. Most visitors are signed out, so always handle null. It only reveals a handle and whether they are verified, never a name or email.',
    requires: 'permissions.identity: "handle"',
    inputs: [],
    run: () => user.current(),
    code: () => 'await user.current()',
    note: 'null when nobody is signed in, which is the common case.',
  },

  // storage: private per-user state; needs a signed-in user.
  {
    id: 'storage.get',
    namespace: 'storage',
    signature: 'storage.get(key: string): Promise<unknown>',
    summary: "Read this user's private value for a key. undefined when unset.",
    why: 'Brings back what this person saved last time, such as their filters, favourites or progress in a game, so the app remembers them. Works only when they are signed in, and only your app can read it.',
    requires: 'permissions.storage: true',
    inputs: [{ name: 'key', label: 'key', kind: 'text', initial: 'demo' }],
    run: (v) => storage.get(requiredText(v, 'key')),
    code: (v) => `await storage.get(${show(text(v, 'key') ?? '')})`,
    note: 'Throws unauthenticated when signed out.',
  },
  {
    id: 'storage.set',
    namespace: 'storage',
    signature: 'storage.set(key: string, value: unknown): Promise<void>',
    summary: "Save this user's private value (JSON, 64KB total per user).",
    why: "Saves one person's preferences or progress privately for their next visit, up to 64KB per person. If other people should see it, use records instead.",
    requires: 'permissions.storage: true',
    inputs: [
      { name: 'key', label: 'key', kind: 'text', initial: 'demo' },
      { name: 'value', label: 'value (JSON)', kind: 'json', initial: '{"count": 1}' },
    ],
    run: (v) => storage.set(requiredText(v, 'key'), json(v, 'value')),
    code: (v) => safe(() => `await storage.set(${show(text(v, 'key') ?? '')}, ${show(json(v, 'value'))})`),
    note: 'Throws unauthenticated when signed out, too_large past 64KB.',
  },

  // records: shared, versioned town data. Not served by the host yet.
  {
    id: 'records.list',
    namespace: 'records',
    signature: 'records.list(type: string, opts?): Promise<{ items, nextCursor }>',
    summary: 'Read shared town records of one type.',
    why: 'Shows what the town has collected together, such as every reported pothole or every mapped camera. Records are shared between creations, so you can build on data another app started instead of beginning from nothing.',
    requires: `"${DEMO_RECORD_TYPE}" in permissions.read`,
    inputs: paging,
    run: (v) => {
      const opts = options(v, pagingFields)
      return records.list('sdk_demo_note', Object.keys(opts).length ? opts : undefined)
    },
    code: (v) => safe(() => `await records.list('sdk_demo_note'${optsCode(options(v, pagingFields)) ? ', ' + show(options(v, pagingFields)) : ''})`),
    note: NOT_YET,
  },
  {
    id: 'records.get',
    namespace: 'records',
    signature: 'records.get(type: string, id: string): Promise<Record | null>',
    summary: 'One record, by type and id.',
    why: 'Loads one shared record, for example to open its detail view or check its latest state before editing it.',
    requires: `"${DEMO_RECORD_TYPE}" in permissions.read`,
    inputs: [recordId],
    run: (v) => records.get('sdk_demo_note', requiredText(v, 'id')),
    code: (v) => `await records.get('sdk_demo_note', ${show(text(v, 'id') ?? '')})`,
    note: NOT_YET,
  },
  {
    id: 'records.create',
    namespace: 'records',
    signature: 'records.create(type: string, data: object): Promise<Record>',
    summary: 'Add a record to the town. Needs a verified resident.',
    why: "Lets residents add to the town's shared data, like reporting a broken streetlight. Only verified residents can create records, and Town Square attaches who wrote it and from which app automatically, so it cannot be faked.",
    requires: `"${DEMO_RECORD_TYPE}" in permissions.write`,
    inputs: [{ name: 'data', label: 'data (JSON)', kind: 'json', initial: '{"text": "Hello from the SDK demo"}' }],
    run: (v) => records.create('sdk_demo_note', jsonObject(v, 'data')),
    code: (v) => safe(() => `await records.create('sdk_demo_note', ${show(jsonObject(v, 'data'))})`),
    note: NOT_YET,
  },
  {
    id: 'records.update',
    namespace: 'records',
    signature: 'records.update(type: string, id: string, patch: object): Promise<Record>',
    summary: 'Change a record. Writes a new version; nothing is destroyed.',
    why: 'Lets residents correct shared data, like marking a pothole as fixed. Records work like a wiki: any verified resident can edit, nothing is deleted, and every change is kept as a new version.',
    requires: `"${DEMO_RECORD_TYPE}" in permissions.write`,
    inputs: [recordId, { name: 'patch', label: 'patch (JSON)', kind: 'json', initial: '{"text": "Edited"}' }],
    run: (v) => records.update('sdk_demo_note', requiredText(v, 'id'), jsonObject(v, 'patch')),
    code: (v) =>
      safe(() => `await records.update('sdk_demo_note', ${show(text(v, 'id') ?? '')}, ${show(jsonObject(v, 'patch'))})`),
    note: NOT_YET,
  },
  {
    id: 'records.history',
    namespace: 'records',
    signature: 'records.history(type: string, id: string): Promise<Version[]>',
    summary: 'Every version of a record, oldest first.',
    why: 'Shows who changed a record, when, and what it said before. Displaying this is what makes community-edited data trustworthy, because every edit stays visible and accountable.',
    requires: `"${DEMO_RECORD_TYPE}" in permissions.read`,
    inputs: [recordId],
    run: (v) => records.history('sdk_demo_note', requiredText(v, 'id')),
    code: (v) => `await records.history('sdk_demo_note', ${show(text(v, 'id') ?? '')})`,
    note: NOT_YET,
  },
]

export const NAMESPACES: Namespace[] = ['app', 'town', 'user', 'storage', 'records']

/** Starting form values for a method, from each input's `initial`. */
export function initialValues(method: SdkMethod): InputValues {
  return Object.fromEntries(method.inputs.map((f) => [f.name, f.initial ?? '']))
}

/** The `nextCursor` of a paginated result, if there is another page. */
export function nextCursorOf(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null
  const c = (result as { nextCursor?: unknown }).nextCursor
  return typeof c === 'string' && c ? c : null
}
