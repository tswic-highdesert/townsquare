/**
 * What a contribution is, and what the town's record is made of.
 *
 * A contribution is a **proposal**, never a publication. The same shape as a
 * review submission and for the same reason: it carries its own content, the
 * decision is on one exact version of that content pinned by digest, and the
 * digest is checked again at the moment it goes live. A draft is scratch space
 * its owner keeps editing, so a queue that merely pointed at one would let a
 * resident swap the words between the moderator reading them and the publish
 * landing.
 *
 * The thing that publishes is a **record**, and a record is versioned forever.
 * That is what `packages/db`'s `records` / `record_versions` were shaped for
 * before anything wrote to them, and it is the single line the whole
 * contribution design leans on: because a version is never destroyed, a
 * correction from a stranger is cheap to accept and cheap to undo, so
 * corrections can be open to any verified resident instead of to owners only.
 *
 * ## Attribution is assigned here, never accepted from a caller
 *
 * There is no author field in any input type in this file. `packages/manifest`
 * rejects a self-asserted `author` outright as an impersonation hole, and a
 * body that could name its own contributor is the same hole with a friendlier
 * form around it. Every `Attribution` below is built from the session the API
 * resolved, or from the act token a creation is writing under.
 */

/** The five nouns the chooser offers. There is no sixth, and no free-text box. */
export type ContributionType = 'event' | 'correction' | 'notice' | 'collection' | 'photo'

export const CONTRIBUTION_TYPES: readonly ContributionType[] = [
  'event',
  'correction',
  'notice',
  'collection',
  'photo',
]

/**
 * How far a notice goes, in the level's own words.
 *
 * These are the four rungs of `design/hifi-v2` section 9's severity ladder, and
 * they are deliberately the *same four* rather than a second vocabulary for
 * composed notices. The ladder is one object: it names the rung on the card, it
 * is what the subscription threshold slides through, and it decides whether a
 * phone makes a sound. A notice an organisation writes and a notice scraped
 * from the water utility arrive at a resident through the same channel, so
 * inventing a parallel three-level scale for the composer would mean two things
 * called "urgent" that mean different things one screen apart.
 *
 * The composer's own labels differ from these identifiers, on purpose: a person
 * writing to their congregation picks "A notice", "Time sensitive", "Urgent",
 * which are section 12's words. That is a wording decision for the shell. The
 * rung underneath is what this package stores and routes on.
 *
 * The consequence is the definition, not the label:
 *
 *   `informational`  in the app only, nobody's phone makes a sound
 *   `advisory`       a quiet push, and pinned to Today until it passes
 *   `urgent`         a push, the alert bar, and the takeover
 *   `emergency`      breaks through silent mode, and cannot be turned off
 */
export type NoticeSeverity = 'informational' | 'advisory' | 'urgent' | 'emergency'

export const NOTICE_SEVERITIES: readonly NoticeSeverity[] = [
  'informational',
  'advisory',
  'urgent',
  'emergency',
]

/**
 * The rungs a person is allowed to reach for, which is not all of them.
 *
 * **`emergency` is ingest-only and there is no composer path to it.** Section 9
 * is explicit that it is the one channel a resident cannot turn off, and every
 * emergency specimen on that sheet is sourced from the National Weather
 * Service. A rung that overrides a silent phone at 3am, that nobody can mute,
 * and that a human being can type into a form is a combination this product
 * should not own — not because an organisation would abuse it, but because the
 * first time somebody reaches for it in good faith and is wrong, the channel is
 * spent for the night the river actually comes up.
 *
 * So the ceiling on an authored notice is `urgent`, which already wakes the
 * town and is already held for a moderator. Anything above that has to come
 * from an authority with its own siren.
 */
export const COMPOSABLE_SEVERITIES: readonly NoticeSeverity[] = [
  'informational',
  'advisory',
  'urgent',
]

/** The chips in the event composer. Closed, so the events feed can be filtered. */
export type EventCategory = 'music' | 'church' | 'sport' | 'market' | 'kids' | 'civic'

export const EVENT_CATEGORIES: readonly EventCategory[] = [
  'music',
  'church',
  'sport',
  'market',
  'kids',
  'civic',
]

/** What a correction is allowed to touch. One field, one correction. */
export type CorrectionField = 'phone' | 'hours' | 'address' | 'name' | 'closed'

export const CORRECTION_FIELDS: readonly CorrectionField[] = [
  'phone',
  'hours',
  'address',
  'name',
  'closed',
]

export type EventCost = 'free' | 'paid' | 'donation'

/**
 * Where something is, as this system is willing to hold it.
 *
 * A listing from the directory, or a name somebody typed. Never a dropped pin
 * and never a street address a resident supplied: Town Square stores no
 * address for anybody, and a pin can be a house where a listing cannot.
 */
export interface PlaceRef {
  /** The directory listing id, when it came from the directory. */
  listingId: string | null
  /** What to print. Denormalised, so a record still reads after a re-scrape. */
  name: string
}

export interface EventContent {
  kind: 'event'
  title: string
  /**
   * Epoch milliseconds, resolved and confirmed before it ever reaches here.
   *
   * The composer's natural-language field is an affordance, not a wire format:
   * `readWhen` in `when.ts` turns prose into candidate readings, the resident
   * confirms one, and the confirmed instant is what is submitted. A service
   * that accepted "sometime around the fair" would be guessing on behalf of
   * somebody who is not in the room, and a wrong start time is the single most
   * damaging error this product can make.
   */
  startsAt: number
  endsAt: number | null
  place: PlaceRef | null
  category: EventCategory
  description: string
  link: string | null
  cost: EventCost
  tags: readonly string[]
}

export interface CorrectionContent {
  kind: 'correction'
  /** What is being corrected. Only directory listings have a source today. */
  targetType: 'business'
  targetRef: string
  targetLabel: string
  field: CorrectionField
  /**
   * The value on the listing at the moment the resident opened the composer.
   *
   * Carried so the moderator reads a diff rather than a claim, and re-checked
   * at publish: if somebody else corrected the same field in between, this one
   * is answered rather than silently applied over the top of theirs.
   */
  beforeValue: string
  newValue: string
  /** Required. It is the sentence a reviewer actually reads. */
  reason: string
}

export interface NoticeContent {
  kind: 'notice'
  title: string
  body: string
  severity: NoticeSeverity
  /** Epoch ms, or null for now. Nobody sees a scheduled notice before it sends. */
  publishAt: number | null
}

export interface CollectionItem {
  kind: 'business' | 'story' | 'event'
  refId: string
  label: string
}

export interface CollectionContent {
  kind: 'collection'
  name: string
  description: string | null
  /** Order is the contribution. It is preserved exactly as given. */
  items: readonly CollectionItem[]
}

export interface PhotoContent {
  kind: 'photo'
  /** An id in the image store, which does not exist yet. See `policy.ts`. */
  imageRef: string
  caption: string
  place: PlaceRef | null
}

export type ContributionContent =
  | EventContent
  | CorrectionContent
  | NoticeContent
  | CollectionContent
  | PhotoContent

/**
 * Who the town says made this.
 *
 * The dual case is `resident_via_creation` and it is the interesting one: the
 * person answers for the content, the creation answers for the behaviour, and
 * cutting off a misbehaving app therefore does not delete the work of the
 * residents who used it.
 */
export type Attribution =
  | { kind: 'resident'; userId: string; handle: string }
  | {
      kind: 'resident_via_creation'
      userId: string
      handle: string
      creationId: string
      creationName: string
    }
  | { kind: 'organisation'; orgId: string; orgName: string; userId: string; handle: string }
  | {
      /** No acting user, so none is claimed. The owner is named instead. */
      kind: 'creation'
      creationId: string
      creationName: string
      ownerId: string
      ownerHandle: string
    }
  | {
      /** What was already in the town's record before any resident touched it. */
      kind: 'source'
      label: string
    }

/** The user id behind an attribution, where there is one. For "mine" scoping. */
export function attributedUserId(attribution: Attribution): string | null {
  switch (attribution.kind) {
    case 'resident':
    case 'resident_via_creation':
    case 'organisation':
      return attribution.userId
    case 'creation':
      return attribution.ownerId
    case 'source':
      return null
  }
}

/**
 * Where a contribution is.
 *
 * `held_for_verification` is a decision rather than a technicality. A resident
 * four vouches short of verified has still written the thing, and throwing it
 * away to show them a permission error is how you lose the person who was about
 * to become a contributor. It is accepted, held, and published the moment they
 * are verified.
 */
export type ContributionStatus =
  | 'held_for_verification'
  | 'queued'
  | 'scheduled'
  | 'published'
  | 'declined'
  | 'withdrawn'

/** Which desk it is on, when it is on one. */
export type ReviewRoute = 'none' | 'owner' | 'moderator'

export interface Contribution {
  id: string
  townId: string
  type: ContributionType
  content: ContributionContent
  /**
   * Pinned at submit, re-checked at publish.
   *
   * The exact equivalent of the review queue's bundle digest, and it earns its
   * place for the same reason: what a moderator read is what goes up.
   */
  contentDigest: string
  attribution: Attribution
  status: ContributionStatus
  route: ReviewRoute
  /**
   * Whether this one counts against the daily pause, copied off the gate at
   * submit rather than re-derived at read time.
   *
   * It lives on the row so the store can answer "how many count" without
   * knowing the policy, and so a later change to the matrix cannot
   * retroactively re-price what somebody already posted.
   */
  countsTowardPause: boolean
  /** Set once it publishes. The record it created or the version it added. */
  recordId: string | null
  recordVersion: number | null
  /** Epoch ms, for a scheduled notice. */
  scheduledFor: number | null
  /**
   * Who decided, or null when the platform did.
   *
   * A decline written by the system — the listing changed underneath a
   * correction — must not read as a moderator's note. Nobody wrote it and
   * nobody can be rung about it.
   */
  decidedBy: string | null
  decisionNote: string | null
  decidedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface NewContribution {
  townId: string
  type: ContributionType
  content: ContributionContent
  contentDigest: string
  attribution: Attribution
  status: ContributionStatus
  route: ReviewRoute
  countsTowardPause: boolean
  scheduledFor: number | null
}

export interface ContributionPatch {
  status?: ContributionStatus
  route?: ReviewRoute
  recordId?: string | null
  recordVersion?: number | null
  scheduledFor?: number | null
  decidedBy?: string | null
  decisionNote?: string | null
  decidedAt?: number | null
}

export interface ContributionStore {
  create(input: NewContribution, now: number): Promise<Contribution>
  byId(id: string): Promise<Contribution | null>
  /** Everything one resident has proposed, newest first. */
  forUser(userId: string): Promise<Contribution[]>
  /** Waiting on a human, oldest first: the longest wait is looked at first. */
  queued(townId: string, route: ReviewRoute): Promise<Contribution[]>
  /** Held on standing, for the release pass when a resident becomes verified. */
  heldForUser(userId: string): Promise<Contribution[]>
  /** Due to send, for whatever eventually runs the schedule. */
  dueScheduled(townId: string, asOf: number): Promise<Contribution[]>
  /**
   * How many of this resident's contributions counted against the pause, since
   * a moment. Rolling, never calendar: a limit that resets at midnight is a
   * limit that hands somebody a fresh two hundred at 12:01.
   */
  countedSince(userId: string, since: number): Promise<number[]>
  /**
   * This resident's open correction to one field of one target, if there is one.
   *
   * Mirrors `contributions_open_correction_uq`, which is partial on
   * `decided_at is null` exactly as `reports_open_dup_uq` is: pressing Send
   * correction twice is one row, and once the first has been decided a second
   * one is a new claim about a new situation rather than a copy of the old.
   */
  openCorrectionBy(
    userId: string,
    townId: string,
    targetRef: string,
    field: string,
  ): Promise<Contribution | null>
  update(id: string, patch: ContributionPatch, now: number): Promise<Contribution>
}

// ── the town's record ───────────────────────────────────────────────────────

/** What a published contribution becomes. `business` is the corrected listing. */
export type RecordType = 'event' | 'notice' | 'collection' | 'photo' | 'business'

export interface TownRecord {
  id: string
  townId: string
  type: RecordType
  data: Record<string, unknown>
  currentVersion: number
  /** There is no delete. `stale` is for something that has simply passed. */
  status: 'active' | 'stale' | 'hidden'
  /**
   * What this record shadows in an ingested source, when it shadows one.
   *
   * A corrected directory listing is the dual-attribution case: the town's
   * record of it starts as the scrape's own value, attributed to the import,
   * and a resident's correction is version 2 on top of it. Neither half of that
   * is guessed — version 1 is the value that was actually on the listing.
   */
  sourceRef: string | null
  createdAt: number
  updatedAt: number
}

export interface RecordVersion {
  id: string
  recordId: string
  version: number
  data: Record<string, unknown>
  author: Attribution
  /**
   * Set when a moderator, or the contributor, put an older version back.
   *
   * Revert is a forward operation here exactly as it is for creations: the old
   * data is written again as a new version that records where it came from.
   * Nothing is rewound, so the history reads as a record of care rather than a
   * disciplinary file, and undoing a call costs one more forward write.
   */
  revertedFrom: number | null
  /** The proposal this version came out of, when it came out of one. */
  contributionId: string | null
  createdAt: number
}

export interface NewRecord {
  townId: string
  type: RecordType
  data: Record<string, unknown>
  sourceRef: string | null
  author: Attribution
  contributionId: string | null
}

export interface RecordStore {
  byId(id: string): Promise<TownRecord | null>
  /** The shadow record for an ingested listing, if one has been started. */
  bySourceRef(townId: string, sourceRef: string): Promise<TownRecord | null>
  create(input: NewRecord, now: number): Promise<{ record: TownRecord; version: RecordVersion }>
  /** Appends a version and moves `currentVersion`. Never replaces one. */
  addVersion(
    recordId: string,
    input: {
      data: Record<string, unknown>
      author: Attribution
      revertedFrom: number | null
      contributionId: string | null
    },
    now: number,
  ): Promise<RecordVersion>
  /** Oldest first. Superseded versions are kept, always. */
  versions(recordId: string): Promise<RecordVersion[]>
  list(townId: string, type: RecordType): Promise<TownRecord[]>
}

// ── ports onto things this package deliberately does not own ────────────────

/** Who is contributing. Read fresh from the session on every call, never cached. */
export interface Contributor {
  userId: string
  handle: string
  verified: boolean
  role: 'user' | 'moderator' | 'admin'
}

/** Who is deciding. A role held by a committee, never an owner account. */
export interface Moderator {
  userId: string
  handle: string
  role: 'user' | 'moderator' | 'admin'
}

/**
 * An organisation a resident may post as.
 *
 * A port rather than a table, because Town Square has no organisation model
 * yet and inventing one to make the notice composer demo well is exactly the
 * failure this codebase refuses. With nothing wired in, every resident meets
 * the gate screen, which is the honest state of the world.
 */
export interface OrgDirectory {
  membershipsFor(userId: string): Promise<Array<{ orgId: string; orgName: string }>>
}

/**
 * The current value of something a correction targets.
 *
 * A port because the directory lives in `packages/feed`, which this package
 * must not import: the API reaches the scrapers through a non-literal dynamic
 * specifier for reasons documented in `apps/api/src/main.ts`, and a static edge
 * from here would drag them into the strict typecheck.
 */
export interface ListingLookup {
  /** The listing as it stands, or null. `value` is the field being corrected. */
  current(
    townId: string,
    listingId: string,
    field: CorrectionField,
  ): Promise<{ label: string; value: string } | null>
}

/**
 * Whether a listing has an owner who should see a correction first.
 *
 * Nothing claims a listing today, so this always answers "unclaimed" and every
 * correction routes to a moderator. The seam is here rather than in a comment
 * because the routing is written in the design and the day claiming exists, the
 * route changes in one place.
 */
export interface ListingOwnership {
  ownerOf(townId: string, listingId: string): Promise<{ userId: string } | null>
}

/** Told when somebody keeps hitting the pause. Optional, and never a promise. */
export interface ModeratorAlert {
  raise(input: { townId: string; userId: string; handle: string; message: string }): void
}

/**
 * Every publish somebody tried, refused ones included.
 *
 * Separate from the contribution rows because a refused attempt creates no
 * contribution, and step four of the ladder — a moderator is told at fifteen
 * attempts — is about attempts rather than about what got through. Deliberately
 * the narrowest table in the package: who, when, and whether it landed.
 */
export interface AttemptLog {
  record(userId: string, allowed: boolean, now: number): Promise<void>
  countSince(userId: string, since: number): Promise<number>
}
