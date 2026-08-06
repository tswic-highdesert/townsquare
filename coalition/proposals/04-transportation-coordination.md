---
type: proposal
title: Community Transportation Coordination
status: draft
created: 2026-08-06
---

# Proposal 4: Community Transportation Coordination

Form-ready answers for <https://forms.cloud.microsoft/r/WcXzRTeueQ>

**Status note:** hold this one unless Russellville Housing Authority (Donna
Smith, who was in the August 6 workshop room) will co-sign as a second partner.
With her, this is the strongest proposal on the list, because it answers a need
ATU documented itself and comes with the population that feels it most. Without
her, it is a proposal about a problem we have not verified from the inside.

## Organization and primary contact

Town Square (Russellville)
Tal Swicegood
tal@rvtownsquare.com

*Co-partner, if confirmed:* Russellville Housing Authority

## Brief description of the problem or opportunity

Transportation coordination appears by name in the needs ATU identified through
its Community Health Needs-Finding Workshop. In practice it means that a
Russellville resident without a reliable vehicle has no single way to find out
what transportation exists, when it runs, who qualifies, or how to arrange it.
Several separate providers each handle a slice: senior services, medical
transport, church and volunteer driver networks, and social service programs,
each with its own eligibility rules, hours, and request process, none of them
visible in one place.

The people most affected are the least equipped to navigate a fragmented system:
older residents, people without internet access at home, and people managing a
medical schedule they did not choose.

The opportunity is a coordination layer that makes existing transportation
resources findable and requestable in one place, without asking any provider to
replace the system they already run.

## Intended users and desired outcomes

**Primary users:** Russellville residents who need transportation and do not
have reliable access to a vehicle, including public housing residents, older
adults, and people traveling to recurring medical appointments.

**Secondary users:** the caseworkers, housing authority staff, church
volunteers, and family members who arrange rides on someone else's behalf,
which is a large share of real usage and often the group that actually touches
the software.

**Tertiary users:** transportation providers coordinating capacity.

**Desired outcomes:**

- A resident or a caseworker sees every transportation option they qualify for
  in one place, with hours, eligibility, and how to request.
- A ride request reaches the right provider without the requester needing to
  know which provider that is.
- Providers see demand they currently cannot see, including requests they had
  to turn down.
- Adoption by at least three real transportation providers.

## Major features or project goals

1. A provider directory capturing service area, hours, eligibility rules,
   vehicle accessibility, and request method.
2. An eligibility matching engine that takes a resident's situation and returns
   the options actually available to them, which is the technical heart of the
   project.
3. A request and routing flow that delivers a request to the appropriate
   provider and tracks its status through to completion.
4. Proxy request support, so staff and family can act on someone's behalf with
   proper attribution and consent.
5. Accessible design as a hard requirement, not a polish item: large targets,
   screen reader support, low literacy load, and usable on an old phone over a
   weak connection.
6. Aggregate, de-identified demand reporting so providers and funders can see
   unmet need. This is frequently the output that unlocks funding.

## Technical constraints, resources, and special considerations

**Resources provided by the partner on day one:**

- A running production platform with hosting, authentication, database, and a
  public deployment target.
- A documented, versioned SDK and an MCP server connecting to the team's own AI
  development tools.
- A complete design system with tokens and components.
- Introductions to local transportation providers and, if co-signed, direct
  access to Housing Authority staff and residents for requirements and testing.
- A technical partner available weekly.

**Technical challenges appropriate to senior computing students:**

- Rules-engine design for eligibility, where the rules are inconsistent between
  providers, change without notice, and must be editable by non-programmers.
  This is a genuinely hard modeling problem and the best part of the project.
- Workflow and state modeling for requests across organizations that do not
  share a system.
- Accessibility engineering to a real standard, verified with real users.
- Privacy-preserving aggregate reporting: producing useful demand data without
  exposing who asked for what.

**Feasibility within one academic year:**

- *Fall:* provider interviews, eligibility model, provider directory, and a
  working matching prototype.
- *Spring:* request and routing flow, proxy support, accessibility validation
  with real users, aggregate reporting, and a pilot with at least one provider.

**Considerations:**

- **This project touches sensitive personal circumstances.** Requests may imply
  medical or financial information. The data model must minimize collection from
  the start, and this should be treated as a design constraint rather than a
  compliance checkbox. It is also an excellent teaching opportunity in privacy
  by design.
- Success depends on real provider participation, which the partner brokers.
- Built as a sandboxed application on existing infrastructure. The partner owns
  hosting and maintenance during and after the course, so nothing is orphaned.
