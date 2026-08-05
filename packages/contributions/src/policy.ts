/**
 * The publish-gate matrix, as data.
 *
 * This is the whole moderation policy for contributions and it is one table on
 * purpose. The alternative is the same rules spelled as `if` statements spread
 * through a submit path, a publish path and a queue query, where nobody can
 * answer "what actually needs a human?" without reading three files and where
 * the three drift. A moderator, or a resident who asks, should be able to read
 * the policy in one screen.
 *
 * The argument the design makes, and this file encodes: **the type is the
 * moderation policy.** A photo, a correction to a listing, an event and a
 * public notice do not carry the same risk, so they do not carry the same gate.
 * A general "post" box has no type, which is why it has no policy, which is why
 * it accepts everything and the thing it accepts most easily is a grievance
 * about a neighbour.
 *
 * Two axes:
 *
 *   **Standing** — what you have to be. Verified for anything a resident says
 *   in their own name; an organisation for anything said in an organisation's.
 *
 *   **Route** — who reads it before the town does. `immediate` for the ones
 *   that make no new claim or are cheap to correct, `moderator` for the one
 *   that wakes people up at night, `owner_then_moderator` for an edit to
 *   somebody else's listing.
 *
 * Every `immediate` here is affordable only because a record is versioned and a
 * revert is a forward write. Take versioning out and every row in this table has
 * to move to `moderator`.
 */

import type {
  ContributionContent,
  ContributionType,
  NoticeSeverity,
  ReviewRoute,
} from './model.js'

/** What a contributor must be. */
export type Standing = 'verified' | 'organisation'

/** Who reads it first. `owner_then_moderator` falls back when nobody claims it. */
export type PublishRoute = 'immediate' | 'moderator' | 'owner_then_moderator'

export interface PublishGate {
  type: ContributionType
  /** What the chooser calls it. */
  label: string
  standing: Standing
  route: PublishRoute
  /**
   * Whether falling short of `standing` holds the work or refuses it.
   *
   * True for a resident short of vouches: they will be verified eventually and
   * the thing they wrote should be waiting. False for an organisation, because
   * "you are not the library" is not a state that resolves by waiting, and
   * holding a notice for an affiliation that may never come would be a promise
   * nothing keeps.
   */
  holdWhenShort: boolean
  /**
   * Whether publishing this counts against the daily pause.
   *
   * Corrections do not. They are reviewed anyway, so the pause buys nothing
   * against them, and the person filing six corrections in an afternoon is
   * doing the single most valuable unpaid work in the product.
   */
  countsTowardPause: boolean
  /** Whether it can be sent later. Only notices have a reason to be. */
  schedulable: boolean
  /**
   * Whether this type can be submitted at all today, and what is missing.
   *
   * `photo` is off. Not because the policy is undecided — it is decided, and it
   * is in this row — but because a photo needs somewhere to put the bytes and
   * an EXIF strip before they land, and there is no image store in this repo.
   * A surface with no real source is omitted rather than mocked, so the
   * composer gets a straight answer instead of an upload that goes nowhere.
   */
  available: boolean
  unavailableReason: string | null
}

/**
 * Severity only changes the route, never the standing.
 *
 * A quiet notice and an urgent one are the same organisation saying something.
 * The difference is that one of them wakes up every phone in Russellville
 * tonight, and that is a difference a human should look at rather than a
 * difference in who is allowed to type.
 *
 * `emergency` is here for completeness and is unreachable from any composer —
 * `COMPOSABLE_SEVERITIES` refuses it before this table is ever consulted. It is
 * mapped to `moderator` rather than left out so that the day an ingest path
 * does write one, the fallback is a human and not an accident.
 */
const NOTICE_ROUTES: Record<NoticeSeverity, PublishRoute> = {
  informational: 'immediate',
  advisory: 'immediate',
  urgent: 'moderator',
  emergency: 'moderator',
}

export const PUBLISH_GATES: Record<ContributionType, PublishGate> = {
  event: {
    type: 'event',
    label: 'An event',
    standing: 'verified',
    route: 'immediate',
    holdWhenShort: true,
    countsTowardPause: true,
    schedulable: false,
    available: true,
    unavailableReason: null,
  },
  correction: {
    type: 'correction',
    label: 'A correction',
    standing: 'verified',
    route: 'owner_then_moderator',
    holdWhenShort: true,
    countsTowardPause: false,
    schedulable: false,
    available: true,
    unavailableReason: null,
  },
  notice: {
    type: 'notice',
    label: 'A notice',
    standing: 'organisation',
    // Overridden per severity by `resolveGate`. The default is the one most
    // notices are, so a missing severity cannot accidentally buy a louder gate.
    route: 'immediate',
    holdWhenShort: false,
    countsTowardPause: true,
    schedulable: true,
    available: true,
    unavailableReason: null,
  },
  collection: {
    type: 'collection',
    label: 'A collection',
    standing: 'verified',
    route: 'immediate',
    holdWhenShort: true,
    countsTowardPause: true,
    schedulable: false,
    available: true,
    unavailableReason: null,
  },
  photo: {
    type: 'photo',
    label: 'A photo',
    standing: 'verified',
    route: 'immediate',
    holdWhenShort: true,
    countsTowardPause: true,
    schedulable: false,
    available: false,
    unavailableReason:
      'sharing a photo needs somewhere to put the file and an EXIF strip before it lands, and Town Square has no image store yet',
  },
}

/**
 * The gate for one submission, with severity applied.
 *
 * Taking the content rather than just the type, because the notice route is a
 * property of what is being said and not only of what kind of thing it is.
 */
export function resolveGate(
  type: ContributionType,
  content?: ContributionContent | null,
): PublishGate {
  const gate = PUBLISH_GATES[type]
  if (type !== 'notice' || !content || content.kind !== 'notice') return gate
  return { ...gate, route: NOTICE_ROUTES[content.severity] }
}

/** What the chooser shows: every type, and whether this resident may use it. */
export interface GateAvailability {
  type: ContributionType
  label: string
  standing: Standing
  /** False when the resident is short of standing. The row is shown locked. */
  allowed: boolean
  /**
   * What happens if they use it anyway.
   *
   * `hold` is the "saved, and it posts the moment you are verified" state, and
   * saying so on the chooser is the difference between a locked row that reads
   * as a door and one that reads as a wall.
   */
  ifUsed: 'publish' | 'review' | 'hold' | 'refuse' | 'unavailable'
  reason: string | null
}

export function availabilityFor(
  who: { verified: boolean },
  orgCount: number,
): GateAvailability[] {
  return (Object.keys(PUBLISH_GATES) as ContributionType[]).map((type) => {
    const gate = PUBLISH_GATES[type]
    const hasStanding = gate.standing === 'organisation' ? orgCount > 0 : who.verified

    if (!gate.available) {
      return {
        type,
        label: gate.label,
        standing: gate.standing,
        allowed: false,
        ifUsed: 'unavailable' as const,
        reason: gate.unavailableReason,
      }
    }
    if (!hasStanding) {
      return {
        type,
        label: gate.label,
        standing: gate.standing,
        allowed: false,
        ifUsed: gate.holdWhenShort ? ('hold' as const) : ('refuse' as const),
        reason:
          gate.standing === 'organisation'
            ? 'a notice goes out under an organisation name, so residents know who is telling them'
            : 'adding this is for verified residents; we will hold it until your neighbours have vouched',
      }
    }
    return {
      type,
      label: gate.label,
      standing: gate.standing,
      allowed: true,
      ifUsed: gate.route === 'immediate' ? ('publish' as const) : ('review' as const),
      reason: null,
    }
  })
}

/** The route a submission lands on, once the owner question has been asked. */
export function routeFor(gate: PublishGate, targetIsClaimed: boolean): ReviewRoute {
  switch (gate.route) {
    case 'immediate':
      return 'none'
    case 'moderator':
      return 'moderator'
    case 'owner_then_moderator':
      return targetIsClaimed ? 'owner' : 'moderator'
  }
}
