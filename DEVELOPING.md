---
type: note
title: Running Town Square locally
status: active
updated: 2026-08-03
---

# Running it

Three processes, on three origins. The origins are the security model, so
development uses real ones rather than paths on one host.

```bash
pnpm install

pnpm dev:api        # read API      → http://localhost:3030/api
pnpm dev:sandbox    # bundles       → http://<origin-key>.tsq-apps.localhost:3031
pnpm dev:web        # the shell     → http://townsquare.localhost:5173
pnpm dev:mcp        # builder door  → http://localhost:8770/mcp
```

Open **http://townsquare.localhost:5173** — not `127.0.0.1:5173`. The name is
what makes the shell a different registrable domain from the bundle origins, and
therefore what makes every origin check in the code mean the same thing locally
as in production.

Chromium, Safari and Firefox all resolve any `*.localhost` name to 127.0.0.1
themselves, so this needs no `/etc/hosts` entry and no certificate. The servers
bind to loopback and answer to the names; the OS resolver is never involved.

## What you should see

The gallery lists the examples in `apps/sandbox/examples/`. Opening one shows
the trust page generated from its manifest, and opening *that* mounts the
creation in a sandboxed iframe, which handshakes over `postMessage`, gets a
`MessagePort`, and reads the real Russellville business directory through the
bridge.

The example ships no build output and no `node_modules`. `import { town } from
'@townsquare/sdk'` resolves because the sandbox splices an import map into the
entry document at serve time.

## Why three processes

| Process | Holds | Must never hold |
|---|---|---|
| `apps/api` | the session, the database, act tokens | — |
| `apps/sandbox` | nothing | any cookie parser, session, or auth plugin |
| `apps/web` | the shell, the bridge | a creation's code |
| `apps/mcp` | bearer tokens, drafts | a cookie parser or any session |

The sandbox process serves untrusted code from origins whose contents we do not
control. It has no route that reads a user and no dependency that could grow
one. That is why the read API is a separate service even in development: a
creation's CSP has no `connect-src` entry for the API, so the bridge is the only
door, and the shell is the only thing holding the key.

## Signing in locally

There is no mail server in development. `pnpm dev:api` prints every sign-in
link to its terminal and hands the same link back in the response, which the
sign-in screen shows in a dashed box. Click either one.

That echo is refused the moment `SHELL_ORIGIN` is https, because a returned
sign-in link is a complete account takeover for anyone who can guess an email.

```bash
# start the town with a verified resident already in it
TOWNSQUARE_SEED_COHORT='tswic:tal@example.com:admin' pnpm dev:api
```

Vouching is a closure — only a verified resident can vouch — so a fresh town
has nobody who can let anyone else in. `TOWNSQUARE_SEED_COHORT` is how the
first residents exist: `handle:email` pairs, comma or newline separated, with
an optional `:admin` or `:moderator`. Re-running is safe; it promotes an
existing account rather than creating a second one.

Identity is held in memory for now, alongside the example creations, so
restarting the API signs everyone out.

## What a creation can learn about you

`user.current()` returns `{ handle, verified }` or `null`, and that is the
entire identity surface. No email, no real name, no user id, no session token,
and no permission level that grants any of them.

The path is worth following once in the code, because it is the shape every
later capability reuses:

1. the shell mints an **act token** — `POST /api/creations/:slug/act`, with the
   session cookie. The token names one user, one creation, one approved
   version, and the exact grants that version was approved with. It lives
   fifteen minutes.
2. the host holds it in a **closure variable** (`apps/web/src/actToken.ts`) —
   not React state, not a global, not storage.
3. `user.current()` crosses the port, and the host calls `GET /api/bridge/me`
   with `Authorization: Bearer <act>` and **`credentials: 'omit'`**.
4. the API projects `{ handle, verified }` **server side**, so the shell never
   holds an email in a shape it could forward into a frame.

The guest never sees a token. Even if it somehow did, it would hold what that
creation was already approved to do, as that user, for a quarter of an hour.
It is never an account credential.

## Private storage

`storage.get(key)` and `storage.set(key, value)` are scratch space for one
creation and one resident. Not a database, and the distinction is the design:
this is where an app keeps *your* filters and *your* dismissed banner.
Anything the town should see belongs in `records`, where it is versioned,
attributed, and readable by the next creation someone builds.

| Limit | Value | Why |
|---|---|---|
| Total | 64 KB per (creation, user) | The number already in the SDK docs a builder reads |
| Keys | 64 per (creation, user) | Bounds rows, which bytes alone do not |
| Key | ≤128 chars, `[A-Za-z0-9._:-]` | An identifier, not a path |

The quota is charged per creation *and* per user, so one app filling its
allowance can never affect another app or another resident.

`set(key, undefined)` removes the key. That is the only way back under quota,
and the SDK surface is deliberately just `get` and `set`, so it shares the
verb rather than growing a third method for the one case that most needs to
work.

**The scope comes from the act token, never from a parameter.** There is no
argument a creation could pass that would address another resident's row or
another app's, which is what makes cross-tenant access structurally impossible
rather than carefully avoided. The example creation exercises the whole path:
open it signed in and pin a favourite.

## The builder door

`pnpm dev:mcp` is how a resident builds a creation with their own AI tool. It
speaks MCP over HTTP, authenticates a `ts_live_` bearer token, and exposes
seventeen tools. The loop an agent follows is:

```
whoami → get_sdk_docs → list_record_types → scaffold
       → begin_upload → POST the files → validate → preview → submit
```

Two things about it are load-bearing rather than convenient.

**Bundles never pass through the model's context.** `begin_upload` takes an
*inventory* — every path with its sha256 and byte length — and hands back a
one-time ticket plus a ready-to-run shell loop. The agent POSTs the raw bytes,
and the server rejects an undeclared path, a wrong length, or content that does
not hash to what was declared. Asking a language model to reproduce 150KB of
vendored Leaflet byte-exact is asking it to be a lossy file-copy utility on the
one class of file where lossiness is a security bug. The inventory is also what
makes "everything is vendored" enforceable: the set of files is fixed before a
byte moves.

**`validate` and `submit` run the same function.** Not an equivalent one. If
the authoring-time check were advisory and the queue's were real, builders would
learn that the advice is optional and Tal would review the difference.

`preview` publishes into the same `MemoryBundleStore` the sandbox serves from,
with a CSP compiled by the same compiler and frozen the same way, on a `p-`
prefixed origin key that can never collide with an approved creation's. What
works in preview works after approval, and what preview blocks would have been
blocked in production.

### Signing in to it

Tokens are minted by the shell, at `POST /api/connect/tokens`, which needs a
session cookie. The MCP service has no cookie parser and no session-reading
route, exactly like the sandbox: a session can mint an MCP token, and an MCP
token can never reach anything that reads a session.

In development the three processes hold separate memory stores, so a token
minted through the API is not one `pnpm dev:mcp` will accept. That process prints
its own instead, the same way `pnpm dev:api` prints sign-in links:

```bash
TOWNSQUARE_SEED_COHORT='tswic:tal@example.com:admin' pnpm dev:mcp
# → claude mcp add --transport http townsquare http://localhost:8770/mcp \
#       --header "Authorization: Bearer ts_live_…"
```

Both echoes are gated on the same plain-http check and neither exists once
`SHELL_ORIGIN` is https. In production all three read one database and the only
mint is `/settings/connect`.

### What refuses to start

The docs artifact is a fail-closed boot dependency. If `packages/sdk`'s generated
docs have been hand-edited, or they describe methods this build does not have,
the process does not come up. This service's whole job is teaching an LLM the
SDK, and a docs/SDK skew silently writes an entire generation of creations
against a contract nobody implements — that is as dangerous as an unauthenticated
endpoint, so it gets the same treatment.

## Adding an example creation

Drop a directory in `apps/sandbox/examples/`. It needs a `townsquare.json`, the
entry document it names, and a square icon. It is loaded through the same
validator a resident's upload hits, so if it would be rejected in production it
fails loudly at startup rather than working only here.

## Tests

```bash
pnpm test        # 542 tests
pnpm typecheck
```

`packages/host/src/protocol.test.ts` is the one worth reading first: it runs the
real guest SDK against the real host bridge over an actual `MessageChannel`, so
it covers the half of the protocol that neither side's own unit tests can.

`packages/mcp/src/service.test.ts` is worth reading second: it drives the MCP
service over a real socket with the *real* MCP client, which is how it caught a
typographic ellipsis in an auth message turning every 401 into an uncaught
`ERR_INVALID_CHAR` and a hung socket. Nothing short of a real HTTP response
would have found that.

`apps/api/src/identityRoutes.test.ts` is the third: it drives the auth routes
over a real socket rather than calling the handler, because the properties that
matter there are HTTP properties — which routes read a cookie, what
`Set-Cookie` actually says, whether a bridge call authenticated by a session
would work. A handler called directly cannot be wrong about any of those.

```bash
pnpm test:e2e    # the Playwright boundary suite, three origins in Chromium
```

Everything about the iframe that needs a real browser lives there: the origin
boundary itself, `window.parent` throwing `SecurityError`, CSP actually
blocking an image beacon, `eval` actually throwing, a signed-in resident's
handle reaching the guest while every direct route to the credential behind it
is refused, and two residents of the same creation not seeing each other's
stored values.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request,
in two jobs split by cost:

| Job | Runs | Roughly |
|---|---|---|
| `checks` | typecheck, generated-docs drift, 542 unit tests | under a minute |
| `boundary` | the Playwright suite, three origins in Chromium | two to three minutes |

Neither is configured as a **required** status check, on purpose. This repo is
pushed to `main` directly, and a required check would block that. The signal is
there to be read.

The browser is cached on the resolved Playwright version, so bumping Playwright
fetches a matching Chromium rather than silently reusing an incompatible one.
When the boundary suite fails, the HTML report and traces are uploaded as an
artifact — open a trace with `pnpm exec playwright show-trace <file>` to step
through what the browser actually did.
