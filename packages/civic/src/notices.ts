/**
 * The notice stream, which carries two kinds of thing and never pretends they
 * are one kind of thing.
 *
 * A notice on this screen came either from a source we scrape — the National
 * Weather Service, the city's alert centre — or from an organisation in town
 * that wrote it in the composer. Both are notices, both sit on the same
 * severity ladder, and both reach a resident through the same channel. What
 * differs is the only thing a resident needs in order to decide whether to
 * believe it: **who is saying it, and how we came to have it.**
 *
 * So provenance is a discriminated union rather than a nullable `source`
 * string. The alternative — one `source: string` holding either "NWS Little
 * Rock" or "First United Methodist" — is a flattening that reads fine until the
 * day it matters, which is the day something is wrong and a resident is trying
 * to work out who to ring. An ingested notice can say when we fetched it and
 * link the page we got it from. An authored one can say which organisation
 * published it and which staff handle pressed the button. Neither can honestly
 * say the other's sentence.
 *
 * This is also why nothing here composes a "posted by Town Square" line. We
 * relay; we are not the source. Section 9 removes our own mark from the
 * emergency takeover for exactly this reason: putting our logo where the
 * issuing agency's name belongs is a small credit-taking that becomes a real
 * problem the first time an alert is wrong.
 */

import { createHash } from 'node:crypto'
import { decayFor, fromFeedSeverity, type Presentation, type Severity } from './ladder.js'

/**
 * Where a notice came from.
 *
 * `fetchedAt` is on the ingested case and nowhere else, because "when did you
 * last check" is a question that only means something about a source we poll.
 * Asking it of a notice somebody typed is a category error.
 */
export type NoticeProvenance =
  | {
      kind: 'ingested'
      /** The source id in the feed registry, for the freshness lookup. */
      sourceId: string
      /** What to print. "NWS Little Rock", "Russellville Water Utility". */
      sourceName: string
      /** When the item was published upstream, where the source says. */
      publishedAt: number | null
      /** When we last had it in hand. */
      fetchedAt: number
      /** The source's own page, so anybody can check us. */
      url: string | null
    }
  | {
      kind: 'authored'
      /** The organisation in whose name it went out. */
      orgName: string
      /** The staff handle underneath, so accountability inside the building
       * survives the organisation being the author in public. */
      handle: string
      postedAt: number
    }

export interface CivicNotice {
  id: string
  severity: Severity
  title: string
  detail: string
  /** Epoch ms. When this became true, not when we noticed. */
  issuedAt: number
  /** Epoch ms, when the source gave one. */
  expiresAt: number | null
  provenance: NoticeProvenance
  /**
   * A hash over the parts a resident would notice changing.
   *
   * This is what makes "hide this until it changes" a promise rather than a
   * dismissal: the hidden state is stored against this digest, so any update
   * from the source produces a new one and the notice comes straight back.
   * Deliberately over the title, detail, severity and expiry rather than the
   * whole record, because a re-fetch that only moves `fetchedAt` is not a
   * change a resident should be re-interrupted for.
   */
  digest: string
}

/**
 * What a resident has done with one notice. Never visible to anyone else.
 *
 * Both fields are digests rather than booleans, and that is the whole design
 * of this record. "I have seen this" and "hide this" are both statements about
 * a notice *as it read at the time*, not about its id. A tornado warning
 * narrowed to east of Highway 7 at 11:19pm is the same alert and different
 * information, and a resident who dismissed the 11:04 version has not seen the
 * new one. Storing a boolean would mean the update arrives already collapsed,
 * which is the precise failure the design's "until it changes" is written to
 * prevent.
 */
export interface NoticeState {
  noticeId: string
  /** The digest as it read when they last opened it. */
  seenAtDigest: string | null
  /** The digest at the moment they hid it, or null if they never did. */
  hiddenAtDigest: string | null
}

export interface NoticeStateStore {
  forUser(townId: string, userId: string): Promise<NoticeState[]>
  put(townId: string, userId: string, state: NoticeState): Promise<void>
}

export function noticeDigest(input: {
  title: string
  detail: string
  severity: Severity
  expiresAt: number | null
}): string {
  return createHash('sha256')
    .update(`${input.severity}\n${input.title}\n${input.detail}\n${input.expiresAt ?? ''}`)
    .digest('hex')
    .slice(0, 32)
}

/** The shape `packages/feed` produces, named here so this package can stay
 * clear of the feed's barrel and of its scrapers' looser typecheck. */
export interface IngestedNotice {
  id: string
  title: string
  description: string
  source: string
  severity: string
  isActive: boolean
  expires?: string | undefined
  url?: string | undefined
  createdAt: string
  updatedAt: string
}

/** The shape a published contribution notice arrives in. */
export interface AuthoredNotice {
  id: string
  title: string
  body: string
  severity: Severity
  orgName: string
  handle: string
  publishedAt: number
}

export interface AssembleInput {
  ingested: readonly IngestedNotice[]
  authored: readonly AuthoredNotice[]
  /** Source id to printable name, from the feed's own registry. */
  sourceNames: Readonly<Record<string, string>>
  /** When the assembling process last had each source in hand. */
  fetchedAt: Readonly<Record<string, number>>
  now: number
}

export function toCivicNotice(
  item: IngestedNotice,
  sourceNames: Readonly<Record<string, string>>,
  fetchedAt: Readonly<Record<string, number>>,
  now: number,
): CivicNotice {
  const severity = fromFeedSeverity(item.severity)
  const issued = Date.parse(item.createdAt)
  const expires = item.expires ? Date.parse(item.expires) : NaN
  const title = item.title.trim()
  const detail = item.description.trim()
  const expiresAt = Number.isFinite(expires) ? expires : null

  return {
    id: item.id,
    severity,
    title,
    detail,
    issuedAt: Number.isFinite(issued) ? issued : now,
    expiresAt,
    provenance: {
      kind: 'ingested',
      sourceId: item.source,
      // Falling back to the raw id rather than to a friendly invention. An
      // unnamed source is a gap in the registry, and printing "the city"
      // over something we cannot identify is how a wrong attribution ships.
      sourceName: sourceNames[item.source] ?? item.source,
      publishedAt: Number.isFinite(issued) ? issued : null,
      fetchedAt: fetchedAt[item.source] ?? now,
      url: item.url ?? null,
    },
    digest: noticeDigest({ title, detail, severity, expiresAt }),
  }
}

export function fromAuthored(item: AuthoredNotice): CivicNotice {
  const title = item.title.trim()
  const detail = item.body.trim()
  return {
    id: item.id,
    severity: item.severity,
    title,
    detail,
    issuedAt: item.publishedAt,
    // An organisation's notice carries no expiry: nobody asked them for one,
    // and inferring one would be us deciding when their supper stops mattering.
    expiresAt: null,
    provenance: {
      kind: 'authored',
      orgName: item.orgName,
      handle: item.handle,
      postedAt: item.publishedAt,
    },
    digest: noticeDigest({ title, detail, severity: item.severity, expiresAt: null }),
  }
}

/**
 * Everything live in town right now, loudest first and newest within a rung.
 *
 * Expired notices are dropped rather than shown struck through: an alert that
 * has lapsed is not information, and the "what happened" card is a different
 * surface with a different job. Inactive ones are dropped for the same reason.
 */
export function assembleNotices(input: AssembleInput): CivicNotice[] {
  const live: CivicNotice[] = []

  for (const item of input.ingested) {
    if (!item.isActive) continue
    const notice = toCivicNotice(item, input.sourceNames, input.fetchedAt, input.now)
    if (notice.expiresAt !== null && notice.expiresAt <= input.now) continue
    live.push(notice)
  }

  for (const item of input.authored) live.push(fromAuthored(item))

  return live.sort((a, b) => {
    const bySeverity = severityRank(b.severity) - severityRank(a.severity)
    return bySeverity !== 0 ? bySeverity : b.issuedAt - a.issuedAt
  })
}

function severityRank(severity: Severity): number {
  return ['informational', 'advisory', 'urgent', 'emergency'].indexOf(severity)
}

/**
 * One notice, as one resident should currently see it.
 *
 * ## There is no field here for whether it applies to where you live
 *
 * Section 9's boil-order takeover reads "Your address is inside the affected
 * zone", and that sentence is the one thing on that screen this system will
 * never be able to say. Town Square stores no address for anybody. That is the
 * identity model rather than a gap in it: verification is by vouch precisely so
 * that being a verified resident never requires handing over where you sleep.
 *
 * The reason this note sits here, on the type somebody would extend, is that
 * the feature arrives disguised as a kindness. "Only show me alerts near me" is
 * a reasonable request, it is trivially implementable with one nullable column,
 * and it is how a system that promised never to hold an address ends up holding
 * one for everybody who ever wanted a more relevant boil order. A zone filter
 * needs a location; a location that is accurate enough to be useful for a water
 * main is accurate enough to identify a house.
 *
 * What is allowed instead: a resident may name zones they care about, by name,
 * chosen by them, stored as a label and never as a coordinate. That is the
 * promise section 9 prints at the bottom of the subscription screen, and it is
 * a different thing from a location we derive.
 */
export interface PresentedNotice extends CivicNotice {
  presentation: Presentation
  seen: boolean
}

/**
 * Apply a resident's own read and hidden state to the stream.
 *
 * Kept separate from `assembleNotices` so the stream itself can be built once
 * and cached for the whole town: what is happening in Russellville is the same
 * for everybody, and only the presentation is personal.
 */
export function presentFor(
  notices: readonly CivicNotice[],
  states: readonly NoticeState[],
  now: number,
): PresentedNotice[] {
  const byId = new Map(states.map((s) => [s.noticeId, s]))
  return notices.map((notice) => {
    const state = byId.get(notice.id)
    // Seen in its current form. A change from the source makes this false again
    // and the notice re-surfaces at full weight, which is what "straight back"
    // has to mean if the promise is worth anything.
    const seen = state?.seenAtDigest != null && state.seenAtDigest === notice.digest
    return {
      ...notice,
      seen,
      presentation: decayFor({
        severity: notice.severity,
        ageMs: Math.max(0, now - notice.issuedAt),
        seen,
        hiddenAtDigest: state?.hiddenAtDigest ?? null,
        digest: notice.digest,
      }),
    }
  })
}

/**
 * What the civic screen says when nothing is happening, which is most days.
 *
 * Section 10's empty-state anatomy is four slots: a mark, a line that states
 * the fact and never apologises, a sub-line that says what else is true, and an
 * action only if there is genuinely somewhere better to be. Its voice test is
 * to read the line out loud to a neighbour, which "No active alerts" fails.
 *
 * The interesting part here is what the sub-line is made of. **Silence is a
 * claim, and a claim needs provenance in the same way a notice does.** A blank
 * civic screen and a civic screen whose scrapers all died look identical to a
 * resident, and the difference is the whole value of the surface on the morning
 * somebody is wondering whether the water is safe. So the quiet state is
 * assembled from the sources we actually polled and the moment we polled them,
 * exactly as a notice card would have been. Nothing in it is a fixed string
 * about sources we merely intend to watch.
 */
export interface QuietState {
  line: string
  sub: string
  /** The sources genuinely consulted, by printable name. Never a fixed list. */
  watching: readonly string[]
  checkedAt: number
  /** Section 9 draws this as "What we check, and how often". Real, and short. */
  action: string
}

export function quietState(input: {
  townName: string
  watching: readonly string[]
  checkedAt: number
}): QuietState {
  const names = [...input.watching].sort()
  return {
    line: `Nothing is going on in ${input.townName} right now.`,
    // Names the sources rather than counting them where a person could hold the
    // names in their head, because "we checked the weather service and the
    // city" is reassuring in a way that "we checked 2 sources" is not.
    sub: `${nothingFrom(names)} Last checked just now.`,
    watching: names,
    checkedAt: input.checkedAt,
    action: 'What we check, and how often',
  }
}

function nothingFrom(names: readonly string[]): string {
  if (names.length === 0) {
    // The honest sentence when we are watching nothing at all. It reads as a
    // problem because it is one, and dressing it as calm would be the exact
    // lie this whole surface exists to avoid.
    return 'We are not currently watching any alert source.'
  }
  if (names.length === 1) return `Nothing from ${names[0]}.`
  if (names.length === 2) return `Nothing from ${names[0]} or ${names[1]}.`
  return `Nothing from ${names[0]}, ${names[1]}, or the ${names.length - 2} other sources we watch.`
}

export class MemoryNoticeStateStore implements NoticeStateStore {
  private readonly rows = new Map<string, Map<string, NoticeState>>()

  private key(townId: string, userId: string): string {
    return `${townId} ${userId}`
  }

  async forUser(townId: string, userId: string): Promise<NoticeState[]> {
    return [...(this.rows.get(this.key(townId, userId))?.values() ?? [])].map((s) => ({ ...s }))
  }

  async put(townId: string, userId: string, state: NoticeState): Promise<void> {
    const key = this.key(townId, userId)
    const mine = this.rows.get(key) ?? new Map<string, NoticeState>()
    mine.set(state.noticeId, { ...state })
    this.rows.set(key, mine)
  }
}
