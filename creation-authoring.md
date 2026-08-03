---
type: brief
title: How residents actually author a creation, AI in-app and local power-user
status: draft
updated: 2026-08-03
---

# Authoring a creation

Two doors, one contract. Confirmed direction from Tal 2026-08-03: creations are
sandboxed mini-apps hosted inside Town Square, and residents should be able to
build them either with AI assistance in the app, or on their own machine with
real tooling.

## The structural idea: one contract, two doors

Both routes must produce the exact same artifact: a static bundle plus a
manifest, written against the same SDK. If the AI builder emits something
special that the local route cannot produce or edit, the whole thing forks into
two incompatible ecosystems and the open source story dies.

So the SDK is not one of the pieces. It is **the** piece. Everything else is a
door onto it.

```
                 ┌─ Door A: in-app AI builder ─┐
  a resident ────┤                              ├──> bundle + manifest ──> sandbox
                 └─ Door B: local dev + CLI ────┘         (one SDK)
```

## The SDK has to be authorable by a language model

This is a genuine design constraint and it is unusual enough to state plainly.
The primary author of most creations will be an LLM, either inside our builder
or in someone's Claude Code session. That means the SDK should be:

- **Small.** A handful of functions, not a surface area. Every extra concept is
  another thing a model gets subtly wrong.
- **Stable.** Breaking changes strand every previously generated app, and no
  resident is going to maintain theirs.
- **Typed, with real examples.** Models follow examples far more reliably than
  prose.
- **Hard to misuse.** If a wrong call is possible, it will be generated. Prefer
  narrow functions over one flexible one.

Rough shape:

```js
import { town, user, records } from '@townsquare/sdk'

await town.items({ type: 'event', since: '2026-08-01' })
await town.businesses({ tag: 'restaurant' })
const me = await user.current()          // null if signed out
await records.create('flock_camera', { lat, lng, note })  // later, attributed
```

Note that `records.create` carries dual attribution automatically. The builder
never handles identity plumbing, which is exactly why it stays hard to get wrong.

## Door A: build it in the app

The flow, roughly:

1. Resident describes what they want in plain language.
2. We generate a single-page bundle against the SDK.
3. It renders immediately in the same sandbox it will live in, with real town
   data. **Preview is the real thing, not a mockup.**
4. They iterate by talking to it.
5. Publish, and it appears in the gallery.

Two things that make this work rather than merely demo well:

- **Ship a strong starter set of templates.** Map over town data, ranked list
  with voting, directory filter, event calendar view. Most community app ideas
  are one of maybe six shapes. Starting from a working shape beats starting from
  a blank prompt, for humans and models alike.
- **Feed the SDK docs to the model as context.** The same document that serves
  Door B. One source of truth, so the AI cannot drift from what power users see.

## Door B: build it at your computer

For people who want real tooling, with or without Claude Code:

- **A starter template repo.** Clone, `npm install`, working app in a minute.
- **A local dev server** that proxies the real Town Square API for the target
  town, so development happens against live data instead of fixtures.
- **`llms.txt` or `AGENTS.md` in the template.** A machine-readable description
  of the SDK and the manifest format, so Claude Code or any agent picks up the
  contract without being told. This is cheap and it is exactly the kind of thing
  that makes a platform pleasant to build against in 2026.
- **Publish by CLI**, `townsquare publish`, or by connecting a git repo.

Door B should be documented as a first-class path, not as an escape hatch. The
person who builds the Flock camera map is likely a Door B user, and they are the
most valuable early builder.

## Store the source, not just the bundle

Worth deciding deliberately: keep each creation's **source**, not only the built
output.

That unlocks **forking**. A resident sees the burrito map and wants a taco
version, or sees a broken app whose author moved away and wants to fix it. One
click to fork, edit, republish. This is the Glitch model, and it is how a small
community keeps a long tail of apps alive without any single maintainer.

It also matters for the open source story. A town adopting Town Square inherits
not just the platform but a library of real, readable community apps.

The catch: source visibility should probably be the default rather than
mandatory, since someone may have a reason to keep theirs closed. Default open,
allow closed, make the default obvious.

## Security model

Untrusted, largely machine-generated code is running in the app. The boundary
has to be real:

- Sandboxed iframe on a separate registrable domain, no access to the parent DOM
  or our session.
- All Town Square access through the SDK's `postMessage` bridge. The SDK is the
  only door, so it is the only thing to audit.
- **CSP default-deny with a declared, reviewed network allowlist.** An earlier
  draft of this section said the CSP should restrict network access to Town
  Square's own API. That was wrong and would have made a map impossible.
  `spec-manifest-and-sdk.md` has the authoritative rule and the exact directive
  mapping; that document wins on anything network or CSP related.
- Identity is never handed to the creation. It asks the bridge who the user is
  and gets back a handle, not a session token.
- Write-back inherits the existing model: versioned, dual-attributed,
  revertable. A misbehaving creation gets cut off without punishing its users.

## Decision: an MCP server instead of in-app AI, for now

Tal, 2026-08-03. Rather than paying to generate apps inside Town Square, publish
an **MCP server** that residents connect to their own AI tool. They bring their
own Claude, ChatGPT, or Claude Code session and the token cost is theirs.

This is a good call and it is cheap to build, because it is not a third door. It
is Door B with the friction removed. The MCP server is a thin wrapper over the
same SDK, docs, templates, and manifest that already have to exist.

Tools the server should expose:

| Tool | Purpose |
|---|---|
| `get_sdk_docs` | The contract, fed straight into the model's context |
| `list_templates` / `scaffold` | Start from one of the working shapes |
| `query_town_data` | Read real town data while building, not fixtures |
| `validate` | Check a bundle against the manifest and SDK contract before submitting |
| `preview` | Return a sandboxed preview URL of the current bundle |
| `submit` | Send it for review |

Auth is per resident, so everything built through it is attributed from the
first keystroke.

### The honest tradeoff

This shifts the AI cost onto the resident, which is exactly right for the early
builders. The person mapping Flock cameras already has an AI tool and will find
this delightful.

But it does narrow the promise. "Anyone in town can make an app" quietly becomes
"anyone with an AI subscription who knows what MCP is." Connecting an MCP server
is still not something a non-technical resident does casually, and the
non-technical majority is most of the town.

**Recommended sequencing:** ship MCP only. It costs nothing to run, it serves the
people most likely to build the first ten creations, and it defers the entire
in-app AI bill until there is evidence that non-technical residents are actually
blocked. If the gallery fills up and the only builders are the technical crowd,
that is the signal to build the in-app door. Not before.

## Decision: publish goes through admin review

Tal, 2026-08-03. A creation is submitted, not published directly. An admin
approves it before it appears.

### This is in tension with the light-touch stance, and that is worth naming

The moderation decision was explicitly "no heavy moderation burden." Reviewing
every submission is the definition of a burden, and AI authoring makes producing
submissions nearly free while reviewing them stays expensive. That asymmetry is
how review queues die.

It is still the right call at launch. Volume is low, the first creations set the
tone for everything after, and untrusted JavaScript genuinely warrants a human
look. But build it so the burden stays bounded:

- **Automate the first pass.** Manifest validity, SDK contract compliance, CSP
  conformance, bundle size limits, no obfuscated or minified-beyond-reading
  code. Most rejections should never reach a person.
- **Review source, not the built bundle.** Reviewing generated or minified
  output is security theater. This is another reason to store source.
- **Add a trusted-builder path early.** After a few approved creations, a
  resident publishes without review. This is how npm, app stores, and Wikipedia
  autoconfirmation all keep review load flat as the community grows. Without it,
  review cost scales linearly with success.

### The hole review must close: updates

**Approving the first version is not enough.** The classic attack, and browser
extension marketplaces get burned by it repeatedly, is to publish something
innocuous, get approved, build an audience, then push a malicious update.

So: **updates go through review too**, not just initial submission. Version the
bundle, keep the approved version live until a new one is approved, and never
let an unreviewed update reach residents. If that sounds like too much, it is
another argument for the trusted-builder path rather than for skipping update
review.

## Open questions

Resolved: AI generation cost is the resident's, via MCP. Review is required
before publish.

Still open:

- What automated checks gate the review queue, and where the trusted-builder
  threshold sits.
- Whether a rejected submission gets a reason, and whether there is any appeal.
  Light-touch works better when rejection is explained.
- Manifest format. Needed now for every door, and it is the contract that has to
  outlive every other decision here.
- Whether the MCP server is public to any AI tool or requires a resident token
  first. Leaning token, since it ties creation to identity from the start.
