# Building a Town Square creation

> Generated from the SDK method table. SDK 1, manifest 1.

A Town Square creation is a sandboxed static mini-app that runs inside Town Square, written against `@townsquare/sdk`. It is a folder containing `townsquare.json`, an entry HTML file, an icon, and whatever else you vendor. There is no build step and no server: your app runs in a resident's browser and talks to the town through the SDK.

## Four rules no tool can enforce for you

**1. Everything is vendored.** There is no npm, no CDN, and no bare package
import at runtime. Every byte your app loads must be a file inside your bundle.
A `<script src="https://unpkg.com/...">` is a rejection, not a style note. The
platform serves your creation with `script-src 'self'`, so a remote script will
not execute even if review missed it.

**2. Every capability is declared.** The `permissions` block in your manifest is
default-deny and the host enforces it, so an undeclared read, write, storage use
or network host fails with `permission_denied` no matter what your code says.
Over-declaring is also a problem: a reviewer reading a permissions block full of
unused capabilities cannot tell signal from noise. Declare exactly what you use.

**3. The signed-out visitor is the common case.** `user.current()` returns null
for anonymous visitors, and writes throw `not_verified` for signed-in but
unverified ones. An app that assumes a verified user is broken for most of the
town. Handle both.

**4. Never minify.** Source is what gets reviewed and what other residents fork.
Ship readable code with real names.

## Errors

Everything async throws `TownSquareError` with a stable `code`. These are
answers, not retries: change what you are doing rather than trying again. Only
`rate_limited` and `unavailable` are worth a retry.

- `not_verified`
- `unauthenticated`
- `permission_denied`
- `rate_limited`
- `not_found`
- `invalid_record`
- `invalid_request`
- `conflict`
- `too_large`
- `unavailable`

## Limits

- Storage: 65536 bytes per user, across all your keys
- Request timeout: 15000ms
- Concurrent in-flight calls: 32
- Call `app.ready()` within 10000ms or the host shows a failed state
- Reported heights are clamped to 200-4000px

## Reference

### `app`

#### app.ready(): void

Tell Town Square the app has rendered.

Call this once, as soon as your first paint is done. Until you call it the host shows a loading skeleton, and if you never call it within 10 seconds the host replaces your frame with a did-not-load state. Calling it late is the single most common reason a working app looks broken, so call it even if you are still fetching data in the background.

**Requires:** nothing  
**Returns:** nothing  
**Throws:** nothing

```js
import { app } from '@townsquare/sdk'
document.body.innerHTML = '<h1>Hello</h1>'
app.ready()
```

#### app.setHeight(px: number): void

Ask the host to resize your frame.

Only meaningful when your manifest sets `display.height` to a number. Under the default "auto" the host measures you and this call is a harmless no-op, so it is safe to call unconditionally. Values are clamped to 200-4000px.

**Requires:** nothing  
**Returns:** nothing  
**Throws:** nothing

```js
import { app } from '@townsquare/sdk'
app.setHeight(720)
```

#### app.setTitle(text: string): void

Set the line Town Square shows above your app.

Up to 80 characters of plain text, rendered as a text node so markup will not work. Use it for live state such as "12 cameras mapped", not for your app name, which the host already shows from your manifest.

**Requires:** nothing  
**Returns:** nothing  
**Throws:** nothing

```js
import { app } from '@townsquare/sdk'
app.setTitle('12 cameras mapped')
```

#### app.openLink(url: string): Promise<void>

Open a website, phone number or email address for the resident.

**You usually do not need this: ordinary links already work.** The SDK catches clicks on `<a href>` links that leave your app, including `target="_blank"`, `tel:` and `mailto:`, and calls this for you; it also routes `window.open`. Your frame cannot open pages itself, so Town Square shows the resident where the link goes and opens it only if they agree. Call it directly only from a click or tap handler: a call that is not the result of the resident pressing something is refused, and so is a second link while the first dialog is still open. Allowed: `https:`, `http:` (shown as not private), `tel:` and `mailto:` with one address and an optional subject and body. Refused: `javascript:`, `data:`, IP addresses, local network names, links with a username or password, and `cc`/`bcc`. The promise resolves once the dialog is shown, not when the resident answers, and you are never told whether they went.

**Requires:** nothing  
**Returns:** nothing  
**Throws:** `invalid_request`, `rate_limited`, `unavailable`

```js
import { app } from '@townsquare/sdk'
document.querySelector('#call').addEventListener('click', () => app.openLink('tel:+14795551212'))
```

### `town`

#### town.info(): Promise<TownInfo>

Which town you are running in.

Returns the town id, display name and IANA timezone. Use the timezone for anything date-related: a creation runs in residents’ browsers all over, and "today" must mean today in the town, not on the visitor's device.

**Requires:** nothing  
**Returns:** { id, name, timezone }  
**Throws:** `unavailable`

```js
import { town } from '@townsquare/sdk'
const { name, timezone } = await town.info()
```

#### town.thisWeek(): Promise<ThisWeek>

What is happening in town, already bucketed.

Returns `{ today, weekend, comingUp, notices }`. Buckets are mutually exclusive and events are sorted by start time, computed in the town timezone. Prefer this over filtering `town.items` yourself; the bucketing rules are subtle and shared with the rest of the app.

**Requires:** nothing  
**Returns:** { today[], weekend[], comingUp[], notices[] }  
**Throws:** `unavailable`

```js
import { town } from '@townsquare/sdk'
const { today } = await town.thisWeek()
```

#### town.items(opts?): Promise<{ items, nextCursor }>

Ingested town content: events, notices, stories.

Cursor-paginated. **No permission declaration is needed for anything under `town.*`** because this is public town information that anyone can read on the website anyway. Pass `since` when you sync periodically so you are not refetching the whole town every time.

**Requires:** nothing  
**Returns:** { items: Item[], nextCursor?: string }  
**Throws:** `invalid_request`, `unavailable`

```js
import { town } from '@townsquare/sdk'
const { items } = await town.items({ type: 'event', limit: 50 })
```

#### town.item(id: string): Promise<Item | null>

One ingested item by id.

Returns null rather than throwing when the item does not exist or has gone stale.

**Requires:** nothing  
**Returns:** Item | null  
**Throws:** `invalid_request`, `unavailable`

```js
import { town } from '@townsquare/sdk'
const item = await town.item(id)
```

#### town.businesses(opts?): Promise<{ items, nextCursor }>

The town business directory.

Roughly 700 real local listings with name, category, address, phone, website, hours and real coordinates. **Read this instead of building your own list.** A burrito ranking or a shop-local game should start from the town directory, not from a hardcoded array that goes stale the week you ship it.

**Requires:** nothing  
**Returns:** { items: Business[], nextCursor?: string }  
**Throws:** `invalid_request`, `unavailable`

```js
import { town } from '@townsquare/sdk'
const { items } = await town.businesses({ tag: 'restaurant' })
```

### `user`

#### user.current(): Promise<User | null>

Who is looking at your app right now.

Returns `{ handle, verified }` or **null when nobody is signed in, which is the common case**. Most visitors to a town square are not logged in, so an app that assumes a user is broken for most of the town. This is the entire identity surface: there is no email, no real name, no location and no session token, and no permission level that grants them. Requires `permissions.identity: "handle"`.

**Requires:** `permissions.identity: "handle"`  
**Returns:** { handle: string, verified: boolean } | null  
**Throws:** `permission_denied`

```js
import { user } from '@townsquare/sdk'
const me = await user.current()
if (me?.verified) { /* can contribute */ }
```

### `records`

#### records.list(type: string, opts?): Promise<{ items, nextCursor }>

Read shared town records of one type.

The type must be a **literal string** and must appear in `permissions.read`. Records are town-wide: if another creation already defined `flock_camera`, read theirs rather than inventing a parallel type for the same fact. That reuse is the entire point of records.

**Requires:** the record type in `permissions.read`  
**Returns:** { items: Record[], nextCursor?: string }  
**Throws:** `permission_denied`, `invalid_request`, `unavailable`

```js
import { records } from '@townsquare/sdk'
const { items } = await records.list('flock_camera', { limit: 100 })
```

#### records.get(type: string, id: string): Promise<Record | null>

One record, by type and id.

The type is required even though the id alone would identify the row. Permission is granted per type, so passing it keeps the check a simple lookup; without it the host would have to resolve the id first, which would leak whether records exist under types you cannot read. A type and id that do not match is simply `not_found`.

**Requires:** the record type in `permissions.read`  
**Returns:** Record | null  
**Throws:** `permission_denied`, `not_found`, `unavailable`

```js
import { records } from '@townsquare/sdk'
const cam = await records.get('flock_camera', id)
```

#### records.create(type: string, data: object): Promise<Record>

Add a record to the town.

Requires the type in `permissions.write` **and** the acting user to be a verified resident, which the platform enforces. Do not check for that yourself, just handle `not_verified`. Attribution to both you and the acting creation is attached automatically and cannot be set or forged from here.

**Requires:** the record type in `permissions.write`, and a verified resident  
**Returns:** the created Record, with id and version  
**Throws:** `permission_denied`, `not_verified`, `invalid_record`, `rate_limited`, `too_large`

```js
import { records } from '@townsquare/sdk'
await records.create('flock_camera', { lat, lng, note })
```

#### records.update(type: string, id: string, patch: object): Promise<Record>

Change an existing record.

Any verified resident may update any record of a type you declare: town records are a wiki, not per-user rows. Nothing is destroyed, since every update writes a new version and the old ones stay readable through `records.history`. There is deliberately no delete.

**Requires:** the record type in `permissions.write`, and a verified resident  
**Returns:** the updated Record, at its new version  
**Throws:** `permission_denied`, `not_verified`, `not_found`, `conflict`, `invalid_record`

```js
import { records } from '@townsquare/sdk'
await records.update('flock_camera', id, { note: 'removed' })
```

#### records.history(type: string, id: string): Promise<Version[]>

Every version of a record, oldest first.

Each entry carries its data, who wrote it, which creation they used, and whether it was a revert. Showing history is a good idea for anything communally edited: it is what makes a wiki feel accountable rather than lawless.

**Requires:** the record type in `permissions.read`  
**Returns:** Array<{ version, data, author, createdAt, revertedFrom? }>  
**Throws:** `permission_denied`, `not_found`

```js
import { records } from '@townsquare/sdk'
const versions = await records.history('flock_camera', id)
```

### `storage`

#### storage.get(key: string): Promise<unknown>

Read this user’s private state for your app.

Scoped to your creation and the signed-in user. Not shared, not readable by other creations, and not a database. Returns undefined when unset. Requires `permissions.storage: true`.

**Requires:** `permissions.storage: true`  
**Returns:** the stored value, or undefined  
**Throws:** `permission_denied`, `unauthenticated`

```js
import { storage } from '@townsquare/sdk'
const filters = await storage.get('filters')
```

#### storage.set(key: string, value: unknown): Promise<void>

Save this user’s private state for your app.

JSON-serializable values only, 64KB total per user across all your keys. This is for preferences and view state. Anything the town should see belongs in `records`, where it is versioned, attributed and reusable by other creations.

**Requires:** `permissions.storage: true`  
**Returns:** nothing  
**Throws:** `permission_denied`, `unauthenticated`, `too_large`

```js
import { storage } from '@townsquare/sdk'
await storage.set('filters', { showInactive: false })
```
