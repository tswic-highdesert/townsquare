---
type: brief
title: Verifying town residency without harvesting personal data
status: draft
updated: 2026-08-03
---

# Verifying residency, privately

Open question from `VISION.md`. Verified users gate reporting and write-back
attribution, so this is on the critical path.

## Reframe the requirement first

The instinct is to prove someone lives in town. That is the wrong bar, and
hitting it is what makes systems invasive.

Ask what verification is actually defending against. Here it is spam bots,
out-of-town trolls, and one person running twenty accounts to brigade a report
queue. It is not fraud, money, or anything with legal consequence. That means
the requirement is **enough friction that abuse is not worth it**, not proof of
domicile. Those two bars are very far apart in cost and in privacy damage.

Designing to the lower bar is not a compromise. It is the correct bar.

## The privacy principle that decides everything

**Verify once, store a boolean, discard the evidence.**

The record should be `verified_resident: true`, `method: vouch`, `date`. Not an
address. Not a document. Not a phone number retained past the check.

The moment Town Square holds a table mapping real names to home addresses, it
has become a database worth stealing, worth subpoenaing, and worth worrying
about. That table is a permanent liability that grows, and it is the single
easiest way to kill this project's credibility.

Related and non-negotiable: **verified does not mean publicly identified.** A
user can be a verified resident and still post under any display name they want.
The system knows they are one real human in town. The town does not need to know
which one. Pseudonymity is the feature that lets people report things without
fear.

**Know the audience.** The person who builds the Flock camera map is, by
definition, surveillance-skeptical. A community platform that demands your home
address at the door is dead on arrival with exactly the people you most want
building on it. Privacy here is not a nice-to-have, it is product-market fit.

## Options

| Method | Assurance | Privacy cost | Notes |
|---|---|---|---|
| **Vouching by existing verified residents** | Medium to high in a small town | **Near zero.** No address, no document, nothing collected | Social proof instead of data. Chains are auditable. Bootstrapping problem. |
| **Mailed postcard with a code** | High | Medium. You must touch an address, though you can discard it after | ~$0.60 and several days. The Google Business Profile classic. |
| **Local institution attestation** | Medium to high | Low | Library card, school, employer, chamber. Partnership overhead. |
| **Card AVS check via a $1 auth** | Medium | Medium, and it excludes the unbanked | Processor confirms the billing zip, you never see the address. |
| **Phone number** | Low | Medium | Area codes are meaningless now, people keep numbers for life. |
| **Public voter roll match** | High | **Bad.** Public data, but you built the surveillance join anyway | Legal in Arkansas, and exactly the wrong optics here. |
| **Utility bill upload** | High | **Worst.** You now store sensitive documents | Do not. |
| **GPS or IP geolocation** | Low | **Worst.** Location tracking | Proves presence, not residency. Trivially spoofed. Wrong signal, maximum creep. |

## Recommendation

**Vouching first, postcard as the fallback.**

Vouching fits everything already decided. It collects no personal data at all,
it matches the community-driven moderation philosophy, and in a town the size of
Russellville the social graph is genuinely dense enough to work. Seed with
twenty or thirty known residents, give each a small number of invites, let it
spread. Vouch chains are visible, so if someone vouches in a vandal that is
traceable and the whole branch can be pulled at once. It is the Lobsters and
Metafilter model, and it is well proven at community scale.

For anyone with no connections, offer the mailed postcard so newcomers are not
locked out. Address used once for the mailing, then discarded, never stored.

## Tier the privileges instead of gating everything

One binary check at the door is the blunt version. Escalating friction against
escalating power is better and lets almost everyone participate:

- **Read and browse:** anonymous. No account, ever.
- **List a creation:** email only. Low stakes, and you want this frictionless.
- **Report, and write back to town data:** verified resident.
- **Revert others' write-backs:** the small trusted corps.

Most people never hit a wall, and the friction lands only where abuse would
actually hurt.

## Make it pluggable

Town Square is open source and multi-town. A college town, a rural county, and a
suburb will not agree on a verification method. Ship residency verification as a
provider interface with vouching and postcard in the box, so each town operator
picks or writes their own without touching core.

## Decisions (Tal, 2026-08-03)

- **Vouching is the primary method.** Seed cohort comes from people Tal can call
  on directly, so the bootstrap problem is already solved.
- **Vouch budget: 10 per user, configurable, with per-user overrides.** A global
  default with the ability to raise or lower it for an individual. Trusted
  long-timers can get more, a new account can get fewer or zero.
- **Vouches are admin-visible.** Not public. The chain is auditable when someone
  needs to pull a bad branch, without turning the social graph into a public
  artifact people can mine.
- **Verification is pluggable**, with providers chosen per town.

## Providers for the pluggable interface

Researched 2026-08-03. Pricing on all of these shifts and several sources are
vendor-authored comparison pages, so confirm directly before committing.

### Postcard, the fallback path

The important finding is that **platform fees, not postage, decide this at our
volume.**

| Provider | Per postcard | Monthly platform fee | Fit |
|---|---|---|---|
| **PostGrid** | ~$0.50 to $0.86 | **$0 to $99** | **Best fit.** API-first, address validation included, low floor. |
| **Lob** | ~$0.55 to $0.81 | **$260 to $550** | Excellent API and docs, but the monthly fee only amortizes above roughly 10,000 pieces a month. At our volume it would dominate the bill. |
| **Click2Mail, Postalytics** | varies | low | Worth a quote, less developer-focused. |
| **Inkit** | quote | quote | Repositioned specifically around identity verification and PIN mailers, so it is aimed squarely at this use case. Likely priced for KYC buyers. |

At a realistic fallback volume of a few dozen postcards a month, PostGrid lands
around $25 to $50 all in. Lob would be several hundred for the same mail. Do not
default to Lob just because it is the well-known name.

**Recommendation: do not build the postcard provider at launch at all.** Tal has
the seed cohort, and vouching covers everyone reachable through it. Ship the
provider interface with vouching implemented and postcard stubbed. Build the
mail integration only when a real person is actually locked out, which may be
later than expected or never.

### If a town wants address validation without mailing

Some operators will want to sanity check an address without the postcard loop.
**Smarty** is the developer-friendly US option and **RevAddress** offers a free
tier of 1,000 requests a month. Both are cheaper than paying for a print-and-mail
stack you never use. Note this validates that an address exists, not that a
person lives there, so it is a spam filter and not verification.

### Provider interface sketch

Keep the contract narrow enough that a town operator can write their own in an
afternoon:

```
initiate(user)   -> starts a challenge, returns a pending handle
confirm(handle, response) -> true | false
```

The provider returns a boolean and nothing else. Core stores
`verified_resident`, `method`, `date`. Whatever the provider touched along the
way, address or otherwise, is the provider's problem and never enters core.
That keeps the discard-the-evidence rule structurally enforced instead of
merely intended.

## What this leaves open

- Whether losing verification is possible, and what happens to a user's past
  write-backs if their voucher is pulled. Cascading revocation is tempting and
  usually too blunt, since a bad actor's legitimate vouches get destroyed with
  them. Flag-and-review the branch rather than auto-nuking it.
- How to stop invite-selling. Ten vouches is a lot of value if the community
  becomes worth joining. Admin-visible chains give the detection path, but there
  is no policy for it yet.
- Whether vouch budget replenishes over time or is a lifetime allotment.
