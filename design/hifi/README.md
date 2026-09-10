---
type: reference
title: Town Square hi-fi design reference
status: active
updated: 2026-08-03
---

# Town Square hi-fi (Claude Design import)

> **Visual baseline updated 2026-09-10:** [The Daily design system](../system/README.md) is now authoritative for visual styling. This sheet remains a screen/behavior reference; older typography, colors, icons, and geometry are historical where they conflict with the approved system. Product and security contracts remain unchanged.


Imported 2026-08-03 from the Claude Design project
`7a1f14d9-e382-49e3-b4a5-544db43033fb` ("Town Square hi-fi"). This is the
**historical visual reference** for the app. Preserve its relevant behavioral
requirements, but build new visual styling against `design/system/`.

## Files

| File | What it is |
|---|---|
| `Town Square hi-fi.dc.html` | The design itself. Eight turns (t4–t11), ~20 screens. |
| `support.js` | Generated dc-runtime. Do not edit. |
| `image-slot.js` | Omelette starter component backing `<image-slot>`. Do not edit. |
| `uploads/mark.png` | The approved raster mark, full size, copied from `../../brand/`. |
| `uploads/mark-ui.png` | The approved mark trimmed and scaled to 256px. **This is what the design references for the in-app logo.** |

## Viewing it

It needs to be served (the runtime fetches siblings), not opened as `file://`:

```bash
cd local/projects/townsquare/design/hifi
python3 -m http.server 8899
# then open http://localhost:8899/Town%20Square%20hi-fi.dc.html
```

Sections are anchored `#t4` … `#t11`, individual screens `#4a`, `#6c`, etc.
Photo slots are real drop targets — drag an image onto one and it sticks.

## What's in it

| Turn | Covers |
|---|---|
| `t4` | **Today** — the resident home. The current shippable reference. |
| `t5` | Nearby (map + list), Yours, the drawer |
| `t6` | **Creations** — manifest/trust page, host chrome, write-back consent, boot + failure, escape hatch |
| `t7` | Builder door — connect your own AI (MCP tool server), email capture |
| `t8` | Article, podcast, video, source page |
| `t9` | Emergency — the one alarm-red register |
| `t10` | Business profile |
| `t11` | Composer, and the neighbor stream |

## Change made on import: the real logo

The design shipped with a **placeholder** brand mark — a terracotta rounded
square with the Material Symbols `forum` glyph in it, in six places. All six
now use the real Town Square mark (two overlapping figures + terracotta speech
bubble), inlined as an SVG data-URI:

| Where | Size |
|---|---|
| Today header | 22px, tile dropped |
| "running on Town Square" chips, ×2 | 20px, tile dropped |
| Today source summary | 26px, tile dropped |
| Escape hatch | 30px on a surface tile, so it still pairs with the dashed external tile beside it |
| Emergency "relayed by Town Square" | 22px |

All six reference `./uploads/mark-ui.png` via a CSS `background-image`, rather
than an `<img>` or inline `<svg>`. That is deliberate: the dc-runtime renders
the template through `React.createElement`, which is fussy about SVG attribute
casing (`viewBox`, `fill-opacity`). A CSS background sidesteps it entirely.

**Corrected 2026-08-03.** The first pass at this used a vector mark generated
from `build.py`'s `icon_group()`. That function is a work-in-progress
approximation, **not** the approved logo, and Tal caught it. Everything now
comes from `brand/mark.png`, the real one. See the warning in
`../../brand/README.md` before you touch the logo again.

Open question for Tal: the emergency chip carries the full-color mark. That
screen is otherwise a deliberate single-alarm-red register, and a monochrome
knockout would respect it better, but the real mark's internal separations are
thin anti-aliased strokes that disappear when flattened to one color at 22px.
Doing it properly needs a purpose-built mono lockup, which does not exist yet.

## Notes

- The palette here is **tuned** off the base brand: cream `#EDE9E0`, navy
  `#26405B`, terracotta `#C4714E`, ink `#1D1B16`, alarm `#7E1F0C`. Close to
  `../../brand/README.md` but not identical. This file wins for app UI; the
  brand file wins for the logo itself.
- Type is **Newsreader** (serif) + **DM Sans** + **DM Mono**, not Libre
  Baskerville. Libre Baskerville remains the *logo* typeface only.
- The design project also holds an earlier lo-fi `Town Square.dc.html`. Not
  imported — the hi-fi supersedes it.
- The project's `.image-slots.state.json` sidecar was **not** imported: its only
  key is `ts4-lead`, while every slot in the hi-fi file is prefixed `hf-`. That
  state belongs to the lo-fi file and would do nothing here.
