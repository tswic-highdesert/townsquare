---
type: proposal
title: Civic Meeting Tracker
status: draft
created: 2026-08-06
---

# Proposal 1: Civic Meeting Tracker

Form-ready answers for <https://forms.cloud.microsoft/r/WcXzRTeueQ>

## Organization and primary contact

Town Square (Russellville)
Tal Swicegood
tal@rvtownsquare.com

## Brief description of the problem or opportunity

Russellville residents have no practical way to know what their local government
is about to decide. City Council, the School Board, the Pope County Quorum
Court, and the Planning Commission each post agendas and minutes on their own
schedule, in their own format, usually as PDFs, on separate websites. A resident
who wants to follow a single issue across those bodies has to check four sites
on four cadences and read documents written for the record rather than for the
public.

The practical result is that decisions are effectively invisible until after
they are made. This is the "improved access to information" need identified in
ATU's Community Health Needs-Finding Workshop, in its most concrete form.

The opportunity is a single tracker that gathers agendas, meeting times, and
outcomes from every local governing body, makes them searchable in plain
language, and lets a resident follow a topic instead of an institution.

## Intended users and desired outcomes

**Primary users:** Russellville residents who want to follow a specific local
issue such as a rezoning, a school policy, or a utility rate change.

**Secondary users:** local nonprofits and small businesses that need advance
notice of decisions affecting them, and local journalists.

**Desired outcomes:**

- A resident can see everything scheduled across all local governing bodies in
  one view, without visiting any government website.
- A resident can follow a topic and be notified when it appears on any agenda.
- Past decisions are searchable, so "what did the council decide about this"
  has an answer that takes seconds rather than an afternoon.
- Coverage of at least four governing bodies with automated, scheduled updates.

## Major features or project goals

1. Automated ingest of agendas, minutes, and meeting schedules from at least
   four local governing bodies, tolerant of inconsistent formats and outages.
2. A normalization layer that turns heterogeneous PDFs and web pages into
   structured, typed records: meeting, agenda item, and decision.
3. Full-text and topic search across current and historical items.
4. Topic subscriptions with notification when a followed subject appears on a
   new agenda.
5. Plain-language summarization of agenda items, an appropriate and
   well-scoped application of AI-enabled decision support.
6. Publication as a Town Square creation, so the structured meeting records
   become reusable civic data rather than a single-purpose website.

## Technical constraints, resources, and special considerations

**Resources provided by the partner on day one:**

- A running production platform (Town Square) with hosting, authentication,
  database, and a public deployment target. Students do not stand up
  infrastructure.
- A documented, versioned SDK plus an MCP server that connects directly to the
  team's own AI development tools.
- A complete design system with tokens and components, so the team is not
  blocked on visual design.
- A code review and release pipeline with a real approval gate.
- A technical partner available weekly who ships on this codebase daily.

**Technical challenges appropriate to senior computing students:**

- Resilient ingest against sources that change format without notice, go down,
  or publish malformed documents. Retry, backoff, and partial-failure handling
  are genuinely required, not decorative.
- Schema design for civic records that must stay stable as sources change.
- Document parsing and entity extraction from unstructured PDFs.
- Evaluating summarization quality, including the question of how a system
  should behave when it is not confident. Getting this wrong in a civic context
  has real consequences, which makes it an unusually good teaching problem.

**Feasibility within one academic year:**

- *Fall:* source survey, schema design, ingest for one governing body end to
  end, and a working prototype of the unified view.
- *Spring:* remaining three bodies, search, subscriptions, summarization, and
  hardening.

Scope is adjustable in both directions. Two governing bodies with excellent
ingest is a successful project; four with subscriptions and summarization is an
excellent one.

**Considerations:**

- All source material is public record, so there are no confidentiality or
  licensing constraints.
- The project is built as a sandboxed application on existing infrastructure.
  The partner owns hosting and maintenance from day one and after the course
  ends, so nothing is orphaned at project completion.
