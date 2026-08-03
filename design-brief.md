---
type: brief
title: Town Square design brief (Claude Design paste block)
status: active
updated: 2026-08-03
---

# Claude Design paste block

Everything below the line is meant to be pasted into Claude Design as-is.

---

I'm designing **Town Square**, an open source community platform. Block out the
core screens. Do not write production code yet, I want the shape and the feel.

## What it is

A community wide application for a single town, with three layers:

1. **Aggregation.** News, events, and notices for the town in one place.
2. **Discovery directory.** Businesses, articles, and podcasts from the town,
   built for stumbling onto things you didn't know to look for, not for
   looking up something you already knew about.
3. **The build layer.** This is the differentiator. Residents build their own
   small apps on top of the Town Square foundation and link them back in, so
   the rest of the town can find and use them. Real examples: an app cataloguing
   every Flock camera location in town, an app ranking the best Latino burritos,
   something that gamifies discovering local businesses.

Town Square doesn't build those apps. It's the foundation they stand on and the
front door they get discovered through. The value compounds with the number of
people building, not the number of people reading.

It's open source, so another town can fork it, rebrand it, and run their own.

## Screens to block out

1. **Town home.** What's happening right now. Today, this weekend, coming up,
   plus notices. Should feel alive and current, not like a bulletin board that
   was last updated in 2019.
2. **Directory / discovery.** Businesses, articles, podcasts. Lean into
   serendipity: surfacing, browsing, and wandering beat search. Assume roughly
   700 real listings, so density and browsability matter.
3. **Creations gallery.** All the resident-built apps linked into Town Square.
   This is the screen that makes someone think "wait, I could build one."
4. **A single creation in situ.** One resident-built app living inside Town
   Square. Show the seam: what's Town Square chrome, what's theirs, who made it,
   how it connects back to town data.
5. **Link your creation.** The submission and connection flow for a builder.
   Should feel like plugging something in, not like filing a permit.

## Existing brand (use this, don't invent one)

The identity is already built. Design to it.

**Logo.** An icon plus wordmark lockup. The mark is two overlapping rounded
people with a terracotta speech bubble and gold activity dots, meaning community
plus what's happening. Soft geometric shapes, flat color, slightly overlapping
with a multiply-like blend where they cross.

**The lockup is already multi-town.** "Town Square" is the constant wordmark and
the location line above it ("River Valley") is a swappable field. That is the
theming seam, and it should carry through the whole design system, not just the
logo.

**Palette:**

| Token | Hex | Role |
|---|---|---|
| Navy | `#2C3E50` | Primary, wordmark, front figure |
| Terracotta | `#C4775A` | Speech bubble, warm accent |
| Sage | `#7D9B76` | Second figure head |
| Gold | `#D4A853` | Second figure shoulders, activity dots |
| Cream | `#FAF8F5` | Background |
| Surface | `#FFFDFB` | Light tile |

Note this is a warm cream-background palette, not a white one. Keep it warm.

**Type.** Libre Baskerville. Wordmark around weight 600, location eyebrow at
weight 400, uppercase, letter-spaced. A serif is the anchor of this identity, so
don't quietly swap in a geometric sans for everything.

## Design direction

- Civic but not municipal. This is not a city government website and it should
  never read like one.
- Warm and local. It should feel like it belongs to a specific town with real
  people in it, not like a SaaS product with a town skin.
- Built for two audiences at once: a resident who just wants to know what's
  happening this weekend, and a builder who wants to ship something into it.
  The resident path can't get cluttered by builder tooling.
- Because it's open source and multi-town, the design system needs an obvious
  theming seam. Show me how another town would make it theirs without a
  redesign.
- Mobile first. Most people check what's happening on a phone.

## Avoid

- Nextdoor energy. No surveillance vibes, no neighborhood-complaint feel.
- Generic dashboard-with-cards layouts.
- Anything that treats the resident-built apps as an afterthought tab. The build
  layer is the whole thesis and the design should argue for it.

## Deliverable

Blockouts for the five screens above, plus a first pass at the design system
(type, color, spacing, core components) with the theming seam called out.
