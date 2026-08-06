---
type: proposal
title: Measuring the Local Information Gap and What It Costs
status: draft
created: 2026-08-06
---

# Proposal 7: Measuring the Local Information Gap and What It Costs

Form-ready answers for <https://forms.cloud.microsoft/r/WcXzRTeueQ>

**Status note:** this is the interdisciplinary one, and it is the only proposal
on the list that produces knowledge rather than software. The partner guide
explicitly encourages interdisciplinary projects, and Dr. Julie
Mikles-Schluterman was in the August 6 room, so the sociology pairing is
available rather than hypothetical.

Framed deliberately so it is a **real computing project**, not a survey with a
website attached: the students build the collection instrument, the linkage, and
the analysis pipeline. The sociology side owns methodology and interpretation.
Send this one to Becky Cunningham and Dr. Ghosh **and** Dr. Mikles-Schluterman
together.

## Organization and primary contact

Town Square (Russellville)
Tal Swicegood
tal@rvtownsquare.com

*Proposed academic co-partner:* Dr. Julie Mikles-Schluterman, ATU Sociology

## Brief description of the problem or opportunity

Over the last two decades, the way a community talks to itself changed
completely. Local newspapers thinned. Radio consolidated. The shared channels
that used to carry local information were replaced by national platforms that
decide, algorithmically and commercially, who sees what.

Everyone involved in community work in Russellville can describe the
consequences anecdotally. Nonprofits report that they cannot reach the people
they serve without paying for it. Organizers report declining participation.
Service providers report that people do not know help exists until it is too
late to use it.

**Nobody has measured it here.** There is no local baseline for how information
actually moves through this community, who is being missed, or what it costs
when a message does not arrive. Without that baseline, every intervention
including ours is a guess, and no funder can be shown a number.

The opportunity is to build the instrument that produces that number: a system
for collecting, linking, and analyzing local information-flow data, and a first
study that uses it.

## Intended users and desired outcomes

**Primary users:** local nonprofits, service providers, and civic organizations
who need evidence of unmet communication need for their own planning and their
grant applications.

**Secondary users:** city and county decision makers; ATU researchers; other
Arkansas communities facing the same conditions.

**Desired outcomes:**

- A documented, repeatable picture of how information actually reaches
  Russellville residents, and which populations it does not reach.
- Quantified estimates of the consequences when it does not: services not used,
  events not attended, deadlines missed, help not found in time.
- A reusable instrument, so this can be run again in two years and compared, and
  run in another town for contrast.
- Findings published in a form that residents and boards can read, not only in a
  form academics can read.

## Major features or project goals

1. **A survey and intake platform** supporting multiple modes, since a study
   about who gets missed cannot itself only reach people who are online. Web,
   assisted phone entry, and paper transcription must all land in one dataset.
2. **An organizational reporting tool** where participating nonprofits log real
   reach data over the study period: what they tried to communicate, through
   which channels, at what cost, and what response they got.
3. **A record linkage and analysis pipeline** joining survey responses,
   organizational reach data, and public data such as service utilization,
   participation, and turnout, without ever storing identifying information.
4. **A privacy-preserving design**, since the study asks about hardship. Data
   minimization, de-identification, and disclosure control are architectural
   requirements, and a public university study makes IRB review a real
   constraint the team must design around.
5. **An analysis and visualization layer** that turns the dataset into findings
   a board member can act on.
6. **A published methodology and open instrument** so the study is repeatable
   here and portable elsewhere.

## Technical constraints, resources, and special considerations

**Resources provided by the partner on day one:**

- A running production platform with hosting, authentication, database, and a
  public deployment target.
- Introductions to real local organizations willing to participate as study
  subjects and data contributors, drawn from the August 6 workshop coalition.
- Existing structured data on the local information landscape, including a
  directory of 741 verified Russellville organizations and businesses, which is
  a ready-made sampling frame.
- A technical partner available weekly.
- Sociology faculty partnership for instrument design and interpretation, if
  Dr. Mikles-Schluterman's students participate.

**Technical challenges appropriate to senior computing students:**

- Multi-modal data collection that produces one coherent dataset from web,
  phone, and paper, including reconciliation and deduplication.
- Record linkage across sources with no shared identifier, which is a real and
  well-studied computing problem with no easy answer.
- Privacy engineering under genuine constraints: de-identification, k-anonymity
  or equivalent disclosure control, and defending those choices to an IRB.
  Students rarely get to design against a real ethics review.
- Analysis and visualization of messy survey data, including honest handling of
  non-response bias, which is the central methodological threat to a study about
  people who are hard to reach.
- Building for reuse rather than for one run.

**Feasibility within one academic year:**

- *Fall:* landscape review, instrument design with sociology faculty, IRB
  preparation, and a working multi-modal collection platform.
- *Spring:* fielding the study with partner organizations, linkage and analysis
  pipeline, findings, visualization, and publication.

Scope flexes cleanly. Building a validated, IRB-approved, multi-modal instrument
and fielding a limited pilot is a complete and successful project even if the
full analysis lands after April.

**Considerations:**

- **IRB review is a hard dependency and a schedule risk.** It must start in the
  fall, not the spring. Faculty should scope with that in mind.
- The study asks about hardship and unmet need, so the ethical bar is high and
  the data minimization requirement is real rather than nominal.
- The partner has an obvious interest in the findings, which is a bias worth
  naming up front. The instrument and methodology should be designed so the
  results are credible **regardless of** whether they favor the partner's
  thesis. If the finding is that the information gap is small, that is a
  legitimate and useful result, and the study should be built so it could
  return that answer.
- Built on infrastructure that is already maintained. The partner owns hosting
  during and after the course, so the instrument survives the semester.
