# Eleva design handoff

Design phase closed 2026-08-14. This maps every approved surface to the build
seam it implies, so the code phase starts from decisions instead of re-deriving
them. Approved artifacts: the Eleva screens in the `townsquare-mockups`
prototype (commits `05e754e`, `2bd3237`, `26c3178` in that repo) and hi-fi v2
section 13 "Listen" in this repo. The plan that got here is
`eleva-design-plan.md`.

## Decisions log

| Decision | Call | Where it shows |
|---|---|---|
| Language | English now, bilingual later. The mockups keep a dormant `LangTag` component; nothing else assumes a language. | mockups |
| Now-playing placement | Swap, not dock. Playback borrows the ask band, Ask folds to a sparkle button. Dock-above was considered and rejected: four stacked chrome layers read as a control panel. | section 13, specimen 3 |
| Partner branding | A show's brand lives on its cover art and inside its creation. Shell surfaces identify a show like a news source: small mark, name in our type, no logo in chrome. | section 13, specimen 7 |
| Creation freedom | Approved 8/14: a creation may look like anything inside the frame, judged by the review committee against content guidelines, not against the palette. Host chrome, sandbox badge, attribution and Report never change. Tokens are offered, not enforced (this was already the technical reality; it is now the stated design policy). | section 13, specimen 9; mockups v2 |
| Hispanic business directory | A curated collection over the one true directory ("Hispanic-owned Russellville", curated by Eleva, self-identified membership) plus a directory filter chip. Never a second dataset. | section 13, specimen 8 |
| Episodes in the shell | Serif side of the serif/sans split, with articles. Terracotta register in the feed. The Eleva creation stays on the gold creation register. Play is always a 44px control on the cover. | section 13, specimens 1 and 2 |
| Player scope | Shell owns playback. The expanded player is a sheet with back-15 / play / forward-30, speed, share, episode page. Deliberately no queue, no up-next, no autoplay. | section 13, specimen 4 |

## Surface to seam map

| Approved surface | Build seam |
|---|---|
| Episode rows/cards in feed and directory | New `content_items.type = 'episode'`. Same `(town_id, tsp_id)` keying, same `active/stale` semantics: a feed that stops publishing goes stale, episodes stay playable. Fields needed beyond the common set: show, episode number, duration, audio URL, cover URL, language. |
| Show page (hero, follow, series chips) | A show entity. Smallest honest version: shows are rows of a `show` content type (or a `record_type` if we want creations to read them uniformly); series chips are grouping metadata on episodes, not entities. Follow reuses whatever "follow a business" becomes; neither exists yet, build once. |
| Episode detail "About a place" card | An episode-to-listing relation. One join table (episode tsp_id, listing tsp_id, source: curator). This is the relation the Directory code comment says no source holds; the curator supplies it at first, extraction can come later. Feeds ATU Proposal 3 directly. |
| Hispanic business directory | A collection: curated, ordered membership over existing listings with a maker attribution (Eleva). Section 05 already designed collections; the seam is a `collections` + `collection_members` pair or a records-based equivalent. The directory filter chip and the creation's module both read the same collection. |
| Now-playing bar + sheet player | Shell-owned playback state (one audio element, one store). The swap placement means the ask band and the player are the same slot in the shell layout. Scrub position persists across navigation; nothing in a creation ever owns the audio element. |
| Eleva creation | A standard creation bundle. Manifest permissions: `town.directory` read (for the collection module), `town.items` read (episodes), plus a playback request channel to the host player (new SDK surface: `player.play(episodeId)` rather than guest-owned audio, so the bar keeps working when the creation closes). Custom skin ships as the guest's own CSS; review gate per the approved policy. |
| Feed ingestion | A podcast RSS adapter in `packages/feed` pointed at `https://feeds.transistor.fm/eleva` (canonical). Known feed quirks to handle or fix upstream: `<language>` says `en` and should be `es`; the `<link>` points at the dead Castopod on `shows.rvtownsquare.com`; the show is absent from Apple Podcasts. Only 2 of the recent 8 episodes carry per-episode art, so cover fallback to show art is required behavior, not an edge case. |
| Transport glyphs | Section 13 mints `i-ls-back15`, `i-ls-fwd30`, `i-ls-speed`, `i-ls-rss` locally. Promote to the shared sprite when the player ships. |

## Open items

- Which sub fonts Tal dislikes. Candidates, most likely first: the 10px DM Mono
  uppercase eyebrows, small DM Sans utility text. Ask him with one screen open;
  it is a token-level change either way.
- Collection curation criteria for Hispanic-owned Russellville: what earns a
  listing, who besides Eleva can nominate, how an owner self-identifies. Ask
  Obee.
- Sub-show formalization: the series chips render fine without it, but Obee
  naming the series (Real estate roundtable, Devotionals, Events) would let the
  adapter tag episodes on ingest instead of by hand.
- Cover art per series, or one Eleva mark across everything. Also from Obee.
- Bilingual pass: reintroduce the language tag (design says a small mono tag in
  the medium-tag slot), and decide whether shell UI follows the device locale.

## ATU tie-in

Proposal 3 (community discovery engine) promises search across businesses,
events, articles and podcasts. The episode content type and the
episode-to-listing relation above are exactly the rows that corpus needs, so
shipping them unblocks the capstone team without any coupling to the Eleva
creation itself.
