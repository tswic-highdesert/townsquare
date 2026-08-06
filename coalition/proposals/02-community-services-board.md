---
type: proposal
title: Community Services and Volunteer Board
status: draft
created: 2026-08-06
---

# Proposal 2: Community Services and Volunteer Board

Form-ready answers for <https://forms.cloud.microsoft/r/WcXzRTeueQ>

## Organization and primary contact

Town Square (Russellville)
Tal Swicegood
tal@rvtownsquare.com

## Brief description of the problem or opportunity

Every nonprofit and service organization in Russellville maintains its own
mailing list, its own social media presence, and its own event calendar. Each
one pays, in money or in volunteer hours, to reach an audience it has to rebuild
from scratch. A resident who wants to know what help is available, or where to
volunteer this Saturday, has no single place to look and no way to discover an
organization they have not already heard of.

This is the exact pairing ATU's Community Health Needs-Finding Workshop
identified as "stronger communication about available services" and "resource
mapping." It was also the loudest complaint in the August 6 workshop room, where
multiple participants independently raised the cost of simply sending out an
email.

The opportunity is a shared board where any verified local organization posts
services, events, and volunteer needs at no cost, and where residents browse
across every organization at once rather than one at a time.

## Intended users and desired outcomes

**Primary users:** Russellville residents looking for services, events, or
volunteer opportunities.

**Secondary users:** staff and volunteers at local nonprofits and service
organizations who currently pay for or hand-build their own distribution.

**Desired outcomes:**

- A resident finds services and volunteer opportunities across all participating
  organizations in one place, including organizations they did not know existed.
- A small nonprofit reaches the community without paying for an email platform
  or fighting a social media algorithm.
- At least eight to ten real local organizations posting by the April showcase.
- Organizations self-serve. Posting requires no technical skill and no
  intermediary.

## Major features or project goals

1. Organization profiles with verification, so residents can trust what they see
   and organizations control their own listing.
2. Posting for three record types: services offered, events, and volunteer
   needs, each with the fields that type actually requires.
3. Browse and filter by category, date, location, and need type.
4. Resident-side saving and reminders for events and volunteer shifts.
5. A genuinely simple posting flow, validated with real nonprofit staff, since
   adoption by non-technical users is the actual success condition.
6. Publication as a Town Square creation, so listings become structured
   community records available to other applications rather than a data silo.

## Technical constraints, resources, and special considerations

**Resources provided by the partner on day one:**

- A running production platform with hosting, authentication, database, and a
  public deployment target.
- An existing directory of 741 verified Russellville business and organization
  listings to seed against, so the team starts with real data instead of test
  fixtures.
- A documented, versioned SDK and an MCP server that connects to the team's own
  AI development tools.
- A complete design system with tokens and components.
- Introductions to real local organizations willing to pilot, drawn from the
  August 6 workshop coalition. Students get real users, not hypothetical ones.
- A technical partner available weekly.

**Technical challenges appropriate to senior computing students:**

- Multi-tenant data modeling where organizations own their records and residents
  hold state attached to those records, including the case where a listing goes
  stale but resident state must not orphan.
- Identity and authorization design: who may post as an organization, how that
  is verified, and how it is revoked.
- Search and filtering across heterogeneous record types.
- Genuine user research and usability testing with non-technical users, which
  is a professional communication and requirements-gathering exercise as much
  as an engineering one.

**Feasibility within one academic year:**

- *Fall:* interviews with real local organizations, data model, organization
  profiles and verification, and a working posting prototype.
- *Spring:* all three record types, browse and search, resident features, pilot
  with real organizations, and hardening.

This is the most schedule-forgiving project on our list. A version with events
only is still a real, usable, shippable product.

**Considerations:**

- No confidential data. All content is intended for public consumption.
- The heaviest risk is adoption rather than engineering, which makes early and
  repeated contact with real organizations essential. The partner supplies
  those introductions.
- Built as a sandboxed application on existing infrastructure. The partner owns
  hosting and maintenance during and after the course, so nothing is orphaned.
