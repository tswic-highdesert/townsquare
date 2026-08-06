---
type: reference
title: Coalition site
status: active
created: 2026-08-06
---

# Coalition site

A Town Square branded single-page walkthrough of the whole coalition package,
built to be screen-recorded and sent to community partners and ATU faculty.

**Fully offline.** Fonts, images, and the deck PDF are all local. No network
request is made, so it renders identically with the wifi off.

## Open it

```sh
open coalition/site/index.html
```

That works because everything is relative. If you would rather serve it (needed
only if a browser blocks local file access):

```sh
python3 -m http.server 8080 --directory coalition/site
# then http://localhost:8080
```

## Recording notes

- Built and reviewed at **1600x900**. That is the size to record at.
- Sections fade in on scroll. Scroll at a steady, unhurried pace or the reveals
  will trip over each other. `prefers-reduced-motion` disables them entirely if
  you would rather have none.
- The top nav is sticky with a scroll-progress bar, and the current section
  highlights as you pass it. Nav links jump if you want to skip around.
- The page is ~36,000px tall, roughly a 12 to 15 minute walkthrough at a
  comfortable narration pace.
- Print stylesheet included, so Cmd+P gives a reasonable PDF if anyone wants one.

## The twelve sections

| # | id | What it does |
| --- | --- | --- |
| 1 | `hero` | Title. Navy. |
| 2 | `problem` | No town square anymore. The three things the room said. |
| 3 | `how-we-got-here` | The attention giveaway. Megaphone and archive. Navy. |
| 4 | `failures` | Why the five usual answers keep failing. |
| 5 | `answer` | The three layers, and no ads so nothing is hidden. |
| 6 | `build-layer` | The real product screens. The proof beat. |
| 7 | `compounds` | The loop, then community memory. |
| 8 | `ownership` | Nobody should own a town square. The harm. The ATU research ask. Navy. |
| 9 | `coalition` | ATU, the room, the org chart, the pipeline, the timeline. |
| 10 | `proposals` | All seven capstone projects with honest status. |
| 11 | `ask` | Four asks by audience. Navy. |
| 12 | `close` | The state of it. "It needs the town." |

## Rebuilding

Run from the **repo root**, not from inside `site/`.

```sh
node coalition/site/build.mjs    # sections/ -> index.html + sections.css
node coalition/site/check.mjs    # enforce the authoring contract
node coalition/site/shot.mjs     # per-section PNGs into site/_review/
node coalition/site/shot.mjs full # ...plus one tall full-page PNG
```

`index.html` and `sections.css` are **generated**. Editing them does nothing;
edit the files in `sections/` and rebuild.

## Editing

Each section owns exactly two files, `sections/NN-<id>.html` and its `.css`.
The rules are in [AUTHORING.md](AUTHORING.md) and `check.mjs` enforces the two
that matter: no raw colour in a section stylesheet (everything resolves through
a `--ts-*` token, which is what makes a per-town reskin possible) and every
class carries its section prefix (the page has many authors).

To reorder sections, rename the number prefix on both files. To add or rename a
nav entry, edit the `NAV` array at the top of `build.mjs`.

## Refreshing the assets

The diagrams and screens under `assets/` are copies. If the originals change:

```sh
python3 coalition/diagrams/build.py && node coalition/diagrams/render.mjs
cp coalition/diagrams/*.png coalition/site/assets/diagrams/
cp coalition/screens/*.png  coalition/site/assets/screens/
cp coalition/deck/town-square-russellville.pdf coalition/site/assets/
```

`_review/` is scratch output from `shot.mjs` and is not part of the site.
