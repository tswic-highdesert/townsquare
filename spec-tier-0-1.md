---
type: spec
title: Town Square Tier 0 and Tier 1, identity, vouching, creations registry, read API
status: draft
updated: 2026-08-03
---

# Tier 0 and Tier 1 spec

First buildable slice. Covers identity, vouch-based verification, the
verification provider interface, the creations registry (Tier 0), and the town
data read API (Tier 1).

Write-back is **not** built here, but the data model is shaped so it is a
permission change later and not a rewrite. Decisions this implements live in
`build-layer-options.md` and `residency-verification.md`.

## Principles this encodes

1. Store the verification result, never the evidence.
2. Verified does not mean publicly identified.
3. Everything a creation will eventually write is versioned, attributed, and
   revertable from the first migration.
4. Friction escalates with power. Reading is anonymous.

## Privilege tiers

| Action | Requires |
|---|---|
| Browse town data, browse creations | nothing, anonymous |
| Build, validate and preview a creation | account with confirmed email |
| **Submit an embedded creation for review** | **verified resident** |
| List a `linked` creation (just a URL) | account with confirmed email |
| Get a Tier 1 API key | account with confirmed email |
| Report something | verified resident |
| Write back to town data (later) | verified resident |
| Revert, resolve reports, decide submissions | moderator |

**Why submitting embedded code needs more than an email.** An embedded creation is
executable untrusted code that will run in every resident's browser. Tying that to
a verified resident, rather than to whoever can receive an email, is the difference
between a nuisance and an anonymous attack surface. A `linked` creation is only a
URL and stays at confirmed email.

Note the deliberate split: an unverified resident can still **build, validate and
preview**. They are only stopped at submission, and the MCP's `whoami` tool tells
them so before they write any code rather than after.

## Identity

Deliberately thin. No real names, no addresses, no phone.

```
users
  id              uuid pk
  handle          text unique        -- public display name, pseudonymous
  email           text unique        -- private, never shown
  email_confirmed bool default false
  created_at      timestamptz
  role            text default 'user'   -- user | moderator | admin

  -- verification result only, never the evidence
  verified_resident bool default false
  verified_method   text null        -- 'vouch' | 'postcard' | 'manual'
  verified_at       timestamptz null

  -- vouch budget
  vouch_budget_override int null     -- null = use global default
```

`handle` is what the town sees. `email` exists to log in and to reach someone
about a report. Nothing else about a person is stored, ever. If a future feature
seems to need more, that is the moment to push back.

## Vouching

Global config: `vouch_default_budget = 10`, `vouch_window_days = 90`.

Budget replenishes on a rolling window. Available vouches for a user are
`(vouch_budget_override ?? vouch_default_budget)` minus vouches they issued
inside the window that are still active. Simple, replenishes without a scheduled
job, and easy to reason about. Not worth more sophistication at launch.

```
vouches
  id           uuid pk
  voucher_id   uuid fk users
  vouchee_id   uuid fk users
  created_at   timestamptz
  revoked_at   timestamptz null
  revoked_by   uuid null fk users
  note         text null           -- admin-visible only
  unique (voucher_id, vouchee_id)
```

Rules:

- Only a verified resident may vouch.
- A vouch immediately sets the vouchee to `verified_resident = true`,
  `verified_method = 'vouch'`.
- Chains are **admin-visible, not public**. No public endpoint exposes who
  vouched for whom. Moderators can walk the tree.
- Revoking a vouch does **not** cascade. It flags the branch for moderator
  review instead. Auto-nuking a bad actor's subtree destroys their legitimate
  vouches along with the bad ones, and in a small town that is a real cost.
- Seed cohort is verified with `method = 'manual'` by an admin. Tal supplies the
  list.

Known gap, accepted for launch: no policy against invite-selling. Admin-visible
chains give the detection path. Revisit when the community is worth infiltrating.

## Verification provider interface

Providers are pluggable so each town picks its own. Keep the contract narrow
enough to implement in an afternoon.

Two shapes exist and the interface has to admit both honestly:

- **Challenge** providers, where the user proves something. Postcard, email code.
- **Grant** providers, where someone else confers it. Vouch, manual admin.

```
interface VerificationProvider {
  name: string
  kind: 'challenge' | 'grant'

  // challenge only
  initiate(userId): { challengeId, expiresAt, instructions }
  confirm(challengeId, response): { verified: boolean }

  // grant only
  grant(actorId, subjectId): { verified: boolean }
}
```

The provider returns a boolean. Core writes `verified_resident`,
`verified_method`, `verified_at` and nothing else. Any address or document the
provider handled stays inside the provider and never crosses into core. This is
what makes "discard the evidence" structural rather than a promise.

Ship with: `vouch` (grant), `manual` (grant). Stub `postcard` (challenge) against
the interface but **do not build the mail integration**. Build it the first time
a real person is genuinely locked out. If that day comes, use PostGrid, not Lob.

## Tier 0, the creations registry

An app is a URL plus metadata. This is the whole of Tier 0 and it should stay
that cheap.

```
creations
  id            uuid pk
  town_id       text
  owner_id      uuid fk users
  slug          text unique
  name          text
  tagline       text
  description   text
  url           text
  tags          text[]
  tier          int default 0       -- 0 listed, 1 connected, ...
  status        text default 'active'   -- active | dead | hidden
  created_at    timestamptz
  updated_at    timestamptz
  last_seen_ok  timestamptz null    -- liveness ping
```

Endpoints:

```
POST   /creations                 auth: confirmed email
GET    /creations                 anonymous; filter by tag, sort, search
GET    /creations/:slug           anonymous
PATCH  /creations/:slug           owner only
DELETE /creations/:slug           owner or moderator; sets status, no hard delete
```

**Liveness matters more than it looks.** A gallery full of dead links is the main
way this gets embarrassing, and resident-built apps die quietly. Ping each `url`
on a schedule, record `last_seen_ok`, surface staleness in the UI, and let
moderators mark `dead`. Never auto-delete, because a dead creation is still a
record of what someone made.

## Reports

```
reports
  id           uuid pk
  reporter_id  uuid fk users        -- must be verified_resident
  target_type  text                 -- 'creation' | 'record' | 'user'
  target_id    uuid
  reason       text
  detail       text null
  created_at   timestamptz
  resolved_at  timestamptz null
  resolved_by  uuid null fk users
  resolution   text null            -- 'upheld' | 'dismissed' | 'reverted'
```

```
POST /reports          auth: verified resident
GET  /reports          moderator only
PATCH /reports/:id     moderator only
```

A report queue with nobody draining it is worse than no queue, because it
implies a promise. One named moderator and a five-line written policy before
launch.

## Tier 1, the read API

API keys are issued per creation, so usage and abuse are attributable to a
specific app rather than a person.

**Scope note.** API keys serve `kind='linked'` creations and external integrations
only. An **embedded** creation never holds a key: it reads through the bridge under
the acting user's own session, and handing a credential to sandboxed untrusted code
is the one thing the security model forbids. Do not issue keys to iframes.

```
api_keys
  id           uuid pk
  creation_id  uuid fk creations
  key_hash     text                 -- store the hash, never the key
  created_at   timestamptz
  revoked_at   timestamptz null
  last_used_at timestamptz null
```

Endpoints, carried forward from v1 where they already exist:

```
GET /v1/towns/:townId/this-week          { today, weekend, comingUp, notices }
GET /v1/towns/:townId/items              ?type= &q= &since= &limit= &cursor=
GET /v1/towns/:townId/items/:id
GET /v1/towns/:townId/businesses         the directory listings
GET /v1/towns/:townId/types              what record types exist here
```

Notes:

- Rate limit per key. v1 already had rate limiting and polite-HTTP ingest worth
  reusing.
- Cursor pagination from the start. The directory is ~700 listings and the item
  table grows without bound.
- `since=` matters more than it looks, because a creation that syncs nightly
  should not refetch everything.
- Anonymous read of public data stays available without a key. The key exists
  for attribution and rate limiting, not to gate public town information.

## Designing now for write-back later

Not built in this slice. These two tables should still land in the first
migration, because retrofitting version history is miserable.

```
records                       -- current state of any typed record
  id             uuid pk
  town_id        text
  type           text         -- 'flock_camera', 'business', 'event', ...
  data           jsonb
  current_version int
  status         text         -- 'active' | 'stale' | 'hidden'
  created_at     timestamptz
  updated_at     timestamptz

record_versions               -- full immutable history
  id                uuid pk
  record_id         uuid fk records
  version           int
  data              jsonb
  author_user_id    uuid null fk users
  author_creation_id uuid null fk creations
  created_at        timestamptz
  reverted_from     int null
  unique (record_id, version)
```

Three things this gets right that are painful to add later:

1. **Dual attribution.** When the Flock camera app writes a location, both the
   creation and the acting user are recorded. Either can be held responsible,
   and a misbehaving app can be cut off without punishing its users.
2. **Revert is a forward operation.** Reverting writes a new version copying an
   old one and sets `reverted_from`. Nothing is ever destroyed, so moderation is
   cheap and reversible. This is the mechanism that makes light-touch moderation
   viable at all.
3. **Stale, never deleted**, carried over from v1, so state attached by another
   creation never orphans.

## Build order

1. Users, email confirm, handles.
2. Vouches plus manual verification. Seed the cohort.
3. Creations registry and public gallery. **This is the milestone that tests the
   whole thesis**, so get here fast.
4. Reports plus a moderator view.
5. API keys, rate limits, Tier 1 read endpoints.
6. `records` and `record_versions` migrated but unexposed.

Steps 1 through 3 are the real experiment: will residents build and link things.
Everything after is only worth building if the answer is yes.

## Answers (Tal, 2026-08-03)

- **Moderation roles.** Tal holds the revert button at launch, but it is a role
  not a person. Add `role` on users (`user` | `moderator` | `admin`) rather than
  the `is_moderator` bool above, so anyone can be scoped in.
- **Town data is fully open to read.** No key, no account, anonymous. Keys exist
  only for attribution and rate limiting.
- **API keys are instant and self-serve.** No approval step.
- **Russellville is town one.** Confirmed.
- **Creations can charge money.** No objection in principle. Revisit if it gets
  weird next to the free directory.
- **Cross-town creations are deferred.** Per town for now. A creation belongs to
  one town. If someone wants to run theirs in several towns later, that is a
  later problem, not a launch constraint.
- **Un-verifying someone flags their contributions for review**, never
  auto-deletes.
- **Invite-selling is deferred.** Detection path exists via admin-visible chains.

Still undecided and not blocking: one instance versus a deploy per town, and the
open source license. The `town_id` scoping in this spec supports either, so
neither blocks the build.

## The creations model needs revisiting

**This is the one real conflict between this spec and what Tal actually
pictures, and it should be settled before building the gallery.**

The spec above treats a creation as an outbound link. Tal's description is
different: these apps "live within our app," they are "apps only in the idea of
an app," meaning functionality layered on top of Town Square rather than
separate destinations you get sent away to.

That is not Tier 0. That is closer to Tier 3, embedded.

### Proposal: creations are sandboxed mini-apps we host

Most of what residents will build is read-mostly over town data. A Flock camera
map and a burrito ranking both need data, identity, and a place to render. They
do not need their own server. That makes a much simpler model available:

- A creation is a **static bundle**, HTML, JS and CSS, plus a small manifest.
- Town Square hosts the bundle and renders it in a **sandboxed iframe** inside
  our own chrome, so it looks and feels native.
- It talks to Town Square through a **JS SDK** over `postMessage`: read town
  data, know who the signed-in user is, and later write records back with dual
  attribution already attached.
- No per-app servers, no container orchestration, no ops burden of running
  arbitrary backend code. The sandbox is the browser's, which is a security
  boundary that already exists and is well tested.

This is roughly how Figma plugins and Discord Activities work, and it fits the
AI era well. Someone vibecodes a single-page app in an afternoon and it drops
straight in.

**Keep the outbound link as an escape hatch.** Add `kind` to creations:
`embedded` (the default and the flagship) or `linked` (just a URL, for anything
that genuinely needs its own backend). Linked costs almost nothing to support
and means nobody is blocked.

### The honest tradeoff

Link-only was cheaper and tested the thesis faster: does anyone build at all.
Embedded is more work up front, since it needs the SDK, the sandbox, the bundle
hosting, and a review path for uploaded code. But link-only is not the product
Tal described, and shipping the wrong cheap thing teaches the wrong lesson.

Recommendation: build embedded as the primary path, keep linked as the two-line
fallback. Then revisit the schema and endpoints above, which assume `url` is the
whole story.

## Open

- Confirm the embedded mini-app model above before building the gallery.
- One instance with `town_id` scoping, or one deploy per town.
- Open source license and governance.
