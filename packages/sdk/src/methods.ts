/**
 * The method table. One source, several outputs.
 *
 * This single table produces:
 *   1. the host-side permission registry (what each call requires)
 *   2. the host-side params validator
 *   3. the docs artifact the MCP serves as `get_sdk_docs`
 *   4. the `AGENTS.md` shipped in starter templates
 *   5. the validator's table of legal SDK call sites
 *
 * That is deliberate. Documentation that is merely published drifts; documentation
 * that is load-bearing at runtime cannot. If a method is missing its docs or its
 * permission rule, the generator throws and nothing ships.
 */

import { z } from 'zod'
import { MAX_LINK_CHARS, type Method } from '@townsquare/shared'

/**
 * What a call needs before the host will run it.
 *
 * `recordRead` and `recordWrite` name which argument carries the record type,
 * because permission is declared per type. The host reads that argument and
 * checks it against the frozen manifest. The argument must be a literal string
 * in the source; the validator rejects a dynamic one, since a reviewer cannot
 * see what an app touches if the code does not say.
 */
export type Requirement =
  | { kind: 'none' }
  | { kind: 'identity' }
  | { kind: 'storage' }
  | { kind: 'recordRead'; typeArg: number }
  | { kind: 'recordWrite'; typeArg: number }

export interface MethodDef {
  /** Wire method name. Flat and closed; never assembled from guest strings. */
  method: Method
  /** How a builder writes it. */
  signature: string
  /** One line. Shows up in docs and in generated code completions. */
  summary: string
  /** Longer prose for the docs artifact. Written for a language model to read. */
  description: string
  requires: Requirement
  /** Validated on the host side of the port before the handler runs. */
  params: z.ZodTypeAny
  /** Shape of a successful result, for the docs. */
  returns: string
  /** Must compile and must actually run against the mock bridge in tests. */
  example: string
  /** Error codes a builder should expect from this call specifically. */
  throws: string[]
}

const cursorParams = z.object({
  since: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
})

export const METHODS: ReadonlyArray<Readonly<MethodDef>> = Object.freeze([
  // ── app ───────────────────────────────────────────────────────────────────
  {
    method: 'app.ready',
    signature: 'app.ready(): void',
    summary: 'Tell Town Square the app has rendered.',
    description:
      'Call this once, as soon as your first paint is done. Until you call it the host shows a ' +
      'loading skeleton, and if you never call it within 10 seconds the host replaces your frame ' +
      'with a did-not-load state. Calling it late is the single most common reason a working app ' +
      'looks broken, so call it even if you are still fetching data in the background.',
    requires: { kind: 'none' },
    params: z.undefined(),
    returns: 'nothing',
    example: `import { app } from '@townsquare/sdk'\ndocument.body.innerHTML = '<h1>Hello</h1>'\napp.ready()`,
    throws: [],
  },
  {
    method: 'app.setHeight',
    signature: 'app.setHeight(px: number): void',
    summary: 'Ask the host to resize your frame.',
    description:
      'Only meaningful when your manifest sets `display.height` to a number. Under the default ' +
      '"auto" the host measures you and this call is a harmless no-op, so it is safe to call ' +
      'unconditionally. Values are clamped to 200-4000px.',
    requires: { kind: 'none' },
    params: z.number().int(),
    returns: 'nothing',
    example: `import { app } from '@townsquare/sdk'\napp.setHeight(720)`,
    throws: [],
  },
  {
    method: 'app.setTitle',
    signature: 'app.setTitle(text: string): void',
    summary: 'Set the line Town Square shows above your app.',
    description:
      'Up to 80 characters of plain text, rendered as a text node so markup will not work. Use it ' +
      'for live state such as "12 cameras mapped", not for your app name, which the host already ' +
      'shows from your manifest.',
    requires: { kind: 'none' },
    params: z.string().max(80),
    returns: 'nothing',
    example: `import { app } from '@townsquare/sdk'\napp.setTitle('12 cameras mapped')`,
    throws: [],
  },
  {
    method: 'app.openLink',
    signature: 'app.openLink(url: string): Promise<void>',
    summary: 'Open a website, phone number or email address for the resident.',
    description:
      '**You usually do not need this: ordinary links already work.** The SDK catches clicks on ' +
      '`<a href>` links that leave your app, including `target="_blank"`, `tel:` and `mailto:`, ' +
      'and calls this for you; it also routes `window.open`. Your frame cannot open pages itself, ' +
      'so Town Square shows the resident where the link goes and opens it only if they agree. ' +
      'Call it directly only from a click or tap handler: a call that is not the result of the ' +
      'resident pressing something is refused, and so is a second link while the first dialog is ' +
      'still open. Allowed: `https:`, `http:` (shown as not private), `tel:` and `mailto:` with ' +
      'one address and an optional subject and body. Refused: `javascript:`, `data:`, IP ' +
      'addresses, local network names, links with a username or password, and `cc`/`bcc`. The ' +
      'promise resolves once the dialog is shown, not when the resident answers, and you are ' +
      'never told whether they went.',
    requires: { kind: 'none' },
    params: z.string().max(MAX_LINK_CHARS),
    returns: 'nothing',
    example: `import { app } from '@townsquare/sdk'\ndocument.querySelector('#call').addEventListener('click', () => app.openLink('tel:+14795551212'))`,
    throws: ['invalid_request', 'rate_limited', 'unavailable'],
  },

  // ── town ──────────────────────────────────────────────────────────────────
  {
    method: 'town.info',
    signature: 'town.info(): Promise<TownInfo>',
    summary: 'Which town you are running in.',
    description:
      'Returns the town id, display name and IANA timezone. Use the timezone for anything ' +
      'date-related: a creation runs in residents’ browsers all over, and "today" must mean ' +
      "today in the town, not on the visitor's device.",
    requires: { kind: 'none' },
    params: z.undefined(),
    returns: '{ id, name, timezone }',
    example: `import { town } from '@townsquare/sdk'\nconst { name, timezone } = await town.info()`,
    throws: ['unavailable'],
  },
  {
    method: 'town.thisWeek',
    signature: 'town.thisWeek(): Promise<ThisWeek>',
    summary: "What is happening in town, already bucketed.",
    description:
      'Returns `{ today, weekend, comingUp, notices }`. Buckets are mutually exclusive and events ' +
      'are sorted by start time, computed in the town timezone. Prefer this over filtering ' +
      '`town.items` yourself; the bucketing rules are subtle and shared with the rest of the app.',
    requires: { kind: 'none' },
    params: z.undefined(),
    returns: '{ today[], weekend[], comingUp[], notices[] }',
    example: `import { town } from '@townsquare/sdk'\nconst { today } = await town.thisWeek()`,
    throws: ['unavailable'],
  },
  {
    method: 'town.items',
    signature: 'town.items(opts?): Promise<{ items, nextCursor }>',
    summary: 'Ingested town content: events, notices, stories.',
    description:
      'Cursor-paginated. **No permission declaration is needed for anything under `town.*`** ' +
      'because this is public town information that anyone can read on the website anyway. Pass ' +
      '`since` when you sync periodically so you are not refetching the whole town every time.',
    requires: { kind: 'none' },
    params: cursorParams.extend({
      type: z.enum(['event', 'notice', 'story']).optional(),
      q: z.string().max(200).optional(),
    }),
    returns: '{ items: Item[], nextCursor?: string }',
    example: `import { town } from '@townsquare/sdk'\nconst { items } = await town.items({ type: 'event', limit: 50 })`,
    throws: ['invalid_request', 'unavailable'],
  },
  {
    method: 'town.item',
    signature: 'town.item(id: string): Promise<Item | null>',
    summary: 'One ingested item by id.',
    description: 'Returns null rather than throwing when the item does not exist or has gone stale.',
    requires: { kind: 'none' },
    params: z.string().min(1).max(200),
    returns: 'Item | null',
    example: `import { town } from '@townsquare/sdk'\nconst item = await town.item(id)`,
    throws: ['invalid_request', 'unavailable'],
  },
  {
    method: 'town.businesses',
    signature: 'town.businesses(opts?): Promise<{ items, nextCursor }>',
    summary: 'The town business directory.',
    description:
      'Roughly 700 real local listings with name, category, address, phone, website, hours and ' +
      'real coordinates. **Read this instead of building your own list.** A burrito ranking or a ' +
      'shop-local game should start from the town directory, not from a hardcoded array that goes ' +
      'stale the week you ship it.',
    requires: { kind: 'none' },
    params: cursorParams.extend({
      tag: z.string().max(60).optional(),
      q: z.string().max(200).optional(),
    }),
    returns: '{ items: Business[], nextCursor?: string }',
    example: `import { town } from '@townsquare/sdk'\nconst { items } = await town.businesses({ tag: 'restaurant' })`,
    throws: ['invalid_request', 'unavailable'],
  },

  // ── user ──────────────────────────────────────────────────────────────────
  {
    method: 'user.current',
    signature: 'user.current(): Promise<User | null>',
    summary: 'Who is looking at your app right now.',
    description:
      'Returns `{ handle, verified }` or **null when nobody is signed in, which is the common ' +
      'case**. Most visitors to a town square are not logged in, so an app that assumes a user is ' +
      'broken for most of the town. This is the entire identity surface: there is no email, no ' +
      'real name, no location and no session token, and no permission level that grants them. ' +
      'Requires `permissions.identity: "handle"`.',
    requires: { kind: 'identity' },
    params: z.undefined(),
    returns: '{ handle: string, verified: boolean } | null',
    example: `import { user } from '@townsquare/sdk'\nconst me = await user.current()\nif (me?.verified) { /* can contribute */ }`,
    throws: ['permission_denied'],
  },

  // ── records ───────────────────────────────────────────────────────────────
  {
    method: 'records.list',
    signature: "records.list(type: string, opts?): Promise<{ items, nextCursor }>",
    summary: 'Read shared town records of one type.',
    description:
      'The type must be a **literal string** and must appear in `permissions.read`. Records are ' +
      'town-wide: if another creation already defined `flock_camera`, read theirs rather than ' +
      'inventing a parallel type for the same fact. That reuse is the entire point of records.',
    requires: { kind: 'recordRead', typeArg: 0 },
    params: z.tuple([z.string(), cursorParams.optional()]),
    returns: '{ items: Record[], nextCursor?: string }',
    example: `import { records } from '@townsquare/sdk'\nconst { items } = await records.list('flock_camera', { limit: 100 })`,
    throws: ['permission_denied', 'invalid_request', 'unavailable'],
  },
  {
    method: 'records.get',
    signature: 'records.get(type: string, id: string): Promise<Record | null>',
    summary: 'One record, by type and id.',
    description:
      'The type is required even though the id alone would identify the row. Permission is granted ' +
      'per type, so passing it keeps the check a simple lookup; without it the host would have to ' +
      'resolve the id first, which would leak whether records exist under types you cannot read. A ' +
      'type and id that do not match is simply `not_found`.',
    requires: { kind: 'recordRead', typeArg: 0 },
    params: z.tuple([z.string(), z.string()]),
    returns: 'Record | null',
    example: `import { records } from '@townsquare/sdk'\nconst cam = await records.get('flock_camera', id)`,
    throws: ['permission_denied', 'not_found', 'unavailable'],
  },
  {
    method: 'records.create',
    signature: 'records.create(type: string, data: object): Promise<Record>',
    summary: 'Add a record to the town.',
    description:
      'Requires the type in `permissions.write` **and** the acting user to be a verified resident, ' +
      'which the platform enforces. Do not check for that yourself, just handle `not_verified`. ' +
      'Attribution to both you and the acting creation is attached automatically and cannot be ' +
      'set or forged from here.',
    requires: { kind: 'recordWrite', typeArg: 0 },
    params: z.tuple([z.string(), z.record(z.unknown())]),
    returns: 'the created Record, with id and version',
    example: `import { records } from '@townsquare/sdk'\nawait records.create('flock_camera', { lat, lng, note })`,
    throws: ['permission_denied', 'not_verified', 'invalid_record', 'rate_limited', 'too_large'],
  },
  {
    method: 'records.update',
    signature: 'records.update(type: string, id: string, patch: object): Promise<Record>',
    summary: 'Change an existing record.',
    description:
      'Any verified resident may update any record of a type you declare: town records are a wiki, ' +
      'not per-user rows. Nothing is destroyed, since every update writes a new version and the old ' +
      'ones stay readable through `records.history`. There is deliberately no delete.',
    requires: { kind: 'recordWrite', typeArg: 0 },
    params: z.tuple([z.string(), z.string(), z.record(z.unknown())]),
    returns: 'the updated Record, at its new version',
    example: `import { records } from '@townsquare/sdk'\nawait records.update('flock_camera', id, { note: 'removed' })`,
    throws: ['permission_denied', 'not_verified', 'not_found', 'conflict', 'invalid_record'],
  },
  {
    method: 'records.history',
    signature: 'records.history(type: string, id: string): Promise<Version[]>',
    summary: 'Every version of a record, oldest first.',
    description:
      'Each entry carries its data, who wrote it, which creation they used, and whether it was a ' +
      'revert. Showing history is a good idea for anything communally edited: it is what makes a ' +
      'wiki feel accountable rather than lawless.',
    requires: { kind: 'recordRead', typeArg: 0 },
    params: z.tuple([z.string(), z.string()]),
    returns: 'Array<{ version, data, author, createdAt, revertedFrom? }>',
    example: `import { records } from '@townsquare/sdk'\nconst versions = await records.history('flock_camera', id)`,
    throws: ['permission_denied', 'not_found'],
  },

  // ── storage ───────────────────────────────────────────────────────────────
  {
    method: 'storage.get',
    signature: 'storage.get(key: string): Promise<unknown>',
    summary: 'Read this user’s private state for your app.',
    description:
      'Scoped to your creation and the signed-in user. Not shared, not readable by other ' +
      'creations, and not a database. Returns undefined when unset. Requires ' +
      '`permissions.storage: true`.',
    requires: { kind: 'storage' },
    params: z.string().min(1).max(128),
    returns: 'the stored value, or undefined',
    example: `import { storage } from '@townsquare/sdk'\nconst filters = await storage.get('filters')`,
    throws: ['permission_denied', 'unauthenticated'],
  },
  {
    method: 'storage.set',
    signature: 'storage.set(key: string, value: unknown): Promise<void>',
    summary: 'Save this user’s private state for your app.',
    description:
      'JSON-serializable values only, 64KB total per user across all your keys. This is for ' +
      'preferences and view state. Anything the town should see belongs in `records`, where it is ' +
      'versioned, attributed and reusable by other creations.',
    requires: { kind: 'storage' },
    params: z.tuple([z.string().min(1).max(128), z.unknown()]),
    returns: 'nothing',
    example: `import { storage } from '@townsquare/sdk'\nawait storage.set('filters', { showInactive: false })`,
    throws: ['permission_denied', 'unauthenticated', 'too_large'],
  },
])

/** Fast lookup for the host bridge. A Map, so `__proto__` resolves to nothing. */
export const METHOD_MAP: ReadonlyMap<string, Readonly<MethodDef>> = new Map(
  METHODS.map((m) => [m.method, m]),
)

/**
 * Fail loudly at import time rather than shipping a half-described contract.
 * Called by the generator and asserted in tests.
 */
export function assertMethodTable(): void {
  const seen = new Set<string>()
  for (const m of METHODS) {
    if (seen.has(m.method)) throw new Error(`duplicate method: ${m.method}`)
    seen.add(m.method)
    if (m.description.length < 80) {
      throw new Error(`${m.method}: description is too thin to be useful to a model`)
    }
    if (!m.example.includes('@townsquare/sdk')) {
      throw new Error(`${m.method}: example must show the import`)
    }
  }
}
