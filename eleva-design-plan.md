# Eleva design plan

Design only. No feed adapters, no content types, no SDK work, no playback engine.
This plan decides what the Eleva experience looks like inside Town Square, using
the two existing design tracks, before any code functionality gets built.

Written 2026-08-14 from three inputs: the hifi-v2 recon, the Bond-mockup recon,
and the Eleva research (feed, brand assets, show structure). Companion facts live
in the session memory note `eleva-townsquare-integration`.

## Where design stands today

Two tracks exist and they are not in conflict, they are at different altitudes:

- **`design/hifi-v2/`** is the committed source of truth. It already designed
  more of this than expected: the `.dr-pod` episode card (92x92 cover, 44px play
  button on the cover, terracotta-tint playing state with a scrub bar and time
  remaining) at `sections/05-directory.html:947-999`; the directory explicitly
  mixing places, articles and podcasts; audio as a medium tag in the news
  cluster; podcasts as a group in search typeahead. The serif/sans split carries
  type identity: businesses in sans (somewhere to go), episodes and articles in
  serif (something to read or listen to).
- **`townsquare-mockups/`** is the live Bond-language exploration (white canvas,
  register dots, Ask choreography, creation host chrome), paused exactly at its
  own "show 3-4 key screens and let Tal redirect" checkpoint. It is interactive,
  running at localhost:4322, and almost entirely uncommitted.

What neither track has: a persistent now-playing surface, an episode detail, a
show page, or an answer to "how does a partner brand appear in the shell."

## The five design decisions to lock

1. **Track order: mockups first, then canonize into hifi-v2.** The mockup is
   interactive and already waiting for a reaction; Eleva becomes its next test
   case. Once the choices survive contact, they get written as a new hifi-v2
   section 13 ("Listen") through the enforced pipeline (`check.mjs`,
   `build.mjs`). hifi-v2 stays the system of record.

2. **The shell owns playback.** The `.dr-pod` rationale already says it: people
   listen "while doing something else." That demands a global now-playing bar
   that survives navigation. The hard design problem is the bottom band, which
   already stacks home indicator, tab bar, and AskBar. Explore at least two
   answers: (a) a slim strip that docks above the AskBar, (b) the now-playing
   state temporarily replacing the AskBar band, with Ask one tap away. Expanded
   state is a bottom sheet player, consistent with "sheets for anything
   secondary."

3. **Eleva's brand lives inside the frame, never in the chrome.** hifi-v2 is
   unambiguous: a creation gets `app.setTitle`, an icon plate from the shared
   sprite, and attribution in Town Square typography; no logo lockup in the
   shell. Honor that. The happy accident: Eleva's brand palette (navy, cream,
   gold, teal) rhymes almost exactly with the Town Square token family, so the
   Eleva experience inside the sandbox frame can carry the full parallelogram
   mark and its colors and still feel native. Where Eleva must be recognizable
   in shell surfaces (feed rows, search results), use the existing source-mark
   pattern: initials on a tint, name doing the real identification.

4. **Episodes are content, the Eleva creation is a creation.** Register-dot
   assignment: an episode row in the feed reads as media, terracotta register
   with the Audio medium tag and duration, exactly like the news cluster's
   audio variant. The pinned Eleva creation card keeps the gold creation
   register with a live line ("New episode: ..."). One brand, two registers,
   because they are two different kinds of thing.

5. **The Hispanic business directory is a Collection, not a fork.** The
   directory design already has resident-made Collections with mosaic covers,
   and a filter-chip system. "Negocios Hispanos," curated by Eleva, is a
   collection over existing listings plus a directory filter chip. The same
   collection renders inside the Eleva creation as its branded directory view.
   Zero new data surfaces, two doors. Bilingual treatment: a small mono "ES"
   language tag in the medium-tag slot; Spanish copy is real copy and follows
   the same voice rules (sentence case, plain, no em dashes).

## Phases

### Phase 0, protect the work (half a session)

- Commit the mockup working tree on a branch. Everything that makes it Town
  Square rather than Bond is uncommitted, including all three new screens and
  the fonts. Delete the stray `src/components/screens/.next/` first.
- Regenerate a clean vector master of the Eleva mark. None exists anywhere on
  the machine; the mark is simple geometry (parallelogram plate, wordmark,
  triangle, gold wedge), so redraw as SVG from
  `~/Documents/Business/LevelUp/Archived Graphics/Eleva Graphics/eleva transparent.psd`.
  Produce: full-color SVG, single-color ink SVG, square cover crop.

### Phase 1, Eleva screens in the mockup prototype (the reaction set)

Build in `townsquare-mockups`, honoring its rules (all color through `--ts-*`
tokens, real Russellville copy, mark from the sanctioned PNG). Five screens,
smallest seams first:

- **M1. Today with audio.** An Eleva episode post in the Following section
  (`PostMedia` grows `kind: "audio"`: square cover tile, play affordance,
  duration chip, EP. N mono eyebrow, serif title, ES tag) and the Eleva pinned
  creation card carrying a "New episode" live line.
- **M2. Now-playing bar.** Both placement options from decision 2, three
  states each: playing (scrub fill, time remaining), paused, expanded sheet
  player (cover, title, show, scrub, minimal transport). This is the screen
  most worth reacting to.
- **M3. The Eleva creation.** Inside the ink host chrome: Eleva's own
  navy/cream/gold world on the white sheet. Show hero, latest episodes list,
  sub-show rail (Real Estate Roundtable, devotionals, event coverage), and the
  Negocios Hispanos module rendered via `town.directory`.
- **M4. Directory mixed results.** `.dr-pod`-style episode cards alongside
  business rows (directory data already sits unused in `data.ts`), the
  Negocios Hispanos collection card, and its filter chip with the honest
  filter sentence.
- **M5 (stretch). Ask, in Spanish.** "¿Qué hay de nuevo con Eleva?" through the
  four-beat choreography, with podcasts as a searched corpus and an episode as
  the provenance-backed answer. Proves the bilingual voice and the podcast
  corpus in one shot.

Checkpoint: Tal clicks through at localhost:4322 and redirects. Nothing below
starts until then.

### Phase 2, canonize into hifi-v2

New `sections/13-listen.html` + css, 8-14 specimens with state matrices and
rationale lines, namespaced `ls-`. Contents: episode row (rest, unread, played,
ES-tagged), now-playing bar matrix, sheet player, episode detail, show page
with sub-show grouping, partner source mark, the Negocios Hispanos collection
treatment, and minted transport glyphs the sprite lacks (skip back/forward
15/30, speed, rss). Run `node design/hifi-v2/check.mjs` then `build.mjs`.
Amend section 05 only if the collection treatment needs a variant.

### Phase 3, design handoff notes

One short doc mapping each approved surface to the build seam it implies
(episode item type, show entity, collection tag, creation manifest), so the
code phase starts from decisions instead of re-deriving them. Also fold in the
ATU angle: Proposal 3 (discovery engine) gets podcasts in its corpus for free.

## Out of scope, deliberately

Feed adapter, `content_items` episode type, SDK additions, actual audio
playback, the Transistor feed fixes (language tag, Apple Podcasts, dead
Castopod), and anything Obee-facing. All queued behind the design checkpoint.

## Open questions for Obee (do not block Phase 1)

- What earns a listing in Negocios Hispanos, and who curates it.
- Whether to formalize sub-show names now (the design can show the rail with
  the observed formats either way).
- Cover art per sub-show, or one Eleva mark across everything.
