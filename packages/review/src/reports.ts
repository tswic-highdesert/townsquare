/**
 * Reporting: how a resident asks a human to look at something already live.
 *
 * The moderation stance this is built to serve is deliberately light. Town
 * Square is neutral substrate. It follows the law and stops there, and the
 * committee is one person with a day job. So the report queue is designed
 * around a fact most report systems refuse to say out loud: **most reports are
 * dismissed, and that is not a failure.** A resident who dislikes a neighbour's
 * app is not describing a problem this platform is going to solve.
 *
 * What that means concretely:
 *
 *   **Only verified residents can file.** Reporting is a claim made by someone
 *   who lives here and who a moderator can go and talk to. Opening it to
 *   anonymous accounts makes it a free, scalable weapon against any creation
 *   somebody dislikes, and a queue nobody can drain is worse than no queue —
 *   it implies a promise.
 *
 *   **One open report per resident per target.** The store enforces this the
 *   way the partial unique index does, so the Report button cannot be turned
 *   into a "send this again" button. Twenty clicks are one row.
 *
 *   **A rolling cap per resident.** The duplicate rule stops piling on one
 *   creation; the cap stops a single account from filing against everything in
 *   the gallery in an afternoon. Neither is about punishing anyone: both exist
 *   so the queue length stays proportional to real problems.
 *
 *   **A closed set of reasons.** Free text alone is untriageable, and the set
 *   is honest about what actually gets acted on — `illegal` and `security` are
 *   the ones that force a decision, and the others mostly get read and closed.
 */

import type { Creation, Reviewer } from './model.js'
import { ReviewError } from './service.js'

/**
 * Why someone is reporting.
 *
 * Named for what a resident would say, not for a policy taxonomy nobody has
 * written yet. `broken` is here because a dead creation is the most common
 * real complaint and the one a moderator can actually fix.
 */
export type ReportReason = 'illegal' | 'security' | 'impersonation' | 'spam' | 'broken' | 'other'

export const REPORT_REASONS: readonly ReportReason[] = [
  'illegal',
  'security',
  'impersonation',
  'spam',
  'broken',
  'other',
]

/** What a moderator concluded. `reverted` says an action was taken, not just read. */
export type ReportResolution = 'upheld' | 'dismissed' | 'reverted'

export interface Report {
  id: string
  townId: string
  /** Verified, always. Attribution is the whole reason reports are usable. */
  reporterId: string
  reporterHandle: string
  /** Only creations for now. Records and users get one when they exist. */
  targetType: 'creation'
  targetId: string
  /** Denormalised so a resolved report still reads as something after a rename. */
  targetLabel: string
  /** The version the reporter was looking at, when the shell knew it. */
  targetVersion: string | null
  reason: ReportReason
  detail: string | null
  resolution: ReportResolution | null
  resolvedBy: string | null
  resolvedAt: number | null
  resolutionNote: string | null
  createdAt: number
}

export interface NewReport {
  townId: string
  reporterId: string
  reporterHandle: string
  targetType: 'creation'
  targetId: string
  targetLabel: string
  targetVersion: string | null
  reason: ReportReason
  detail: string | null
}

export interface ReportStore {
  create(input: NewReport, now: number): Promise<Report>
  byId(id: string): Promise<Report | null>
  /** Oldest first: the person who waited longest is looked at first. */
  open(townId: string): Promise<Report[]>
  /** Every report against one target, resolved ones included. */
  forTarget(targetType: 'creation', targetId: string): Promise<Report[]>
  /** Mirrors `reports_open_dup_uq`: at most one, and null when there is none. */
  openByReporterForTarget(
    reporterId: string,
    targetType: 'creation',
    targetId: string,
  ): Promise<Report | null>
  countByReporterSince(reporterId: string, since: number): Promise<number>
  resolve(
    id: string,
    patch: {
      resolution: ReportResolution
      resolvedBy: string
      resolvedAt: number
      resolutionNote: string | null
    },
  ): Promise<Report>
}

/** Who is filing. Verification is read fresh, never carried on a token. */
export interface ReporterIdentity {
  userId: string
  handle: string
  verified: boolean
}

/**
 * Resolving a public name to something reportable.
 *
 * A slug, because that is what a resident has: it is in the address bar and on
 * the gallery card. Taking an id here would mean the shell had to hold one, and
 * an id is the shape of thing that gets guessed at.
 */
export interface ReportTargetLookup {
  creationBySlug(townId: string, slug: string): Promise<{ id: string; name: string } | null>
}

/** Per resident, per rolling day. Generous for a person, useless as a weapon. */
export const REPORTS_PER_DAY = 10
const DAY_MS = 24 * 60 * 60 * 1000

/** Long enough to describe the problem, short enough that it is not a channel. */
const MAX_DETAIL = 2000

export interface ReportsOptions {
  reports: ReportStore
  targets: ReportTargetLookup
  now?: () => number
}

export interface FiledReport {
  report: Report
  /**
   * True when this resident already had an open report on this target and we
   * handed the same row back rather than making a second one.
   *
   * Surfaced rather than hidden, because "we already have this" is a more
   * honest thing to show a resident than a second success message that quietly
   * did nothing.
   */
  duplicate: boolean
}

export class Reports {
  private readonly now: () => number

  constructor(private readonly opts: ReportsOptions) {
    this.now = opts.now ?? (() => Date.now())
  }

  /**
   * File a report against a creation.
   *
   * Everything that could make this a griefing tool is refused here, in the
   * service, rather than at the route: the verification check, the duplicate
   * collapse and the rolling cap all hold for a CLI, a cron, or whatever the
   * second door onto this turns out to be.
   */
  async file(
    reporter: ReporterIdentity,
    input: {
      townId: string
      slug: string
      reason: ReportReason
      detail?: string | null
      version?: string | null
    },
  ): Promise<FiledReport> {
    if (!reporter.verified) {
      throw new ReviewError(
        'forbidden',
        'reporting is for verified residents: a report is a claim made by someone who lives here',
      )
    }
    if (!REPORT_REASONS.includes(input.reason)) {
      throw new ReviewError('invalid', `reason must be one of ${REPORT_REASONS.join(', ')}`)
    }

    const target = await this.opts.targets.creationBySlug(input.townId, input.slug)
    if (!target) throw new ReviewError('not_found', 'no such creation')

    // The duplicate check comes before the cap, so a resident who clicks Report
    // twice is not told they have hit a limit. They have not; they have simply
    // already said this.
    const existing = await this.opts.reports.openByReporterForTarget(
      reporter.userId,
      'creation',
      target.id,
    )
    if (existing) return { report: existing, duplicate: true }

    const now = this.now()
    const recent = await this.opts.reports.countByReporterSince(reporter.userId, now - DAY_MS)
    if (recent >= REPORTS_PER_DAY) {
      throw new ReviewError(
        'conflict',
        `you have filed ${REPORTS_PER_DAY} reports today, which is the daily limit; anything urgent is worth an email to a moderator`,
      )
    }

    const detail = (input.detail ?? '').trim().slice(0, MAX_DETAIL)
    const report = await this.opts.reports.create(
      {
        townId: input.townId,
        reporterId: reporter.userId,
        reporterHandle: reporter.handle,
        targetType: 'creation',
        targetId: target.id,
        targetLabel: target.name,
        targetVersion: input.version?.trim() || null,
        reason: input.reason,
        detail: detail || null,
      },
      now,
    )
    return { report, duplicate: false }
  }

  /**
   * The open queue.
   *
   * Role-checked here rather than only at the route, same as `Review.decide`:
   * who reported what is the single most sensitive thing this system holds, and
   * a second door onto it must not be able to skip the check by construction.
   */
  async open(reviewer: Reviewer, townId: string): Promise<Report[]> {
    requireModerator(reviewer)
    return this.opts.reports.open(townId)
  }

  async forCreation(reviewer: Reviewer, creation: Creation): Promise<Report[]> {
    requireModerator(reviewer)
    return this.opts.reports.forTarget('creation', creation.id)
  }

  /**
   * Close a report without acting on the creation.
   *
   * `reverted` is not available here: it is what a moderation action writes when
   * it drains the reports it answered, and a resolution claiming an action that
   * never happened would make the log a work of fiction.
   */
  async resolve(
    reviewer: Reviewer,
    id: string,
    resolution: 'upheld' | 'dismissed',
    note: string,
  ): Promise<Report> {
    requireModerator(reviewer)

    const report = await this.opts.reports.byId(id)
    if (!report) throw new ReviewError('not_found', 'no such report')
    if (report.resolvedAt !== null) {
      throw new ReviewError('conflict', `this report was already ${report.resolution}`)
    }

    return this.opts.reports.resolve(id, {
      resolution,
      resolvedBy: reviewer.userId,
      resolvedAt: this.now(),
      resolutionNote: note.trim() || null,
    })
  }
}

export function requireModerator(reviewer: Reviewer): void {
  if (reviewer.role !== 'moderator' && reviewer.role !== 'admin') {
    throw new ReviewError('forbidden', 'moderation is a moderator role')
  }
}
