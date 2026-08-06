---
type: proposal
title: Public Surveillance Infrastructure Transparency Map
status: draft-hold
created: 2026-08-06
---

# Proposal 5: Public Surveillance Infrastructure Transparency Map

Form-ready answers for <https://forms.cloud.microsoft/r/WcXzRTeueQ>

**Status note: Tal's call alone, and it is not a technical call.** This is a
strong civic computing project with real press potential and a natural FOIA
angle that a computing program would find interesting. It also attaches a
surveillance-politics story to Town Square's launch, and to ATU's, and to any
partner org that touches it. It may put a public university in an awkward
position with a city it works alongside. Submit it only if that tradeoff is one
you want. Nothing else on the list carries this kind of risk.

If it goes forward, the framing below is deliberately neutral: the project is
about public-records transparency and mapping, not about advocating a position
on the technology.

## Organization and primary contact

Town Square (Russellville)
Tal Swicegood
tal@rvtownsquare.com

## Brief description of the problem or opportunity

Automated license plate reader cameras operate throughout Russellville. Their
locations, the policies governing them, retention periods, and data-sharing
arrangements are matters of public record, but they are not published in any
consolidated or accessible form. A resident who wants to know where these
cameras are, what happens to the data, or who can access it would need to file
records requests and read the responses themselves.

The result is that infrastructure operating in public space is undocumented in
public view, not because the information is secret but because nobody has
assembled it.

This is "data collection" from ATU's needs list applied to civic transparency:
turning scattered public records into a usable public resource.

## Intended users and desired outcomes

**Primary users:** Russellville residents who want to understand what public
surveillance infrastructure exists in their community.

**Secondary users:** journalists, researchers, and policymakers who need a
factual baseline; other Arkansas communities facing the same question.

**Desired outcomes:**

- A factual, sourced, public map of documented camera locations in Russellville.
- Every entry traceable to the specific public record that supports it, so the
  resource is verifiable rather than asserted.
- Governing policies, retention periods, and data-sharing arrangements
  documented in plain language alongside the map.
- A repeatable methodology another community could apply.

## Major features or project goals

1. A records-request workflow tool that tracks FOIA requests from submission
   through response, since the research process is itself a system worth
   building.
2. A document repository holding responsive records with extracted structured
   data, each linked to its source document.
3. An interactive map of documented locations, each entry linked to its
   supporting record.
4. A plain-language policy summary layer covering retention, access, and
   sharing.
5. A provenance model where every published claim carries its evidence, which is
   the design constraint that makes this a credible resource rather than an
   opinion piece.
6. Publication as a Town Square creation with a documented methodology other
   communities can reuse.

## Technical constraints, resources, and special considerations

**Resources provided by the partner on day one:**

- A running production platform with hosting, authentication, database, and a
  public deployment target.
- Existing research and prior FOIA work on this exact subject in Russellville,
  so the team does not start from zero.
- A documented, versioned SDK and an MCP server connecting to the team's own AI
  development tools.
- A complete design system with tokens and components.
- A technical partner available weekly.

**Technical challenges appropriate to senior computing students:**

- Provenance modeling: designing a schema where every published fact carries a
  verifiable chain back to a source document, and where unverified claims cannot
  be displayed as verified. This is a genuinely interesting data-integrity
  problem.
- Document processing and structured extraction from records delivered as
  scanned PDFs of wildly varying quality.
- Geospatial data handling and map rendering.
- Workflow modeling for a long-running, asynchronous, human-in-the-loop process.

**Feasibility within one academic year:**

- *Fall:* records-request workflow tool, document repository, provenance schema,
  and initial requests filed.
- *Spring:* extraction, map, policy layer, and publication.

The critical path runs through government response times, not through the code,
which is worth flagging to faculty during scoping. The tooling can be built and
demonstrated with partial data.

**Considerations:**

- **This is a politically visible project.** It should be scoped, framed, and
  supervised with that understood by everyone involved from the beginning.
- Strict accuracy discipline is required. Publishing an unverified location
  would be both a factual failure and a credibility failure, which is precisely
  why the provenance requirement is architectural rather than procedural.
- All source material is public record. No confidentiality constraints.
- Built as a sandboxed application on existing infrastructure. The partner owns
  hosting and maintenance during and after the course, so nothing is orphaned.
