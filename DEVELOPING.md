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

The sandbox process serves untrusted code from origins whose contents we do not
control. It has no route that reads a user and no dependency that could grow
one. That is why the read API is a separate service even in development: a
creation's CSP has no `connect-src` entry for the API, so the bridge is the only
door, and the shell is the only thing holding the key.

## Adding an example creation

Drop a directory in `apps/sandbox/examples/`. It needs a `townsquare.json`, the
entry document it names, and a square icon. It is loaded through the same
validator a resident's upload hits, so if it would be rejected in production it
fails loudly at startup rather than working only here.

## Tests

```bash
pnpm test        # 291 tests
pnpm typecheck
```

`packages/host/src/protocol.test.ts` is the one worth reading first: it runs the
real guest SDK against the real host bridge over an actual `MessageChannel`, so
it covers the half of the protocol that neither side's own unit tests can.

**Not yet written: the Playwright boundary suite.** Everything about the iframe
that needs a real browser — the origin boundary itself, `window.parent` throwing
`SecurityError`, CSP actually blocking an image beacon, `eval` actually throwing
— is currently argued for by construction and by header assertions, not
demonstrated. That suite is the highest-value thing left in the repo and it
belongs before any of this is pointed at residents.
