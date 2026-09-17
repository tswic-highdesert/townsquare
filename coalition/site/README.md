---
type: reference
title: Coalition site
status: active
created: 2026-08-06
---

# Coalition site

A Town Square branded walkthrough of the whole coalition package, built to be
screen-recorded and sent to community partners and ATU faculty.

It is a **twelve page site with a fixed left panel**, not one long scroll. Each
page holds one idea. The panel is always visible, so anyone can jump straight to
the part that concerns them instead of scrolling past everything else.

**Fully offline.** Fonts, images, and the deck PDF are all local. No network
request is made, so it renders identically with the wifi off.

## Open it

```sh
open coalition/site/index.html
```

That works because everything is relative and the page links are plain files.
If you would rather serve it (needed only if a browser blocks local file
access):

```sh
python3 -m http.server 8080 --directory coalition/site
# then http://localhost:8080
```

## Recording notes

- Built and reviewed at **1600x900**. That is the size to record at.
- The left panel stays put on every page. The current page is highlighted, the
  group headings tell you where you are in the argument.
- **Left and right arrow keys** walk the book, so a narrated run needs no
  mouse. Every page also ends with Back and Next.
- Blocks fade in on scroll. Scroll at a steady, unhurried pace or the reveals
  will trip over each other. `prefers-reduced-motion` disables them entirely.
- Longest page is roughly 4,700px. A full narrated pass is 12 to 15 minutes.
- Under 1100px the panel collapses into a top bar with a drawer. Nobody is
  recording that way, but it does not break.
- Print stylesheet included, so Cmd+P gives a reasonable PDF of a single page.

## The twelve pages

| # | File | Group | What it does |
| --- | --- | --- | --- |
| — | `index.html` | | Title. Navy. |
| 01 | `problem.html` | The case | No town square anymore. The three things the room said. |
| 02 | `how-we-got-here.html` | The case | The attention giveaway. Megaphone and archive. Navy. |
| 03 | `failures.html` | The case | Why the five usual answers keep failing. |
| 04 | `answer.html` | The answer | The three layers, and no ads so nothing is hidden. |
| 05 | `build-layer.html` | The answer | The real product screens. The proof beat. |
| 06 | `compounds.html` | The answer | The loop, then community memory. |
| 07 | `ownership.html` | The answer | Nobody should own a town square. The harm. The ATU research ask. Navy. |
| 08 | `coalition.html` | The plan | ATU, the room, the org chart, the pipeline, the timeline. |
| 09 | `proposals.html` | The plan | All seven capstone projects with honest status. |
| 10 | `ask.html` | The ask | Four asks by audience. Navy. |
| 11 | `close.html` | The ask | The state of it. "It needs the town." |

## Rebuilding

Run from the **repo root**, not from inside `site/`.

```sh
node coalition/site/build.mjs     # sections/ -> 12 pages + sections.css
node coalition/site/check.mjs     # enforce the authoring contract
node coalition/site/shot.mjs      # one full-page PNG per page into site/_review/
node coalition/site/shot.mjs fold # ...plus the first screen of each page
```

Every `*.html` at the top of `site/` and `sections.css` are **generated**.
Editing them does nothing; edit the files in `sections/` and rebuild.

## Editing

Each section owns exactly two files, `sections/NN-<id>.html` and its `.css`.
The rules are in [AUTHORING.md](AUTHORING.md) and `check.mjs` enforces the two
that matter: no raw colour in a section stylesheet (everything resolves through
a `--ts-*` token, which is what makes a per-town reskin possible) and every
class carries its section prefix (the site has many authors).

## Changing the page structure

Everything about the book lives in the `PAGES` array at the top of `build.mjs`.
Each entry is one page:

```js
{ slug: 'ownership',      // ownership.html
  part: 'The answer',     // panel group heading
  label: 'Ownership',     // panel label and pager label
  title: 'Ownership',     // browser title
  sections: ['08-ownership'] }  // section files, in order
```

- **Reorder pages** by moving entries. Panel numbering and Back/Next follow.
- **Split a page** by giving one section its own entry.
- **Combine pages** by listing several sections on one entry, e.g.
  `sections: ['09-coalition', '10-proposals']`.
- **Regroup** by changing `part`. A new value starts a new panel group.

The build prints `UNPLACED sections` if a file in `sections/` is not on any
page, so nothing goes missing silently.

Fluid type and spacing are sized in `cqi` against the content column, not `vw`
against the window, because the panel takes 17.5rem off the width. That is set
by `container-type` on `.page` in `base.css`. Keep using `cqi` in section CSS.

## Refreshing the assets

The diagrams and screens under `assets/` are copies. If the originals change:

```sh
python3 coalition/diagrams/build.py && node coalition/diagrams/render.mjs
cp coalition/diagrams/*.png coalition/site/assets/diagrams/
cp coalition/screens/*.png  coalition/site/assets/screens/
cp coalition/deck/town-square-russellville.pdf coalition/site/assets/
```

`_review/` is scratch output from `shot.mjs` and is not part of the site.
