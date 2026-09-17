---
type: index
title: Coalition
status: active
created: 2026-08-06
---

# Coalition

Everything for turning the 2026-08-06 ATU workshop into committed partners and a
student workforce. Design and reasoning:
[`2026-08-06-atu-capstone-coalition-design.md`](2026-08-06-atu-capstone-coalition-design.md).

## The urgent thing

**ATU selects capstone projects late August to early September 2026.** Proposals
go through the Project Idea Form: <https://forms.cloud.microsoft/r/WcXzRTeueQ>

Six drafted, form-ready, in [`proposals/`](proposals/). Recommended slate is 1,
2, and 3. Read [`proposals/README.md`](proposals/README.md) for the menu and the
reasoning.

## What is here

| Path | What it is |
| --- | --- |
| `2026-08-06-atu-capstone-coalition-design.md` | The spec. Origin, the room, hard facts from ATU, strategy, sequencing. |
| `problem-statement.md` | One page in the community's own words. Feeds the deck, the form, and grant applications. |
| `proposals/` | Six capstone proposals, form-ready. |
| `deck/town-square-russellville.pdf` | 8-slide deck, aimed at ATU capstone faculty. |
| `deck/deck.html` | Deck source. Edit this, then re-render. |
| `deck/_previous-17-slide-deck.{html,pdf}` | The earlier 17-slide coalition deck, kept for reference. |
| `deck/slides/` | Per-slide PNGs, for dropping a single slide into an email. |
| `diagrams/` | Five SVG diagrams plus PNG renders. |
| `screens/` | App screens captured from `design/hifi-v2`, used in the deck. |

## Rebuilding

Run both from the **repo root**, not from inside `coalition/`.

```sh
python3 coalition/diagrams/build.py     # SVG diagrams
node coalition/diagrams/render.mjs      # SVG -> PNG (needs @playwright/test)
node coalition/deck/render.mjs          # deck -> PDF + per-slide PNGs
```

The diagram PNGs are what the deck embeds, so re-render diagrams before the deck
if you change them.

## Key people

| Person | Role | Email |
| --- | --- | --- |
| Debra Fithen | ATU CCEAO, Project Coordinator. Convened the workshop. | dfithen@atu.edu |
| Becky Cunningham | ATU Computing Sciences, capstone faculty | rcunningham@atu.edu |
| Dr. Robin Ghosh | ATU Computing Sciences, capstone faculty | rghosh@atu.edu |
| Dr. Julie Mikles-Schluterman | ATU Sociology. The interdisciplinary door. | jmiklesschluterman@atu.edu |

Full workshop attendee list, which is the seed coalition, is in the design doc.

## Open decisions

- Which proposals get submitted. Recommendation is 1, 2, 3.
- Whether the Flock transparency map (5) goes on the table. Political, not
  technical, and Tal's alone.
- Whether Donna Smith at Russellville Housing Authority will co-sign proposal 4,
  which would make it the strongest on the list.
- Whether Dr. Mikles-Schluterman's sociology students are a separate capstone
  track with their own submission path. Worth one email.
