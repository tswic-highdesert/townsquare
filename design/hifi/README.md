---
type: reference
title: Town Square hi-fi design reference
status: active
updated: 2026-08-03
---

# Town Square hi-fi (Claude Design import)

Imported 2026-08-03 from the Claude Design project
`7a1f14d9-e382-49e3-b4a5-544db43033fb` ("Town Square hi-fi"). This is the
**visual source of truth** for the app: the design language Tal dialed in, at
shipping fidelity. Build against it.

## Files

| File | What it is |
|---|---|
| `Town Square hi-fi.dc.html` | The design itself. Eight turns (t4–t11), ~20 screens. |
| `support.js` | Generated dc-runtime. Do not edit. |
| `image-slot.js` | Omelette starter component backing `<image-slot>`. Do not edit. |
| `uploads/mark.png` | The approved raster mark, copied from `../../brand/`. |

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

| Where | Treatment |
|---|---|
| Today header (22px) | Full-color mark, tile dropped |
| "running on Town Square" chips, ×2 (20px) | Full-color mark, tile dropped |
| Today source summary (26px) | Full-color mark, tile dropped |
| Escape hatch (30px in a 46px tile) | Full-color mark on a surface tile, so it still pairs with the dashed external tile beside it |
| Emergency "relayed by Town Square" (22px) | **Monochrome cream knockout**, not full color — the emergency screen is deliberately a second visual register with one alarm red, and a full-color logo would break it |

The marks are inlined as data-URIs rather than `<svg>` elements on purpose: the
dc-runtime renders the template through `React.createElement`, which is fussy
about SVG attribute casing (`viewBox`, `fill-opacity`). A CSS
`background-image` sidesteps that entirely.

Both mark vectors live in `../../brand/` (`mark.svg`, `mark-mono-alert.svg`) —
regenerate or restyle from there, not from the data-URIs.

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
