---
type: proposal
title: Community Discovery Engine
status: draft
created: 2026-08-06
---

# Proposal 3: Community Discovery Engine

Form-ready answers for <https://forms.cloud.microsoft/r/WcXzRTeueQ>

## Organization and primary contact

Town Square (Russellville)
Tal Swicegood
tal@rvtownsquare.com

## Brief description of the problem or opportunity

Russellville produces far more than residents ever see. Businesses, local
articles, podcasts, events, church and school activities, civic notices. The
information exists, scattered across dozens of sources. Search only helps a
resident who already knows what to type, which means the entire long tail of
local life is invisible to anyone not already connected to it.

Newcomers feel this hardest. So does any resident whose social circle does not
happen to overlap with the thing they would have loved to know about.

This is the "resource mapping" and "data collection" pair from ATU's Community
Health Needs-Finding Workshop, approached as a computing problem: how do you
help someone find the thing they did not know to look for?

## Intended users and desired outcomes

**Primary users:** Russellville residents, especially newcomers and anyone
outside the established social networks that currently carry local information
by word of mouth.

**Secondary users:** local businesses and organizations that are invisible to
residents who would want them.

**Desired outcomes:**

- A resident discovers relevant local businesses, events, articles, and
  podcasts without knowing what to search for.
- Search works across every content type at once rather than per-silo.
- Related items surface automatically, so one discovery leads to the next.
- Measurable improvement over keyword search, demonstrated with a real
  evaluation rather than asserted.

## Major features or project goals

1. Unified search across heterogeneous content types with a single ranked result
   set, which is a harder ranking problem than it appears.
2. Semantic search, so a resident describing what they want in their own words
   finds it without matching keywords.
3. Automatic tagging and categorization of items lacking useful metadata.
4. A related-items engine surfacing genuine connections across content types,
   for example linking a business to an article that mentions it.
5. A recommendation surface for browsing without a query at all, which is the
   core discovery case and the hardest one.
6. An evaluation harness with a labeled relevance set, so ranking changes are
   measured rather than guessed at. This is the part that turns a good student
   project into a rigorous one.

## Technical constraints, resources, and special considerations

**Resources provided by the partner on day one:**

- A running production platform with hosting, authentication, database, and a
  public deployment target.
- A real corpus to work against immediately: 741 verified Russellville business
  and organization listings, plus aggregated local articles, events, and
  notices. Serious information retrieval work needs real data, and the team has
  it in week one.
- A documented, versioned SDK and an MCP server connecting to the team's own AI
  development tools.
- A complete design system with tokens and components.
- A technical partner available weekly.

**Technical challenges appropriate to senior computing students:**

- Information retrieval and ranking over heterogeneous document types, where
  relevance is not comparable across types and must be reconciled anyway.
- Embedding-based semantic search: model selection, indexing strategy, and the
  latency and cost tradeoffs of query-time versus batch embedding.
- Cold-start recommendation without meaningful user history.
- Evaluation methodology, including building a labeled relevance set and
  defending a metric. Most students never get to do this, and it is the single
  most transferable skill in the project.
- Practical constraints: index freshness, query latency, and the cost of
  embedding a growing corpus.

This is the most technically ambitious proposal on our list and suits a team
that wants depth over breadth.

**Feasibility within one academic year:**

- *Fall:* corpus analysis, evaluation set construction, baseline keyword search,
  and a working semantic search prototype over one content type.
- *Spring:* unified cross-type ranking, tagging, related items, the
  recommendation surface, and measured evaluation against the fall baseline.

Scope flexes cleanly. Unified semantic search alone, evaluated properly, is a
complete and successful project. Recommendations are the stretch goal.

**Considerations:**

- All content is public. No confidentiality constraints.
- If the team uses hosted embedding models there is a small recurring cost,
  which the partner covers. No licensing burden falls on students or ATU.
- Built as a sandboxed application on existing infrastructure. The partner owns
  hosting and maintenance during and after the course, so nothing is orphaned.
