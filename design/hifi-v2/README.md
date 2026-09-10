---
type: reference
title: Hi-fi v2 component sheet
status: active
updated: 2026-08-05
---

# Hi-fi v2

> **Visual baseline updated 2026-09-10:** [The Daily design system](../system/README.md) is now authoritative for visual styling. This sheet remains a screen/behavior reference; older typography, colors, icons, and geometry are historical where they conflict with the approved system. Product and security contracts remain unchanged.


The full surface of Town Square, drawn as one specimen sheet. Twelve sections,
around 200 labelled specimens, every one built from the published `--ts-*` token
contract in `packages/tokens`.

    open design/hifi-v2/index.html          # Firefox, Chrome, anything

Unlike `design/hifi/`, this is a plain static page. There is no dc-runtime and no
server needed, so `file://` is fine.

## What this is for

`design/hifi/` is the original Claude Design output and remains the source of
truth for the eight screens it covers. This sheet is the layer under and around
those screens: the primitives they are made of, the states they fall into, and
the surfaces the original never reached (the directory at 700 listings, the
builder door, civic and emergency, the composer, the theming proof).

It is a design document, not a component library. Nothing here imports into the
app. When a specimen graduates it gets rewritten as real markup in `apps/web`
against the same tokens, which is why the no-hex rule below is enforced.

## Layout

    foundation.css        tokens, sheet chrome, and the [data-town] reskins
    icons.svg             121 stroked symbols on a 24 grid
    sections/NN-slug.html one <section class="sheet-section">
    sections/NN-slug.css  that section's styles, namespaced
    build.mjs             concatenates sections into index.html
    check.mjs             enforces the contract in AUTHORING.md
    AUTHORING.md          the contract a section author works to

    node design/hifi-v2/build.mjs     # rebuild index.html
    node design/hifi-v2/check.mjs     # verify before rebuilding

`build.mjs` skips any section whose stylesheet is missing rather than rendering
it bare, and reports what it skipped.

## The two rules that matter

**No raw colours.** Not one hex literal, `rgb()` or named colour appears in a
section stylesheet. `check.mjs` fails the build on one. This is not tidiness: the
tokens are injected into every sandboxed creation as CSS custom properties, so a
town that reskins Town Square reskins every resident-built app inside it in the
same move, without any creation being changed or even reloaded. A hand-copied
colour is a hole in that, and the hole is invisible until someone reskins months
later. Section 11 renders the same screen under three towns to prove it.

**Namespaced classes.** The sheet is one document assembled from twelve
independently authored files, so every class carries its section's prefix
(`dr-`, `cr-`, `ev-`). Only the sheet chrome documented in `AUTHORING.md` is
unprefixed.

## The sections

| | Section | Covers |
|---|---|---|
| 01 | Foundations | palette with a real contrast table, type at all three voices, spacing, elevation, the full button matrix, form controls, avatars, loading atoms |
| 02 | Navigation and shell | top bar, town switcher, bottom nav, desktop shell, tabs, omni-search, sheets, the builder command palette |
| 03 | News | four lead variants, story rows, the multi-source cluster, source attribution, the reader page, developing-story timeline, feed states |
| 04 | Events | agenda rows including cancelled, day/week/month views, event detail, the category system, submit, RSVP honesty |
| 05 | Directory | discovery home, the stumble surface, four card densities, the open-now system, business profile, map, collections |
| 06 | Creations | the gallery that has to make someone think "I could build one", the annotated seam, host chrome, trust sheet, write-back consent, boot and failure |
| 07 | Builder door | the front door, token minting, code and terminal blocks, the manifest editor, validate, preview, the review ladder, SDK docs |
| 08 | Identity | sign-in, handles, the verification ladder, giving and asking for a vouch, the admin vouch graph, reporting, the moderation queue, revert |
| 09 | Civic | the four-step severity ladder, the emergency takeover, city hall, the agenda reader, the vote record, subscriptions, provenance |
| 10 | States | eight empty states, the error ladder, offline, stale data, per-surface skeletons, toasts, modals, the motion spec |
| 11 | Theming seam | the three-town proof, what moved and what did not, the reskin recipe, semantic token proposal, anatomy diagrams, dark mode, do and don't |
| 12 | Contribution | typed composers rather than a post box, event and correction and notice and photo, attribution, publish gates, drafts, gentle friction |

## Additions this sheet proposes

`foundation.css` adds tokens that were being hand-rolled per component. All are
additive; nothing was renamed, so the SDK 1 contract is intact.

- `--ts-shadow-flat` / `-raised` / `-lifted` / `-overlay` / `-navy`
- `--ts-ease`, `--ts-ease-out`, `--ts-dur-1` … `--ts-dur-4`
- `--ts-focus`

Section 11 additionally proposes a semantic alias layer (`--ts-action`,
`--ts-civic`, `--ts-verified`, `--ts-alarm`) over the raw hues. That one is a
proposal, not a decision.

## Copy

Everything is written for Russellville, Arkansas: Arkansas Tech, Lake Dardanelle,
Nuclear One, the courthouse square, Pope County. No lorem ipsum anywhere. The
point is that a design reads differently when the content is real, and a town
platform in particular cannot be evaluated against filler.
