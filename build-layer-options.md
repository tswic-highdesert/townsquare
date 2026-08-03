---
type: brief
title: Town Square build layer, how residents plug apps in
status: draft
updated: 2026-08-03
---

# How residents build and link apps in

The open design problem from `VISION.md`. This is prior art plus a
recommendation, not a decision. Nothing here is locked.

## The real question

"Let people build on top and link in" is actually three separate questions that
get confused with each other:

1. **Where does their code run?** Their machine, or ours?
2. **What do we give them?** Distribution, data, identity, hosting?
3. **Can they write back?** Read-only consumers, or contributors to the town's
   shared data?

Most platforms answer 1 and 2 and never seriously answer 3. Question 3 is where
the compounding actually lives.

## Prior art worth stealing

| Model | Who does it | What to steal |
|---|---|---|
| **Directory listing only** | Product Hunt, awesome-lists, OSM's app wiki | An app is a URL plus metadata. Zero integration. Nearly zero friction. |
| **Open data substrate** | OpenStreetMap + Overpass API | The platform is the shared data; hundreds of independent apps read it. The Flock camera example is literally an OSM overlay. |
| **OAuth + REST API** | Every SaaS platform | Identity and data without hosting anyone's code. Boring and battle-tested. |
| **Manifest + iframe embed** | Slack apps, Shopify App Bridge, Discord Activities | App runs on the builder's infra but renders inside our chrome and feels native. A signed session token carries the user. |
| **Sandboxed in-host plugins** | Figma, Obsidian, Raycast | Real extensibility with no hosting cost, but a hard security boundary to build. |
| **Platform-hosted user code** | Cloudflare Workers for Platforms, Val Town, Glitch | Builder pushes code, we run it. Highest magic, highest ops burden and abuse surface. |
| **Open source plugin ecosystem** | WordPress, Home Assistant (HACS) | The closest analogue to our whole thesis: open source, self-hosted per community, ecosystem is the actual product. Worth studying hardest. |

**WordPress and Home Assistant are the two to study properly.** Both are open
source, both are deployed independently by thousands of operators, and in both
cases the community extension ecosystem, not the core software, is what made
them win. That is exactly the Town Square bet.

## The pattern that fits: a ladder, not a decision

Nearly every platform that tried to launch with deep integration died of
friction. The ones that won let you start with almost nothing and go deeper only
when you wanted more. Do not pick a tier, ship a ladder.

**Tier 0, Listed.** Your app is a card in the Creations gallery. You give a URL,
a name, and a description. That is it. Works in five minutes, works for a Google
Form, works for something you vibecoded last night. This tier alone delivers the
core promise: discovery.

**Tier 1, Connected.** Read Town Square data with an API key. Events, notices,
the 700 business listings, town geography. Now the burrito app doesn't have to
rebuild the restaurant list, it inherits it.

**Tier 2, Signed in.** Use Town Square identity via OAuth. Residents don't make
another account, and their state travels between creations. This is the moment
the platform stops being a directory and starts being a foundation.

**Tier 3, Embedded.** A manifest plus an iframe, Slack and Shopify style. Runs
on the builder's own infra but renders inside Town Square chrome and feels
native. This is what "linked into the infrastructure" looks like visually.

**Tier 4, Hosted.** We run their code. Highest magic, and the one to defer
longest because it imports an entire ops and abuse problem.

Ship 0 and 1 first. They are cheap and they prove whether anyone builds at all.

## The interesting part: writing back

Tier 0 through 4 are all consumption. The genuinely novel move is letting a
creation **publish typed records back into Town Square**.

The Flock camera app doesn't just read town data, it produces a new dataset:
camera locations. If that can be published back as a first-class layer, then the
next person's app reuses it, and the town's shared knowledge compounds instead
of fragmenting into fifty silos.

That turns Town Square from a launcher into a substrate. It is also the hardest
thing here, because write access is where spam, vandalism, and liability live.
OSM has fought this for twenty years, and their answer is worth copying: open
writes, full edit history, easy revert, and a small trusted moderator corps.

Worth noting the v1 data model already anticipated this. The stale-never-delete
design exists so state attached to an item never orphans.

## Trust and curation

Anyone can link something in, so decide early:

- **Open by default with revert**, OSM style, versus **reviewed before listed**,
  app store style. Open scales and is truer to the thesis. Reviewed is safer and
  slower.
- Creations should carry visible provenance: who built this, when, is it alive.
  A graveyard of dead resident apps is the main way this gets embarrassing.
- The Flock camera example is politically live in a way a burrito map is not.
  Hosting it says something. Decide whether Town Square is a neutral substrate
  or an editorial product, because that answer sets moderation policy.

## Recommendation

Start at Tier 0 and 1 with a public read API, and design the record format from
day one so writing back later is a permission change and not a rewrite. Study
Home Assistant's community integration model closely, since it is the nearest
working example of an open source, self-hosted, community-extended platform.

The strongest early signal is not architecture. It is whether five Russellville
residents will actually build five things. Tier 0 tests that for almost no
engineering cost.

## Decisions (Tal, 2026-08-03)

**Moderation: community-driven, light touch.** Town Square is a neutral
substrate, not an editorial product. Verified users can report. We observe all
laws, and beyond that we do not carry a heavy moderation burden.

**Write-back: yes.** Creations can publish typed records back into Town Square.
This is a core capability, not a someday feature.

**Build order: Tier 0 and Tier 1 first.** Listed, then connected.

### What those three decisions imply

They interlock more than they look like they do.

**Identity is not deferrable to Tier 2.** "Verified users can report" requires
knowing who a verified user is. Write-back requires attribution, otherwise
anonymous records are unmoderatable and unrevertable. So identity has to move up
the ladder and land alongside Tier 0 and 1, not after them. This is the one
place the original ladder was wrong.

**Revert is the moderation lever.** Light-touch moderation only works if bad
input is cheap to undo. That means, from the first write-back schema onward:
every record versioned, every version attributed, and one-click revert to any
prior state. OSM survives on exactly this. Retrofitting history onto a table
that was not designed for it is painful, so it goes in at the start.

**Reports are a queue, and someone drains it.** Community reporting surfaces
problems, it does not resolve them. Even light touch needs a named human with a
revert button and a five-line written policy. Decide who that is before launch,
because "the community handles it" with nobody holding the lever is how this
becomes a mess.

**Legal floor, worth being concrete.** In the US, hosting user content is
broadly protected, but a few things are not optional regardless of how light the
policy is: a DMCA agent and takedown path for copyright, mandatory reporting for
CSAM, and responsiveness to lawful requests. For an open source project this
matters twice, because every town that self-hosts a fork becomes its own
responsible operator. That belongs in the docs so adopters know what they are
taking on.

## Open questions for Tal

- What makes a user "verified"? Email, phone, or something that actually ties to
  living in the town. This is now on the critical path, since reporting and
  write attribution both depend on it.
- Who holds the revert button at launch, and what is the five-line policy they
  follow?
- Is a creation allowed to charge money? A local business directory with a paid
  app in it raises questions fast.
- Do other towns share a creation ecosystem, or does each fork start empty? An
  app that works in Russellville probably works in any town, and that is either
  a network effect or a governance headache.
