# Section authoring contract

You own exactly two files: `sections/NN-<id>.html` and `sections/NN-<id>.css`.
Do not touch `tokens.css`, `base.css`, `build.mjs`, `check.mjs`, the generated
pages at the top of `site/`, or anyone else's section. Every `*.html` beside
`build.mjs` is generated; editing one does nothing.

The site is twelve pages behind a fixed left panel, one section per page. Your
section is the whole page, so it opens cold and has to stand on its own. Do not
write a transition into the next section; the reader may have jumped here from
the panel. The build adds the panel and the Back/Next pager around you.

Your working width is the content column, not the window: about 1320px at a
1600px recording width.

## The seven hard rules

`check.mjs` enforces these and the build fails if you break them.

1. **No raw colour in your stylesheet.** No hex, no `rgb()`, no named colours.
   Every colour resolves through a `--ts-*` token from `tokens.css`. This is what
   lets a future town reskin the whole site.
2. **Every class you invent starts with `s-<id>`.** If your section id is
   `ownership`, your classes are `.s-ownership-grid`, `.s-ownership-quote`, and
   so on. Shared primitives from `base.css` are exempt (listed below).
3. **No `<style>` and no `<script>` in your HTML.** CSS goes in your `.css`.
4. **No external requests.** No Google Fonts, no CDNs, no remote images. This
   site must render perfectly with the network off.
5. **Your root element carries the section id.** It is the page anchor.
6. **Fluid sizes use `cqi`, never `vw`.** The panel takes 17.5rem off the
   window, so `vw` overshoots. `5cqi` is 5% of the content column.
7. **No monospace.** There is no mono face on this site. Labels, eyebrows,
   kickers and captions are `var(--ts-sans)`, uppercase, tracked out. They earn
   their place through case, size, tracking and colour, not a typewriter face.

## Your HTML shape

```html
<section class="section" id="your-id">
  <div class="wrap">
    <p class="eyebrow">Short label</p>
    <h2 class="h2">The headline</h2>
    <p class="lead">One or two sentences of setup.</p>
    <!-- your own .s-your-id-* markup below -->
  </div>
</section>
```

Add `section--alt` (cream) or `section--invert` (navy) to the root for rhythm.
Your assigned background is in your brief; keep it, it is how the page breathes.
Wrap major blocks in `class="reveal"` for the scroll-in animation.

## Shared primitives you may use freely

Layout: `.wrap` `.wrap-narrow` `.section` `.section--alt` `.section--invert`
`.section--tight` `.grid` `.grid-2` `.grid-3` `.grid-4` `.split`

Type: `.eyebrow` `.eyebrow--plain` `.h1` `.h2` `.h3` `.lead` `.body` `.accent`
`.gold` `.rule` `.hairline`

Components: `.card` `.card__k` `.card--invert` `.figure` `.figure--bare`
`.reveal`

Useful tokens beyond colour: `--ts-serif` `--ts-sans`,
`--ts-t-hero|h1|h2|h3|lead|body|small|label`, `--ts-gutter` `--ts-section-y`
`--ts-measure` `--ts-max`, `--ts-radius` `--ts-radius-lg`,
`--ts-shadow-sm|md|lg`, `--ts-ease` `--ts-dur`.

## Assets on disk

Paths are relative to `site/`, so use them exactly as written:

- `assets/mark.png` — the Town Square mark
- `assets/diagrams/1-three-layers.png`
- `assets/diagrams/2-information-flow.png`
- `assets/diagrams/3-compounding-loop.png`
- `assets/diagrams/4-org-chart.png`
- `assets/diagrams/5-student-pipeline.png`
- `assets/screens/gallery.png` — "Built by neighbors", Marta Keener's camera map
- `assets/screens/creation-detail.png` — a creation running inside the app
- `assets/screens/resident-as-builder.png` — a resident's builder profile
- `assets/screens/today-with-pins.png` — creations pinned into the town feed
- `assets/town-square-russellville.pdf` — the 17-slide deck

Diagrams are 1600x900 and already carry their own title and caption, so do not
add a duplicate heading directly above one. Screens are tall phone captures.

## Voice

Read `../problem-statement.md` for the register. Plain, direct, warm, confident.
Short sentences. **No em dashes, ever.** Never invent a statistic, a quote, or a
person's name. Do not use the words "substrate" or "front door". It is a town
square.

This is being screen-recorded as a walkthrough for real community partners and
university faculty, so it has to look genuinely premium and read as a community
plan rather than a startup pitch.

## Craft bar

Content should be legible at 1440px wide and hold up at 1280px. Prefer real
structure (comparison tables, numbered stacks, pull quotes, side-by-side) over a
wall of paragraphs. Every section should have one clear visual idea, not five
competing ones. Responsive down to 900px is enough; nobody is recording on a
phone.

## Before you finish

Write your two files to disk **early**, even if rough, then iterate on them in
place. A partial section on disk is worth far more than a perfect one you are
still holding. Then run, from the repo root:

```sh
node coalition/site/check.mjs
```

Fix anything it reports about your files, and report back briefly: your section
id, what you built, and anything you deliberately left out.
