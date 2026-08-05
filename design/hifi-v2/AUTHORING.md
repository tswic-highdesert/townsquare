---
type: standard
title: Hi-fi v2 section authoring contract
status: active
updated: 2026-08-05
---

# How to author a section of the sheet

You are designing one part of Town Square's interface at high fidelity. Your
output is a static HTML fragment plus a stylesheet. Read this whole file first.

## What Town Square is

An open source community platform for one town, with three layers:

1. **Aggregation** — news, events, notices for the town in one place.
2. **Discovery directory** — ~700 businesses, plus local articles and podcasts,
   built for stumbling onto things rather than looking up what you already knew.
3. **The build layer** — residents build small sandboxed apps ("creations") on
   the Town Square foundation, submitted through an MCP server they connect to
   their own AI tool, reviewed by a local committee, and hosted inside the shell
   in a sandboxed iframe. This is the thesis: value compounds with builders, not
   readers.

Identity is vouch-based. A resident is `verified` when neighbours vouch for them
(10 by default). We never store an address. Verified must never mean publicly
identified — pseudonymity is preserved, and the identity surface a creation can
see is only `{ handle, verified }`.

## The two files you write

    design/hifi-v2/sections/NN-slug.html
    design/hifi-v2/sections/NN-slug.css

The HTML file contains **exactly one** element and nothing else:

```html
<section class="sheet-section" id="your-slug">
  <div class="sec-head"><span class="sec-num">NN</span><h2>Your section title</h2></div>
  <p class="sec-note">One or two sentences on what this section covers.</p>

  <div class="spec">
    <div class="spec-label">Component name <em>the one-line reason it looks like this</em></div>
    ...your component...
  </div>
  ...
</section>
```

No `<html>`, `<head>`, `<body>`, no `<link>`, no `<style>` block, no
`<!doctype>`. A build script concatenates every section into one page and inlines
every section stylesheet. Your CSS file is plain CSS, no imports.

## Hard rules

1. **No hex literals, no `rgb()`, no named colours in your CSS.** Every colour is
   `var(--ts-*)` from the list below. This is checked. If you genuinely need a
   value that does not exist, derive it with `color-mix(in srgb, var(--ts-navy) 30%, transparent)`
   — never a raw hex. This rule is the entire multi-town theming seam.
2. **Namespace every class you invent.** Prefix with your section slug, e.g.
   `.dir-card`, `.dir-hours`. The sheet is one document; an unprefixed `.card`
   will collide with another author's. The only classes you may use unprefixed
   are the sheet-chrome ones documented below.
3. **Static only.** No frameworks, no build step, no external requests, no
   `<img src="https://…">`. If you need a photograph, draw a placeholder with a
   CSS gradient over `var(--ts-stone)` — several sections do this and it should
   look deliberate, not broken.
4. Small inline `<script>` for a genuinely interactive demo (a tab that
   switches, a sheet that opens) is allowed, but it must be self-contained,
   guarded by its own id/scope, and the component must look right with JS off.
5. **Mobile first.** Whole screens go inside `.phone`. Parts go loose.

## Sheet chrome you may use unprefixed

| Class | What it does |
|---|---|
| `.sheet-section`, `.sec-head`, `.sec-num`, `.sec-note` | section furniture, required |
| `.spec` | one labelled specimen block |
| `.spec-label` + inner `<em>` | the caption above a specimen; the `<em>` is a right-aligned one-line rationale |
| `.spec-row` | flex-wrap row of specimens |
| `.spec-grid` | auto-fill grid, 280px min |
| `.plate` / `.plate[data-dark]` | a neutral card to sit a loose component on |
| `.why` | a rationale paragraph, terracotta rule on the left; `<b>` inside for emphasis |
| `.phone` > `.phone-cap` + `.phone-screen` | a 390px device for whole screens |
| `.i`, `.i-sm`, `.i-lg`, `.i-xl` | icon sizing, stroke uses `currentColor` |

Example of a whole screen:

```html
<div class="phone">
  <div class="phone-cap">Directory — browse</div>
  <div class="phone-screen">…</div>
</div>
```

## Icons

A shared sprite is inlined at the top of the built page. Use:

```html
<svg class="i" aria-hidden="true"><use href="#i-compass"/></svg>
```

Stroked, 24×24 grid, `currentColor`, sized by `.i` / `.i-sm` / `.i-lg` / `.i-xl`.
Available names (`i-` prefix on each):

`home compass calendar group grid search menu close chevron-right chevron-left
chevron-down chevron-up arrow-right arrow-left arrow-up arrow-down arrow-out
plus minus check more-horizontal more-vertical filter sort refresh drag expand
collapse newspaper document bookmark bookmark-filled share link quote image play
pause mic headphones video tag list layers book storefront map-pin map directions
phone mail globe clock ticket coffee utensils gavel megaphone warning shield flag
vote building bus tree sun cloud-rain user users user-plus badge-check handshake
heart star sparkle code terminal puzzle plug package wand key lock unlock eye
eye-off database cloud-upload download git-branch history settings sliders trash
edit copy external bell bell-off leaf music sport camera dollar chart info help
check-circle alert-circle x-circle loader pin archive send message thumb-up
inbox lightbulb scale wrench zap`

If you need a glyph that is not on that list, add a `<symbol>` to your own HTML
fragment inside a `<svg style="display:none">` block at the top of your section,
drawn to the same rules: 24×24 box, stroked never filled, no explicit stroke
attributes (the `.i` class supplies them).

## The token contract — this is the complete list

**Surfaces** `--ts-cream` (the screen, warm off-white) · `--ts-surface` (cards,
white) · `--ts-stone` (image placeholder / inert fill)

**Ink** `--ts-ink` (body text) · `--ts-ink60` (muted text) · `--ts-ink45`
(quieter still) · `--ts-ink26` (disabled, dots) · `--ts-ink13` (divider) ·
`--ts-ink08` (shadow) · `--ts-hairline` (card border)

**Navy** `--ts-navy` · `--ts-navy-dark` · `--ts-navy80` · `--ts-navy60` ·
`--ts-navy40` · `--ts-navy10`

**On dark** `--ts-cream-muted` · `--ts-cream14`

**Terracotta** (primary action, warm accent) `--ts-terracotta` ·
`--ts-terracotta-hover` · `--ts-terracotta-tint` · `--ts-terracotta10` ·
`--ts-terracotta14`

**Gold** (civic, notices) `--ts-gold` · `--ts-gold14` · `--ts-gold-text`

**Sage** (verified, open, alive) `--ts-sage` · `--ts-sage-light` · `--ts-sage14`

**Brick** `--ts-brick` — the single alarm register. An actual emergency only.
Using it for a validation error or a delete button spends the one thing that is
supposed to still mean something at 6am when the river is up.

**Space** `--ts-space-1 2 3 4 5 6 8 10 12 16` (4px scale, so `-4` is 16px)

**Radius** `--ts-radius-input` `--ts-radius-button` (10) · `--ts-radius-chip`
`--ts-radius-full` (999) · `--ts-radius-card` (16) · `--ts-radius-sheet` (20)

**Type** `--ts-font-serif` (Newsreader) · `--ts-font-sans` (DM Sans) ·
`--ts-font-mono` (DM Mono). Sizes: `--ts-text-h1` 24 · `--ts-text-h2` 21 ·
`--ts-text-card-title` 18 · `--ts-text-body` 17 · `--ts-text-label` 15 ·
`--ts-text-caption` 13 · `--ts-text-eyebrow` 11. Intermediate sizes as bare px
are fine (the shipped app uses 13.5px and 14.5px deliberately).

**Elevation** `--ts-shadow-flat` · `--ts-shadow-raised` · `--ts-shadow-lifted` ·
`--ts-shadow-overlay` · `--ts-shadow-navy`

**Motion** `--ts-ease` · `--ts-ease-out` · `--ts-dur-1` (90ms) · `--ts-dur-2`
(160ms) · `--ts-dur-3` (260ms) · `--ts-dur-4` (420ms) · `--ts-focus` (focus ring
box-shadow)

## The three voices of type — follow this, it is settled

Reviewed against the running app and changed on purpose:

| Voice | Face | Where |
|---|---|---|
| Editorial | Newsreader 13.5–25px | headlines, bylines, attributions, timestamps, quiet counts |
| Structural | DM Mono 10–11px, `letter-spacing: .1–.16em`, uppercase | section eyebrows, dates, the APP chip, anything labelling the page |
| Utility | DM Sans 11–15px | buttons, form labels, hours, AM/PM, everything a finger acts on |

Monospace survives only where it is **labelling** the page rather than **saying**
something. Setting a byline in mono makes it read as terminal output.

## Design direction

- **Civic but not municipal.** Never a city government website.
- **Warm and local.** A specific town with real people in it, not a SaaS product
  with a town skin. The background is warm cream, never white.
- **Two audiences, one app.** A resident who wants to know what is on this
  weekend, and a builder shipping something into it. The resident path must never
  get cluttered by builder tooling.
- **Avoid:** Nextdoor energy (no surveillance, no complaint-board feel), generic
  dashboard-of-cards layouts, treating creations as an afterthought tab.
- **Restraint is the house style.** One dark card per screen, one tinted card per
  screen, colour reserved for the thing that earns it. If everything is
  emphasised, nothing is.

## Copy

Write real, specific, plausible copy for **Russellville, Arkansas** (Pope
County, the Arkansas River valley, Arkansas Tech University, Lake Dardanelle,
Nuclear One). Never `Lorem ipsum`, never "Card Title", never "Business Name".
Real-sounding street names, real-sounding local orgs, times that make sense.
Sentence case for UI copy. **No em dashes anywhere** — use a comma, a full stop,
or a spaced en dash. Voice is plain and unhurried: say the thing.

## What "high quality" means here

Density of real thought, not density of boxes. Each specimen should show a
**state matrix** where states exist (default / hover / focus / active / disabled
/ loading / empty / error), and should be accompanied by the `<em>` rationale in
its label saying why it resolves this way. A specimen that could be from any app
is a failed specimen. Aim to genuinely exhaust your area: 8–14 distinct
specimens is the target, and more is better if each one earns its place.

Accessibility is part of the design, not a pass afterwards: real focus rings via
`--ts-focus`, hit targets ≥ 44px, `aria-*` where a control needs it, and never
colour as the only carrier of meaning.
