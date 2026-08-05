---
type: note
title: Running Town Square locally
status: active
updated: 2026-08-05
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

**Today** — the resident home, `design/hifi` section 4a. Under it, **Browse**
reaches the gallery of examples in `apps/sandbox/examples/`. Opening one shows
the trust page generated from its manifest, and opening *that* mounts the
creation in a sandboxed iframe, which handshakes over `postMessage`, gets a
`MessagePort`, and reads the real Russellville business directory through the
bridge.

The example ships no build output and no `node_modules`. `import { town } from
'@townsquare/sdk'` resolves because the sandbox splices an import map into the
entry document at serve time.

## Today

`GET /api/today`, one request, no cookie. Six sections from six unrelated
sources, assembled server side by `apps/api/src/today.ts` — a pure function
from the town's raw items to exactly what the screen renders, so the rules that
decide what a resident sees first are testable without a browser or a live
scrape.

One rule runs through the whole thing: **a section with no real data does not
appear.** Every field traces to something ingested or something a neighbour
actually built.

| Section | Comes from |
|---|---|
| Top of town | newest published story across the news sources |
| More from town | the next four, with the photo the source published where there is one |
| Happening today | events on the town's calendar day that have not finished |
| From your neighbors | creations, featured one at a time |
| From city hall | an active notice, plus what government sources have scheduled next |
| In the directory | `businesses.ts`, rotated by the day, open/closed computed live |

**The hero reaches up to 36 hours back for a story with a photo.** The lead is
the only slot on this screen with real visual weight, and a hero with no art is
a headline in a large font — it reads as a page that could not fill itself.
Roughly half the town's stories carry an image and none of the university's do,
so leading strictly by recency gives a flat screen most mornings. Whatever the
hero passes over becomes the first row of More from town, so the preference
costs a newer story the big slot and never the screen.

**When nothing in town has art, the lead becomes a typographic hero** — a
panel, a rule in the brand colour, a larger headline, and the summary doing the
work the photo would have. Not the photo layout with a hole in it.

**More from town is ordered by recency, not by which stories have art.** The
thumbnail is an enhancement of a row that reads the same without one.

**A story's timestamp is a clock time only if it ran today.** Otherwise it is
"Yesterday", a weekday, or a date. `4:51pm` on a story filed yesterday
afternoon reads, at ten the next morning, as something that has not happened
yet — which is the one impression this screen cannot afford.

**Directory cards say whether a business is open right now**, computed from the
hours string against the town's clock, rather than printing a range the reader
has to compare against their own watch. `openState` returns null on anything it
cannot parse honestly and the card falls back to the range, then to the
category. Two shapes in that data need care and both are tested: `12 to 5 PM`
omits the opening meridiem and means noon, and `9 AM to 12 AM` closes at
midnight rather than opening and closing in the same minute. 82 listings also
carry a split shift as a second clause with no weekday of its own.

Three things about it are decisions rather than details.

**"Today" is a question about America/Chicago**, never about whatever timezone
the server booted in, so every date goes through `Intl` with the town's zone.
`townDay` is the whole of that rule and it is one function.

**A failed scrape serves the last good screen, not an error.** This is where
someone checks whether the council meets tonight; a stale answer is worth a
great deal and a blank page is worth nothing. The staleness is visible, because
the footer carries the time the screen was assembled.

**The payload is cached for a minute and the in-flight promise is shared.** A
cold build takes as long as the slowest scraper, and without sharing it a dozen
residents opening the app at 7am would each start their own fetch of every
source in town.

### What is deliberately not on the screen

The hi-fi shows two things that have no source yet, and both are **omitted
rather than mocked**. Inventing a plausible boil-water notice to fill a card is
the one failure mode a town information service cannot come back from.

| Missing | Needs |
|---|---|
| The weather chip | a weather source; there is no ingest for one |
| The neighbour stream, and the composer under it | `design/hifi` t11, and a posts table |

Two smaller deviations, both intentional:

- **Icons are drawn in `apps/web/src/Icon.tsx`, not Material Symbols.** The
  family is a ~3.5MB variable font, and neither way of getting it is
  acceptable: a Google Fonts link puts a third party in the load path of the
  town's home screen and needs a `font-src` hole `packages/tokens` deliberately
  does not have. Subsetting it needs a build step that does not exist yet.
  When it does, delete that file.
- **Nearby and Yours are rendered disabled**, not omitted. They are `design/hifi`
  t5. The shape of the app is part of what the home screen communicates, and a
  button that says what it will be beats one that silently does nothing.

### Attribution

A creation's author is **platform-assigned at approval**, never read from a
manifest — `packages/manifest` rejects an `author` key outright as an
impersonation attempt. Nothing in development has been through the review
queue, so the featured card reads "made by a neighbor" and shows no initials.
It does *not* fall back to initials of the creation's own name: "The Burrito
Index" becoming a "TI" avatar reads as a person who does not exist.

## Why three processes

| Process | Holds | Must never hold |
|---|---|---|
| `apps/api` | the session, the database, act tokens | — |
| `apps/sandbox` | nothing | any cookie parser, session, or auth plugin |
| `apps/web` | the shell, the bridge | a creation's code |
| `apps/mcp` | bearer tokens, drafts | a cookie parser or any session |

The queue itself lives in `packages/review`, reachable from both sides: the MCP
can submit into it and read back what it submitted, and only the API can decide.
The builder door is structurally incapable of approving its own work.

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

## The review queue

Nothing a resident builds reaches the town without a human reading it. `submit`
puts a version in the queue; a moderator opens **Review queue** in the shell,
reads the source, and approves, rejects, or asks for changes.

```
GET  /api/review/queue
GET  /api/review/submissions/:id
POST /api/review/submissions/:id/decide   { decision, note }
```

Session-authenticated and gated on `role in (moderator, admin)`. An ordinary
resident gets a **404**, not a 403: how much is pending and whose work is in it
are not things the town gets to learn by asking. The role check that actually
decides lives in `Review.decide`, so a second door onto the queue later inherits
it rather than re-implementing it.

Four properties are load-bearing.

**Approval is of one exact version.** The submission carries its own bytes, and
the digest is re-checked at the moment of approval. A draft is scratch space its
owner keeps editing, so a queue that merely pointed at one would let a builder
swap the contents between the reviewer reading them and the approval landing.

**The town is re-validated at approval time.** A submission clean on Tuesday can
be invalid on Thursday, because someone else defined a conflicting record type
in between. When that happens the submission is marked `changes_requested` with
the reason, rather than published on a stale pass.

**Updates are reviewed too, and the live version keeps serving until its
replacement is approved.** This is the whole defence against the browser-extension
play: ship something innocuous, get approved, build an audience, then push the
real payload.

**The reviewer sees a diff, not a permissions block.** An update renders as
"**adds** network: collect.example.com", and the queue row carries an *asks for
more* flag. A reviewer re-reading a full block for the fifth time will not catch
one new line; that is what the diff exists to make impossible to miss.

Approving allocates the creation on first publish — a uuid, an origin key
derived from it, and a slug (suffixed `-2` if the proposed one is taken, rather
than bouncing the submission). Every later version keeps the **same origin key**,
which is the storage partition: a new one per update would silently empty every
resident's saved state. Superseded versions are kept, never deleted.

To try it locally, seed yourself as an admin and the **Review queue** button
appears in the shell header:

```bash
TOWNSQUARE_SEED_COHORT='tswic:tal@example.com:admin' pnpm dev:api
```

In development each process holds its own memory copy, so a submission made
through `pnpm dev:mcp` is not in the API's queue. In production all three read
one database.

## Reporting, and acting on something already live

The review queue decides whether code may run at all. This is the other half:
what happens once it is running and a resident says something about it.

```
POST /api/reports                              verified resident
GET  /api/review/reports                       moderator
POST /api/review/reports/:id/resolve           moderator
GET  /api/review/creations                     moderator
GET  /api/review/creations/:id                 moderator
POST /api/review/creations/:id/moderate        moderator
```

A resident's entire surface is the first line. There is no way to read anyone
else's report, no count of how many a creation has, and no notification of what
came of one — all three would turn a report into a public signal, and a public
signal is a thing worth manufacturing. The moderator routes sit behind the same
gate as the review queue and answer an ordinary resident **404**: who reported
what about which neighbour is the most sensitive thing this system holds.

### Reporting is built to be hard to weaponise

The moderation stance is light on purpose. Town Square is neutral substrate, it
follows the law and stops there, and the committee is one person with a day job.
So the design starts from a fact most report systems will not say out loud:
**most reports are dismissed, and that is not a failure.**

| Rule | Why |
|---|---|
| Verified residents only | A report is a claim by someone a moderator can go and talk to |
| One open report per resident per target | The Report button is not a "send this again" button |
| 10 per resident per rolling day | Stops one account filing against the whole gallery in an afternoon |
| A closed set of reasons | Free text alone is untriageable |

The duplicate rule is enforced in the memory store the way `reports_open_dup_uq`
enforces it in Postgres — a partial unique index, so a resident *can* file again
once the first one is resolved. That is a new complaint about a new situation,
not a second copy of the old one. Filing a duplicate is answered `200` with
`duplicate: true` and the original report, rather than a success message that
quietly did nothing.

Verification is read from the session's user on every call, so a vouch granted a
minute ago counts and a revoked one stops counting immediately.

### Three actions, and the differences between them are the design

**hide** takes a creation out of circulation. Reversible, unremarkable, and the
right first move for almost everything. **block** is the one that means
something, for what the law forces. Both stop the sandbox serving and both get
the explainer page in `packages/sandbox/src/serve.ts` — the blocked one says a
moderator did it, because a blocked creation showing a blank frame reads as our
bug rather than our decision. Neither deletes anything: a dead creation is still
a record of what someone made.

**revert** puts an earlier approved version back, and it is a **forward**
operation. The old bytes are published again under a *new* version row that
records where they came from (`reverted_from_version_id`), labelled with semver
build metadata — `1.2.0+revert.1`, which compares equal to `1.2.0` so a
builder's next release still sorts above it. The version being replaced stays in
the history as `superseded`. Nothing is rewound and nothing is destroyed, and
that is precisely what makes moderating cheap enough to do promptly: every call
made here is undone by one more forward write.

Two refusals in revert are load-bearing. A version that was never approved can
never be reverted to, so a rejected submission cannot be laundered into
production by a moderator picking it off a list. And the bytes are re-hashed
against the digest on the version row, exactly as they are at approval, so what
goes back live is what a human read.

The origin key never moves — through a hide, a block, a revert, or all three. It
is the storage partition, and a new one would silently empty every resident's
saved state.

### Two smaller decisions worth knowing

**An action drains the reports it answered.** Hiding, blocking or reverting
closes every open report against that creation, as `upheld` or `reverted`. A
report queue nobody drains is worse than no queue because it implies a promise,
and the usual reason one rots is that acting and closing are separate chores.
`restore` closes nothing: putting something back is not an answer to the person
who asked for it to be looked at.

**Restricting and restoring write in opposite orders.** Hiding or blocking flips
the serving path first and the row second; restoring writes the row first and the
serving path last. Both directions fail closed, which is the only property worth
having when the failure is silent.

Every action needs a reason, including a restore, and it lands in an append-only
`moderation_actions` row with the moderator's name on it. "Who blocked this,
when, and what did they say" is what makes a committee-held role accountable to
the residents it acts on.

To try it locally, seed yourself as an admin and open **Review queue** in the
shell: it now has three tabs — Submissions, Reports, and Live creations.

```bash
TOWNSQUARE_SEED_COHORT='tswic:tal@example.com:admin' pnpm dev:api
```

The Report button in the chrome under a running creation works against the
examples, because reporting only needs a creation to exist. **Live creations**
is empty until something is actually approved through the queue, since the
examples never went through it — the same development seam as the queue itself,
and it closes when all three processes read one database.

## Adding an example creation

Drop a directory in `apps/sandbox/examples/`. It needs a `townsquare.json`, the
entry document it names, and a square icon. It is loaded through the same
validator a resident's upload hits, so if it would be rejected in production it
fails loudly at startup rather than working only here.

## Tests

```bash
pnpm test        # 651 tests
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
| `checks` | typecheck, generated-docs drift, 651 unit tests | under a minute |
| `boundary` | the Playwright suite, three origins in Chromium | two to three minutes |

Neither is configured as a **required** status check, on purpose. This repo is
pushed to `main` directly, and a required check would block that. The signal is
there to be read.

The browser is cached on the resolved Playwright version, so bumping Playwright
fetches a matching Chromium rather than silently reusing an incompatible one.
When the boundary suite fails, the HTML report and traces are uploaded as an
artifact — open a trace with `pnpm exec playwright show-trace <file>` to step
through what the browser actually did.
