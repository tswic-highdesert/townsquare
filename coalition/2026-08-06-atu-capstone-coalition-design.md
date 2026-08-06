---
type: spec
title: ATU Capstone and Community Coalition
status: active
created: 2026-08-06
---

# ATU Capstone and Community Coalition

How Town Square converts the 2026-08-06 ATU workshop into committed partners,
a funded student workforce, and a communication package the community can read.

## Origin

On 2026-08-06, Tal attended the **ATU CCEAO Community Problem-Solving
Workshop** at the Co-Create Innovation Hub, 215 South Main Street, Russellville.
The workshop was convened by Debra Fithen (Project Coordinator, ATU Center for
Community Engagement & Academic Outreach) and sponsored by AR-NETWORK, with
Computing Sciences faculty Becky Cunningham and Dr. Robin Ghosh, and sociology
faculty Dr. Julie Mikles-Schluterman.

Going around the room, participants independently named the problems Town Square
exists to solve: people are not involved, people do not know what is happening,
and it costs money just to send an email. The invitation itself, summarizing a
prior Community Health Needs-Finding Workshop, names the same set:

> improved access to information, stronger communication about available
> services, transportation coordination, resource mapping, data collection

That sentence is ATU's own language for Town Square's problem statement, and it
predates our involvement. It is the single most useful asset from this meeting,
because it means the problem is already institutionally documented by someone
other than us.

## The room

The workshop distribution list is the seed coalition. These are real
organizations that showed up to a meeting about community technology problems.

| Person | Organization |
| --- | --- |
| Debra Fithen | ATU CCEAO (convener) |
| Becky Cunningham | ATU Computing Sciences (capstone faculty) |
| Dr. Robin Ghosh | ATU Computing Sciences (capstone faculty) |
| Dr. Julie Mikles-Schluterman | ATU Sociology |
| Susan West | ATU |
| Wesley Duke | ATU |
| Christopher Housenick | ATU |
| Brett Stone | ATU |
| Obee Rosales | Co-Create Innovation Hub |
| Donna Smith | Russellville Housing Authority (Director) |
| Jim Bob Humphrey | Humphrey Funeral Service |
| Main Street Russellville | Main Street Russellville |
| J. Balaster | Arkansas Advanced Energy Association |
| Noemi Rubio | Noemi Rubio Financial |
| Meagan Beerman | Emerging Hope Therapy |
| Tal Swicegood | Town Square |

Housing Authority, Main Street, and a therapy practice are three different
flavors of the same unmet need, and each one is a plausible founding org.

## Hard facts that constrain the design

From the ATU Computing Sciences Capstone Project Partner Guide and Debra's
invitation. These replace earlier assumptions.

- **Submission is a Microsoft Form**, not a pitch:
  <https://forms.cloud.microsoft/r/WcXzRTeueQ>. It asks for organization and
  contact, a description of the problem, intended users and desired outcomes,
  major features or goals, and known constraints.
- **Timeline is fixed.** Teams formed and projects selected late August to early
  September. Selected partners contacted by mid-September. Teams work September
  through April. April ends in final delivery and a **public showcase**.
- **Two semesters.** Fall is requirements, proposed solution, and an early
  prototype. Spring is development, testing, and final presentation.
- **Selection is competitive.** Evaluated on educational value, technical rigor,
  feasibility within the academic year, resource availability, and alignment
  with course learning outcomes. *Submission does not guarantee selection.*
- **No post-project support.** Students and faculty own nothing after the course
  ends. The partner owns hosting, maintenance, security, and all further
  development.
- **Deliverable quality is explicitly a range**, from proof-of-concept prototype
  to production-ready application.
- **Interdisciplinary work is explicitly encouraged**, which is what makes the
  Mikles-Schluterman connection load-bearing rather than decorative.

### What those facts imply

The "no post-project support" clause is the whole ballgame. Anything students
build becomes Tal's maintenance burden the day the course ends. That is an
argument against handing them core platform work and an argument for having them
build **creations**: sandboxed mini-apps that are already isolated by design, and
whose abandonment costs the platform nothing.

Competitive selection plus Debra's explicit invitation to submit more than one
idea means the correct move is **three separate proposals, not one**. Each
proposal is independently viable, and landing any one of them is a win. Landing
two or three is a program.

## Strategy

**Students build creations on Town Square, never Town Square itself.**

Town Square already shipped the machinery this requires: the MCP builder door
(Phase 6, 2026-08-05, 17 tools) and the admin review queue (Phase 7a,
2026-08-05). A student team connects their own AI tool to the MCP server, builds
against a frozen SDK, and submits through the same review queue as any resident.

This produces four things at once:

1. **A structural non-blocking guarantee.** Creations are sandboxed. A team that
   stalls, or ships nothing, cannot slow the platform down. This is not a
   promise about student quality, it is an architectural property.
2. **Free accountability.** "Did the team deliver" has a binary, dated answer:
   did their exact version pass review. The academic deadline and the platform
   gate are the same event. Faculty get a grading artifact.
3. **Thesis validation.** Town Square's entire bet is that residents will build
   on it. Four student teams building on it is the first real evidence, and it
   arrives with a public showcase in April.
4. **Free QA on the newest, least-exercised surface.** The MCP door and review
   queue have never met an outside user. Four teams is a load test we cannot buy.

The one exception worth allowing is the CLI and starter templates, which is core
work but purely additive, developer-facing, and harmless if late.

## Deliverables

### 1. Capstone proposals (urgent, due within ~3 weeks)

Three to four proposals submitted through the Project Idea Form, each written to
ATU's stated selection criteria rather than to Town Square's roadmap. Each one
is drafted as a standalone markdown file in `coalition/proposals/` containing
the exact answers to paste into the form.

Every proposal must explicitly address:

- **Educational value:** what a senior computing student learns.
- **Technical rigor:** the genuinely hard part, named.
- **Feasibility:** why it fits two semesters, with a fall milestone and a spring
  milestone.
- **Resources provided:** what Tal supplies on day one. This is the strongest
  differentiator available, because most community partners will arrive with an
  idea and nothing else. Town Square arrives with a running platform, an SDK,
  hosting, a review queue, real data, and a technical partner who ships daily.

### 2. Problem statement

One page, in the community's own words, usable as the front of the deck, the
body of the form, and a standalone handout. Built from the AR-NETWORK needs list
plus what the room said, not from our vision doc.

### 3. Deck: "Town Square, Russellville"

Fourteen slides, three acts, per the approved shape.

- **Act 1 (1-4), the problem is already agreed on.** Title. The room's words.
  The reframe: not three problems but one, because the town has no shared front
  door, so every org rebuilds a tiny audience forever. Why the alternatives fail:
  Facebook groups are rented land with an algorithm in between, local news is
  thinning, the city site is built for compliance not communication, email lists
  are expensive, one-way, and siloed.
- **Act 2 (5-10), what it is.** One sentence, then the three-layer diagram.
  Aggregation. Directory, with 741 real Russellville listings already loaded so
  it is not hypothetical. Then the build layer, carried by four hi-fi screens
  showing a resident-built app running inside Town Square, because that is the
  one part nobody in the room has seen before. Then examples. Then the
  compounding slide.
- **Act 3 (11-14), the ask.** Who owns it: open source, local committee. The org
  chart. A specific ask per audience, not one generic ask. Nonprofits become
  founding orgs. Faculty put a team on a brief. Community leaders seed the
  vouching cohort, which is the residency verification already decided in
  `residency-verification.md`. Then the September-to-April timeline.

Tone constraint: this is a community plan that happens to have working software
behind it, not a pitch deck. That room was not evaluating a vendor.

### 4. Diagrams (5)

1. **Three layers.** Vertical stack. The anatomy.
2. **Before and after information flow.** Before: many orgs broadcasting into
   fragmented pockets, most residents reached by none. After: orgs publish into
   one substrate, residents discover across all of it.
3. **The compounding loop.** Resident builds a creation, the creation writes
   typed records back, those records become the next builder's input. This is
   the actual thesis and it currently exists only as prose.
4. **Coalition org chart.**
5. **Student pipeline.** Brief, build, review queue, live. Drawn parallel to
   core rather than beneath it, so non-blocking is visible instead of asserted.

### 5. Org chart

A coalition map, not a company chart.

- **Town Square Committee.** Governance, moderation, the revert button. Tal is
  sole member at launch, designed for three to five community members.
- **Core platform.** Tal plus AI. Substrate, SDK, review queue.
- **Contributor lanes, parallel to core and not beneath it.** ATU CS capstone
  teams building creations. ATU sociology under Dr. Mikles-Schluterman doing
  research and adoption. Founding community orgs supplying content,
  distribution, and seed users. Open resident builders via the MCP door.
- **Connectors.** Debra Fithen and the CCEAO, the civic bridge that opened this.

The visual argument of the chart: remove any contributor lane and the platform
still stands.

## Sequencing

The capstone deadline is roughly three weeks out and the deck is not on its
critical path. The form asks for a problem description, not a presentation.

1. Proposals drafted and submitted. Hard deadline early September.
2. Problem statement, which the proposals reuse.
3. Diagrams.
4. Deck assembled from 2 and 3.
5. Org chart, delivered inside the deck and standalone.

The deck's real deadline is the mid-September partner contact, when Tal meets
whichever teams get assigned, and any coalition follow-up with the orgs in the
room.

## Open questions

- Whether the Flock camera brief goes on the table. Politically warm, and the
  decision is Tal's alone.
- Whether to name Town Square or lead with the problem in the form itself.
  Recommendation: lead with the problem, because selection is by educational and
  technical merit, not by how compelling the org sounds.
- Whether Dr. Mikles-Schluterman's sociology students are a separate capstone
  track with its own submission path, or an informal collaboration. Unknown, and
  worth one email to find out.

## Related

- `VISION.md` is the source of truth for what Town Square is.
- `spec-manifest-and-sdk.md` is the contract students build against.
- `creation-authoring.md` covers the MCP route and review flow.
- `residency-verification.md` covers vouching, which the coalition seeds.
- `design/hifi-v2/` supplies the screens for the deck's proof beat.
