---
type: concept
title: Town Square
status: active
supersedes: local/archive/townsquare-v1/
updated: 2026-08-03
---

# Town Square

**Town Square is a community wide application that aggregates what is happening
in a town, makes everything in that town discoverable, and lets anyone in the
community build on top of it and link their creation back in.**

Open source, so any community can adopt it and adapt it.

Everything before 2026-08-03 is archived in `local/archive/townsquare-v1/`.
That was a Russellville news and events feed. This is a bigger thing. When the
old work conflicts with this document, this document wins.

## The three layers

### 1. Aggregation

News, events, and notices for the town, pulled together in one place. This is
the part v1 already did, and the ingest work there is worth reusing.

### 2. Directory and discovery

Not just a business list. A community directory that facilitates discovery
across everything the town produces:

- Businesses
- Articles
- Podcasts

The point is discovery, not storage. Someone should be able to find the thing
they did not know to look for.

### 3. The build layer

This is the new idea, and the reason Town Square is a platform instead of a
website.

In the AI era, anyone can build a small app in an afternoon. Town Square gives
them somewhere to plug it in. A community member builds something on top of the
Town Square foundation, then **links their creation into the infrastructure** so
the rest of the town can find and use it.

Real examples of what a resident might build and link in:

- An app that catalogues every known Flock camera location in town.
- An app for the best Latino burritos in town.
- Something that gamifies business discovery.

Town Square does not build those. Town Square is the foundation they stand on
and the front door they get discovered through.

## Why this matters

Every community app to date has been a product someone in the community
consumes. This is infrastructure the community builds on. The value compounds
with the number of people building, not the number of people reading.

Open source means a town in another state can fork it, run it, and get the same
compounding effect without asking permission.

## Decided (2026-08-03)

Full reasoning and prior art in `build-layer-options.md`.

- **Integration is a ladder, not a model.** Tier 0 listed (an app is a URL in the
  gallery), Tier 1 connected (read town data via API), then signed-in, embedded,
  and hosted later. **Build Tier 0 and Tier 1 first.**
- **Creations can write back.** They publish typed records into Town Square, so
  one resident's dataset becomes the next builder's input. This is what makes it
  a substrate instead of a launcher.
- **Moderation is community-driven and light touch.** Town Square is a neutral
  substrate, not an editorial product. Verified users report. We follow the law
  and go no further. No heavy moderation burden.

Consequence worth holding onto: **identity moves up the ladder.** Verified
reporting and write-back attribution both need it, so it ships with Tier 0 and 1
rather than after. And light-touch moderation only works if every record is
versioned, attributed, and one-click revertable from day one.

Settled 2026-08-03: verification is by vouching; moderation is a role (Tal at
launch, anyone can be scoped in); town data is fully open to read anonymously;
API keys are instant and self-serve; **Russellville is town one**; creations may
charge money; creations belong to one town, cross-town reuse deferred.

**Creations live inside Town Square, not off at their own URL.** They are
sandboxed mini-apps we host and render inside our own chrome, confirmed
2026-08-03. An outbound link stays as an escape hatch. See `spec-tier-0-1.md`.

**Authoring is via an MCP server, not in-app AI.** Residents connect Town Square
to their own AI tool, so the generation cost is theirs and ours is zero. The MCP
server wraps the same SDK, templates, and manifest a local developer uses.
In-app AI is deferred until there is evidence non-technical residents are
blocked. **Publishing requires admin review, including updates.** See
`creation-authoring.md`.

## Where things are

- `spec-manifest-and-sdk.md` is the contract. It wins on anything touching the
  manifest, the SDK surface, permissions, CSP, or error codes.
- `spec-tier-0-1.md` covers identity, privilege tiers, the registry and the read API.
- `creation-authoring.md` covers the MCP route and the review flow.
- `design/` holds the implementation designs for the sandbox+bridge and the MCP
  server. Where a design and a spec disagree, the spec wins.
- `brand/` is the approved identity.

## Governance

Major moderation issues go to a **local Town Square committee**. Tal is the sole
member at launch and approves submissions manually. The committee is the intended
end state, so build moderation as a role held by a group, never as a single
owner account.

This is the answer to "who holds the revert button" and it scales better than a
named person. It also gives the open source story something to copy: an adopting
town stands up its own committee rather than inheriting ours.

## Onboarding

Tal will record a video showing a resident how to build their own Town Square app
using the MCP server. That is the education piece, and it means the docs do not
have to carry first-time users on their own.

## What is still open

Undecided, do not invent without Tal:

- Who pays for in-app AI generation, and the per-resident quota. The only open
  item with a recurring bill attached.
- The manifest format, which is the contract that outlives everything else here.
- One instance serving many towns, or one deploy per town.
- License, governance, and how another community adopts it.

## Brand

The identity is done and lives in `brand/`. Approved 2026-06-04, moved out of
the archive 2026-08-03. Mark is two overlapping people with a terracotta speech
bubble and gold activity dots. Navy, terracotta, sage, gold on cream. Libre
Baskerville.

It was built multi-town from the start: "Town Square" is constant, the location
line is a swappable field via `brand/build.py --location "<Town>"`. That is the
open source theming seam already solved at the brand layer.

Known gap: the mark gets busy below about 32px and no simplified small-size
glyph exists yet. There is also no vector app icon, only PNGs rendered from
`mark.png`.

## Carry forward from v1

Do not rebuild these from scratch, they exist in the archive:

- 741 real Russellville business listings plus the rating-based quality gate.
- Hardened feed ingest: retry and backoff, partial-failure-safe, source health.
- The stale-never-delete data model, built so user state attached to an item
  never orphans. That decision matters more now, because third party creations
  will attach state to Town Square records.
- Multi-town scoping on every row, which is the seed of the open source
  adopt-it-yourself story.
