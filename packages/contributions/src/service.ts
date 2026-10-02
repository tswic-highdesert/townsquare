/**
 * Contribution: the rules, all of them, in one place that is not a route.
 *
 * Everything a resident can put into the town's own record goes through this
 * class. Not through `contributionRoutes.ts`, which reads a cookie and maps an
 * error code and owns nothing else. The reason is the one stated in
 * `Reports.file`, `Saves.save` and `Review.decide` and it is the same reason
 * every time: the gate, the pause, the attribution and the re-validation are
 * rules about contributing, not rules about HTTP, and the next door onto
 * contributing — the MCP server a resident points their AI tool at, a mobile
 * client, a cron that publishes a scheduled notice — must not be able to arrive
 * without them.
 *
 * Four properties are load-bearing.
 *
 * **A contribution is a proposal.** It carries its own content and a digest of
 * it, and the digest is checked again at the moment it publishes. The review
 * queue pins a bundle for exactly this reason: a draft is scratch space its
 * owner keeps editing, so anything that merely pointed at one would let the
 * words change between the moderator reading them and the publish landing.
 *
 * **Approval re-validates, it does not trust a stale pass.** The same
 * `validateContent` that ran at submit runs again at publish, and a correction
 * additionally re-reads the value it claims to be fixing. A correction that was
 * true on Tuesday can be false on Thursday because somebody else already fixed
 * it, and publishing over the top of them would quietly undo a neighbour's
 * work.
 *
 * **Falling short of standing holds the work, it does not throw it away.** A
 * resident four vouches short has still written the thing. It is kept and it
 * posts the moment they are verified.
 *
 * **Nothing is deleted.** Superseded record versions are kept forever, and a
 * revert is a forward write that copies an old version rather than a rewind.
 * That single line is what makes every `immediate` row in the gate matrix
 * affordable: a record you can fix cheaply does not need to be policed
 * expensively.
 */

import { digestContent, validateContent } from './content.js'
import { ContributionError } from './errors.js'
import {
  assessPause,
  pauseMessage,
  pauseNotice,
  LADDER,
  type PauseState,
} from './rate.js'
import { availabilityFor, resolveGate, routeFor, type GateAvailability } from './policy.js'
import {
  attributedUserId,
  CONTRIBUTION_TYPES,
  type Attribution,
  type AttemptLog,
  type Contribution,
  type ContributionContent,
  type ContributionStatus,
  type ContributionStore,
  type ContributionType,
  type Contributor,
  type CorrectionContent,
  type ListingLookup,
  type ListingOwnership,
  type Moderator,
  type ModeratorAlert,
  type OrgDirectory,
  type RecordStore,
  type RecordType,
  type RecordVersion,
  type TownRecord,
} from './model.js'

const DAY_MS = 24 * 60 * 60 * 1000

export interface ContributionsOptions {
  contributions: ContributionStore
  records: RecordStore
  attempts: AttemptLog
  /** Empty in development, and honestly so: nothing grants an affiliation yet. */
  orgs: OrgDirectory
  listings: ListingLookup
  ownership: ListingOwnership
  alerts?: ModeratorAlert
  now?: () => number
}

/** What a composer needs to know before a resident types anything. */
export interface ContributeOptions {
  types: GateAvailability[]
  pause: PauseState
  /** The quiet line under the publish bar, or nothing at all. */
  notice: string | null
}

export interface SubmitInput {
  townId: string
  type: unknown
  content: unknown
  /**
   * The creation writing on a resident's behalf, when one is.
   *
   * Supplied by the bridge from the act token, never by a client body: an act
   * token names one user, one creation and one approved version, so a creation
   * cannot claim to be a different creation and a resident cannot claim to be
   * writing through one they never opened.
   */
  via?: { creationId: string; creationName: string } | null
  /** The organisation to post as, checked against real membership below. */
  asOrg?: string | null
}

export interface SubmitResult {
  contribution: Contribution
  /** Where it went, in words the composer can print without inventing any. */
  outcome: 'published' | 'queued' | 'scheduled' | 'held_for_verification'
  record: TownRecord | null
  /**
   * True when this resident already had this exact correction open and the
   * original was handed back rather than a second row being made.
   *
   * Surfaced rather than hidden, so the composer can say "we already have this"
   * instead of a second success message that quietly did nothing.
   */
  duplicate: boolean
  pause: PauseState
}

export class Contributions {
  private readonly now: () => number

  constructor(private readonly opts: ContributionsOptions) {
    this.now = opts.now ?? (() => Date.now())
  }

  // ── the chooser ───────────────────────────────────────────────────────────

  /**
   * What this resident may add, and what happens if they do.
   *
   * The chooser shows every type including the ones they cannot use, because a
   * locked row that says why and offers the route is a door, and an absent row
   * is a product that looks smaller than it is.
   */
  async options(who: Contributor, townId: string): Promise<ContributeOptions> {
    const orgs = await this.opts.orgs.membershipsFor(who.userId)
    const pause = await this.pauseFor(who.userId)
    return {
      types: availabilityFor(who, orgs.length),
      pause,
      notice: pauseNotice(pause),
    }
  }

  // ── submitting ────────────────────────────────────────────────────────────

  async submit(who: Contributor, input: SubmitInput): Promise<SubmitResult> {
    const type = input.type
    if (typeof type !== 'string' || !CONTRIBUTION_TYPES.includes(type as ContributionType)) {
      throw new ContributionError(
        'invalid',
        `type must be one of ${CONTRIBUTION_TYPES.join(', ')}`,
      )
    }

    const now = this.now()
    const content = validateContent(type as ContributionType, input.content, now)
    const gate = resolveGate(type as ContributionType, content)

    if (!gate.available) {
      throw new ContributionError('unavailable', gate.unavailableReason ?? 'not available yet')
    }

    // Standing first, and before the pause. Somebody short of vouches is not
    // being rate limited and must not be told they are.
    const attribution = await this.attribute(who, input, gate.standing)
    const short = attribution === null

    if (short && !gate.holdWhenShort) {
      throw new ContributionError(
        'forbidden',
        'a notice goes out under an organisation name, so residents know who is telling them; your account is a person',
      )
    }

    // The pause. Counted before the row exists, so the tenth attempt does not
    // leave a row behind that the eleventh then counts.
    let pause = await this.pauseFor(who.userId)
    if (gate.countsTowardPause && !short && pause.level === 'paused') {
      await this.opts.attempts.record(who.userId, false, now)
      const after = await this.pauseFor(who.userId)
      if (after.escalated && !pause.escalated) this.escalate(who, input.townId, after)
      throw new ContributionError('paused', pauseMessage(after))
    }

    // Send correction, pressed twice.
    //
    // The same answer `Reports.file` and `Saves.save` give, for the same
    // reason: a person pressing a button again is checking whether it worked,
    // and "yes, you already sent this" is both friendlier and true. A second
    // row would be a second thing a moderator has to read to reach the same
    // conclusion. The rule is per field rather than per listing, because two
    // corrections to one listing are two genuinely different claims.
    if (content.kind === 'correction') {
      const open = await this.opts.contributions.openCorrectionBy(
        who.userId,
        input.townId,
        content.targetRef,
        content.field,
      )
      if (open) {
        return {
          contribution: open,
          outcome: open.status === 'held_for_verification' ? 'held_for_verification' : 'queued',
          record: null,
          duplicate: true,
          pause: await this.pauseFor(who.userId),
        }
      }
    }

    const claimed =
      content.kind === 'correction'
        ? await this.opts.ownership.ownerOf(input.townId, content.targetRef)
        : null

    const status: ContributionStatus = short
      ? 'held_for_verification'
      : gate.route === 'immediate'
        ? content.kind === 'notice' && content.publishAt !== null
          ? 'scheduled'
          : 'published'
        : 'queued'

    const contribution = await this.opts.contributions.create(
      {
        townId: input.townId,
        type: type as ContributionType,
        content,
        contentDigest: digestContent(content),
        // Held work still carries the attribution it will publish under, so
        // the resident's own list can say who it will go up as.
        attribution: attribution ?? this.residentAttribution(who, input.via ?? null),
        status: status === 'published' ? 'queued' : status,
        route: short ? 'none' : routeFor(gate, claimed !== null),
        countsTowardPause: gate.countsTowardPause,
        scheduledFor: content.kind === 'notice' ? content.publishAt : null,
      },
      now,
    )

    if (gate.countsTowardPause && !short) await this.opts.attempts.record(who.userId, true, now)

    // Created as `queued` and published immediately after, rather than written
    // straight to `published`: the publish path is the only thing that writes a
    // record version, and having one entry point for it is what stops an
    // "immediate" type quietly skipping the digest and validity checks that the
    // moderator path runs.
    if (status === 'published') {
      const published = await this.publish(contribution.id, now)
      pause = await this.pauseFor(who.userId)
      return {
        contribution: published.contribution,
        outcome: 'published',
        record: published.record,
        duplicate: false,
        pause,
      }
    }

    pause = await this.pauseFor(who.userId)
    return {
      contribution,
      outcome: status === 'queued' ? 'queued' : status === 'scheduled' ? 'scheduled' : 'held_for_verification',
      record: null,
      duplicate: false,
      pause,
    }
  }

  // ── the contributor's own view ────────────────────────────────────────────

  async mine(who: Contributor): Promise<Contribution[]> {
    return this.opts.contributions.forUser(who.userId)
  }

  /**
   * One of the contributor's own.
   *
   * Somebody else's answers `not_found` rather than `forbidden`, exactly as the
   * review queue does: whether a given id is a real contribution is not a thing
   * to learn by guessing at ids.
   */
  async mineById(who: Contributor, id: string): Promise<Contribution> {
    const row = await this.opts.contributions.byId(id)
    if (!row || attributedUserId(row.attribution) !== who.userId) {
      throw new ContributionError('not_found', 'no such contribution')
    }
    return row
  }

  /** Pull something back before anyone has acted on it. */
  async withdraw(who: Contributor, id: string): Promise<Contribution> {
    const row = await this.mineById(who, id)
    if (row.status === 'published') {
      throw new ContributionError(
        'conflict',
        'this is already up; correcting it writes a new version rather than withdrawing the old one',
      )
    }
    if (row.status !== 'queued' && row.status !== 'scheduled' && row.status !== 'held_for_verification') {
      throw new ContributionError('conflict', `this was already ${row.status}`)
    }
    return this.opts.contributions.update(
      id,
      { status: 'withdrawn', decidedBy: who.userId, decidedAt: this.now() },
      this.now(),
    )
  }

  /**
   * Publish anything that was waiting on vouches.
   *
   * Called with a freshly read session user, so a vouch granted a minute ago
   * counts. It is idempotent and it re-runs the full publish path, which means
   * a held contribution gets the same validation as a fresh one — an event held
   * for three weeks whose start time has passed is refused here rather than
   * posted into the past.
   */
  async releaseHeld(who: Contributor): Promise<Contribution[]> {
    if (!who.verified) return []
    const held = await this.opts.contributions.heldForUser(who.userId)
    const out: Contribution[] = []
    for (const row of held) {
      const gate = resolveGate(row.type, row.content)
      const now = this.now()
      const claimed =
        row.content.kind === 'correction'
          ? await this.opts.ownership.ownerOf(row.townId, row.content.targetRef)
          : null
      const route = routeFor(gate, claimed !== null)
      const queued = await this.opts.contributions.update(row.id, { status: 'queued', route }, now)
      if (route !== 'none') {
        out.push(queued)
        continue
      }
      try {
        out.push((await this.publish(row.id, now)).contribution)
      } catch (err) {
        if (!(err instanceof ContributionError)) throw err
        // Whatever went stale while it waited is said in the contributor's own
        // list rather than thrown at whoever happened to trigger the release.
        out.push(
          await this.opts.contributions.update(
            row.id,
            { status: 'declined', decidedBy: null, decisionNote: err.message, decidedAt: now },
            now,
          ),
        )
      }
    }
    return out
  }

  /** Whatever eventually runs the clock. Exposed so it is testable now. */
  async sendDue(townId: string): Promise<Contribution[]> {
    const now = this.now()
    const due = await this.opts.contributions.dueScheduled(townId, now)
    const sent: Contribution[] = []
    for (const row of due) sent.push((await this.publish(row.id, now)).contribution)
    return sent
  }

  // ── the moderator's side ──────────────────────────────────────────────────

  /**
   * What is waiting on a human.
   *
   * Role-checked here rather than only at the route, the same as
   * `Review.decide`: what is in the queue and whose work is in it is not public
   * information, and a second door onto it must be unable to skip the check by
   * construction.
   */
  async queue(moderator: Moderator, townId: string): Promise<Contribution[]> {
    requireModerator(moderator)
    return this.opts.contributions.queued(townId, 'moderator')
  }

  async detail(moderator: Moderator, id: string): Promise<{
    contribution: Contribution
    /** For a correction: what the listing says right now, read live. */
    currentValue: string | null
  }> {
    requireModerator(moderator)
    const row = await this.opts.contributions.byId(id)
    if (!row) throw new ContributionError('not_found', 'no such contribution')
    return {
      contribution: row,
      currentValue: row.content.kind === 'correction' ? await this.currentValue(row.townId, row.content) : null,
    }
  }

  /**
   * Approve or turn down one contribution.
   *
   * A decline needs a note, and the note is shown to the contributor verbatim.
   * This is the only moment the platform tells a resident no, and how it reads
   * decides whether they ever contribute again — so the one field a moderator
   * has to type is the useful one.
   */
  async decide(
    moderator: Moderator,
    id: string,
    decision: 'approve' | 'decline',
    note: string,
  ): Promise<{ contribution: Contribution; record: TownRecord | null }> {
    requireModerator(moderator)

    const row = await this.opts.contributions.byId(id)
    if (!row) throw new ContributionError('not_found', 'no such contribution')
    if (row.status !== 'queued') {
      throw new ContributionError('conflict', `this was already ${row.status}`)
    }

    const now = this.now()
    if (decision === 'decline') {
      if (!note.trim()) {
        throw new ContributionError('invalid', 'say why: this note is what the contributor reads')
      }
      const declined = await this.opts.contributions.update(
        id,
        { status: 'declined', decidedBy: moderator.userId, decisionNote: note.trim(), decidedAt: now },
        now,
      )
      return { contribution: declined, record: null }
    }

    const published = await this.publish(id, now, {
      decidedBy: moderator.userId,
      note: note.trim() || null,
    })
    return published
  }

  // ── the record, and its history ───────────────────────────────────────────

  async record(id: string): Promise<TownRecord> {
    const found = await this.opts.records.byId(id)
    if (!found) throw new ContributionError('not_found', 'no such record')
    return found
  }

  /**
   * Every version there has ever been, oldest first.
   *
   * Nothing is filtered out and nothing is ever missing from it. The history is
   * the argument: a resident whose correction was reverted can see their
   * version still sitting there with their reason on it, which is the
   * difference between "your edit was rejected and removed" and "a moderator
   * put version 2 back on Friday, and yours is still here".
   */
  async history(recordId: string): Promise<{ record: TownRecord; versions: RecordVersion[] }> {
    const record = await this.record(recordId)
    return { record, versions: await this.opts.records.versions(recordId) }
  }

  /**
   * Put an earlier version back, as a moderator.
   *
   * Forward only. The old data is written again as a new version that records
   * where it came from, so the version being replaced stays in the history and
   * the contributor can put theirs back in turn. Undoing this costs one more
   * forward write, which is exactly what makes acting promptly cheap enough to
   * be worth doing.
   */
  async revert(
    moderator: Moderator,
    recordId: string,
    toVersion: number,
    note: string,
  ): Promise<RecordVersion> {
    requireModerator(moderator)
    if (!note.trim()) {
      throw new ContributionError('invalid', 'say why: the contributor reads this')
    }

    const record = await this.record(recordId)
    const versions = await this.opts.records.versions(recordId)
    const target = versions.find((v) => v.version === toVersion)
    if (!target) throw new ContributionError('not_found', 'no such version of this record')
    if (target.version === record.currentVersion) {
      throw new ContributionError('conflict', 'that version is already the one on the record')
    }

    return this.opts.records.addVersion(
      recordId,
      {
        data: target.data,
        // The moderator is a role rather than a name. In a town of 29,000 a
        // named moderator gets stopped in the Kroger car park, and that is how
        // you lose your only moderator.
        author: { kind: 'source', label: 'a moderator' },
        revertedFrom: target.version,
        contributionId: null,
      },
      this.now(),
    )
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * The one path that writes a record version.
   *
   * Everything lands here: an immediate event, a moderator's approval, a
   * scheduled notice sending, a held contribution released by a vouch. One
   * entry point is what makes "the town is re-validated at publish time" true
   * rather than true of the paths somebody remembered.
   */
  private async publish(
    id: string,
    now: number,
    decided?: { decidedBy: string | null; note: string | null },
  ): Promise<{ contribution: Contribution; record: TownRecord }> {
    const row = await this.opts.contributions.byId(id)
    if (!row) throw new ContributionError('not_found', 'no such contribution')

    // 1. The content is the content that was read. Cheap, and the difference
    //    between "a human approved this" and "a human approved something".
    if (digestContent(row.content) !== row.contentDigest) {
      throw new ContributionError(
        'stale',
        'this no longer matches what was submitted, so it has not been published',
      )
    }

    // 2. The same validation as at submit, against the clock as it is now. An
    //    event held three weeks for vouches whose start time has passed is
    //    refused here rather than posted into a day that has already gone.
    const content = validateContent(row.type, row.content as unknown, now)

    // 3. A correction re-reads the thing it claims to be fixing.
    const record =
      content.kind === 'correction'
        ? await this.applyCorrection(row, content, now)
        : await this.opts.records
            .create(
              {
                townId: row.townId,
                type: recordTypeFor(row.type),
                data: content as unknown as Record<string, unknown>,
                sourceRef: null,
                author: row.attribution,
                contributionId: row.id,
              },
              now,
            )
            .then((created) => created.record)

    const contribution = await this.opts.contributions.update(
      id,
      {
        status: 'published',
        recordId: record.id,
        recordVersion: record.currentVersion,
        decidedBy: decided?.decidedBy ?? null,
        decisionNote: decided?.note ?? null,
        decidedAt: decided ? now : null,
      },
      now,
    )
    return { contribution, record }
  }

  /**
   * A correction, applied onto the town's shadow of a scraped listing.
   *
   * This is the dual-attribution case in full. The directory is an import, not
   * a resident, and the town's record has to be able to say both things: that
   * version 1 of the hours came from the March 2025 scrape, and that version 2
   * came from the neighbour who read the sign taped to the door. So the first
   * correction to a field writes **two** versions — the scraped value,
   * attributed to the source, and then the fix, attributed to the resident.
   * Neither is invented: the baseline is read live from the directory at the
   * moment it is captured.
   */
  private async applyCorrection(
    row: Contribution,
    content: CorrectionContent,
    now: number,
  ): Promise<TownRecord> {
    const live = await this.opts.listings.current(row.townId, content.targetRef, content.field)
    if (!live) {
      throw new ContributionError('not_found', 'that listing is no longer in the directory')
    }

    let record = await this.opts.records.bySourceRef(row.townId, content.targetRef)
    let currentValue = live.value

    if (record) {
      const fields = fieldsOf(record.data)
      const held = fields[content.field]
      if (typeof held === 'string') currentValue = held
    }

    // The value the contributor was looking at, against the value that is there
    // now. A mismatch means somebody else already fixed this while the
    // correction sat in the queue, and publishing over the top of them would
    // quietly undo a neighbour's work.
    if (content.beforeValue && content.beforeValue !== currentValue) {
      throw new ContributionError(
        'stale',
        `this listing now says "${currentValue}", which is not what it said when the correction was written; nothing has been changed`,
      )
    }

    const source: Attribution = { kind: 'source', label: 'the directory import' }

    if (!record) {
      const created = await this.opts.records.create(
        {
          townId: row.townId,
          type: 'business',
          data: { listingId: content.targetRef, label: live.label, fields: { [content.field]: live.value } },
          sourceRef: content.targetRef,
          author: source,
          contributionId: null,
        },
        now,
      )
      record = created.record
    } else if (fieldsOf(record.data)[content.field] === undefined) {
      // A field nobody has touched before. Its scraped value goes in as its own
      // version so the history reads honestly: the import said this, and then
      // a resident said that.
      const fields = { ...fieldsOf(record.data), [content.field]: live.value }
      await this.opts.records.addVersion(
        record.id,
        { data: { ...record.data, fields }, author: source, revertedFrom: null, contributionId: null },
        now,
      )
    }

    const before = await this.opts.records.byId(record.id)
    const fields = { ...fieldsOf(before?.data ?? {}), [content.field]: content.newValue }
    await this.opts.records.addVersion(
      record.id,
      {
        data: { ...(before?.data ?? {}), fields },
        author: row.attribution,
        revertedFrom: null,
        contributionId: row.id,
      },
      now,
    )

    const after = await this.opts.records.byId(record.id)
    if (!after) throw new ContributionError('not_found', 'the record vanished mid-write')
    return after
  }

  /**
   * The attribution this will publish under, or null when standing is short.
   *
   * Built entirely from the session and the act token. `asOrg` is a *choice
   * among* the caller's real memberships, checked against the directory, so the
   * worst a forged one can do is fail.
   */
  private async attribute(
    who: Contributor,
    input: SubmitInput,
    standing: 'signed_in' | 'verified' | 'organisation',
  ): Promise<Attribution | null> {
    if (standing === 'organisation') {
      const orgs = await this.opts.orgs.membershipsFor(who.userId)
      if (orgs.length === 0) return null
      const picked = input.asOrg ? orgs.find((o) => o.orgId === input.asOrg) : orgs[0]
      if (!picked) {
        throw new ContributionError('forbidden', 'you are not attached to that organisation')
      }
      return {
        kind: 'organisation',
        orgId: picked.orgId,
        orgName: picked.orgName,
        // The staff handle rides underneath, so accountability inside the
        // building is not lost when the org is the author in public.
        userId: who.userId,
        handle: who.handle,
      }
    }

    if (standing === 'verified' && !who.verified) return null
    return this.residentAttribution(who, input.via ?? null)
  }

  private residentAttribution(
    who: Contributor,
    via: { creationId: string; creationName: string } | null,
  ): Attribution {
    return via
      ? {
          kind: 'resident_via_creation',
          userId: who.userId,
          handle: who.handle,
          creationId: via.creationId,
          creationName: via.creationName,
        }
      : { kind: 'resident', userId: who.userId, handle: who.handle }
  }

  private async pauseFor(userId: string): Promise<PauseState> {
    const now = this.now()
    const [counted, attempts] = await Promise.all([
      this.opts.contributions.countedSince(userId, now - DAY_MS),
      this.opts.attempts.countSince(userId, now - DAY_MS),
    ])
    return assessPause(counted, attempts, now)
  }

  private async currentValue(townId: string, content: CorrectionContent): Promise<string | null> {
    const record = await this.opts.records.bySourceRef(townId, content.targetRef)
    const held = record ? fieldsOf(record.data)[content.field] : undefined
    if (typeof held === 'string') return held
    const live = await this.opts.listings.current(townId, content.targetRef, content.field)
    return live?.value ?? null
  }

  /**
   * A moderator hears about somebody at fifteen attempts, and the resident is
   * told they were told.
   *
   * A limit nobody is watching is a limit that only annoys honest people. There
   * is no notification system in Town Square yet, so this is a hook rather than
   * a promise: whatever is wired to it is what "a moderator is told" means, and
   * with nothing wired the honest state is that nobody is told.
   */
  private escalate(who: Contributor, townId: string, state: PauseState): void {
    this.opts.alerts?.raise({
      townId,
      userId: who.userId,
      handle: who.handle,
      message: `@${who.handle} has tried to publish ${state.attempts} times in a day, past the ladder's ${LADDER.escalate}`,
    })
  }
}

export function requireModerator(who: Moderator): void {
  if (who.role !== 'moderator' && who.role !== 'admin') {
    throw new ContributionError('forbidden', 'deciding on contributions is a moderator role')
  }
}

/** Which shelf of the town's record a contribution lands on. */
export function recordTypeFor(type: ContributionType): RecordType {
  return type === 'correction' ? 'business' : type
}

function fieldsOf(data: Record<string, unknown>): Record<string, unknown> {
  const fields = data['fields']
  return typeof fields === 'object' && fields !== null && !Array.isArray(fields)
    ? (fields as Record<string, unknown>)
    : {}
}

export type { ContributionContent }
