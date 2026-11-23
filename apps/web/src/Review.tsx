/**
 * The committee's screens: what may run, what residents said about what already
 * does, and what to do about it.
 *
 * Deliberately plain. The only thing on any of these screens that earns colour
 * is an update asking for a permission it did not have before — that is the
 * browser-extension play, ship something innocuous, build an audience, then push
 * the real payload, and a reviewer re-reading a full permissions block for the
 * fifth time will not catch one new host. Everything else is grey so that one
 * thing is not.
 *
 * The order of a submission is the order attention should be spent, and it puts
 * the machine's work first: the automated pass already ran at submit, so this
 * screen never shows a manifest error. What changed, then what it asks for, then
 * the warnings a human was asked to look at, then the source, last, by which
 * point you know what to look for.
 *
 * Three properties are not cosmetic.
 *
 * **The API answers an ordinary resident 404, not 403**, and these fetches
 * return empty rather than an error, so nothing here is a way to learn how much
 * is pending or whose work is in it.
 *
 * **A report queue is not a signal.** No count badge, no severity colour, no
 * ranking. Most reports are dismissed and that is not a failure, so nothing on
 * the screen implies a promise of action.
 *
 * **Every action carries a reason.** The API refuses a moderation call with an
 * empty note, including a restore, and the buttons here are disabled until one
 * is typed rather than letting a moderator find out by being refused. The reason
 * lands in an append-only log with the moderator's name on it, which is what
 * makes a committee-held role accountable to the residents it acts on.
 */

import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  CardBody,
  CardMeta,
  CardTitle,
  EmptyState,
  InlineError,
  RowItem,
  RowList,
  Skeleton,
  StatusPill,
  Textarea,
} from './ui/index.js'
import { Icon } from './Icon.js'
import {
  decide,
  fetchCreationDetail,
  fetchModeratedCreations,
  fetchQueue,
  fetchReports,
  fetchSubmission,
  isError,
  moderate,
  resolveReport,
  type ManifestDiff,
  type ModeratedCreation,
  type ModerationDetail,
  type PermissionChange,
  type QueueItem,
  type Report,
  type ReviewDetail,
} from './reviewApi.js'
import { ContributionReview } from './ContributionReview.js'
import { onDay, waited } from './identity/when.js'
import { msg, t, tn } from './i18n/index.js'
import './identity/identity.css'

export interface ReviewScreenProps {
  onBack(): void
}

type Tab = 'contributions' | 'submissions' | 'reports' | 'live'

const TABS: ReadonlyArray<[Tab, string]> = [
  ['contributions', msg('Corrections')],
  ['submissions', msg('Submissions')],
  ['reports', msg('Reports')],
  ['live', msg('Live creations')],
]

/**
 * Three tabs, in the order the work happens: decide what may run, read what
 * residents said about what already does, act on it.
 *
 * One screen rather than three entry points, because they are one job. A
 * moderator who has to remember that reports live somewhere else is a moderator
 * who reads them weekly.
 */
export function ReviewScreen(props: ReviewScreenProps) {
  const [tab, setTab] = useState<Tab>('contributions')

  return (
    <main className="mod-screen">
      <Button
        variant="quiet"
        size="sm"
        icon="arrow-left"
        className="id-back"
        onClick={props.onBack}
      >
        {t('Back')}
      </Button>

      <nav className="mod-tabs" aria-label={t('Moderation')}>
        {TABS.map(([value, label]) => (
          <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>
            {t(label)}
          </button>
        ))}
      </nav>

      {tab === 'contributions' && <ContributionReview />}
      {tab === 'submissions' && <SubmissionsTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'live' && <LiveTab />}
    </main>
  )
}

/** Three lines of the shape a queue row has, so a slow API is not a blank page. */
function QueueSkeleton() {
  return (
    <div className="mod-queue" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} shape="block" height={86} />
      ))}
    </div>
  )
}

// ── submissions ──────────────────────────────────────────────────────────────

function SubmissionsTab() {
  const [queue, setQueue] = useState<QueueItem[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    void fetchQueue().then(setQueue)
  }, [])

  function refresh() {
    setOpen(null)
    setQueue(null)
    void fetchQueue().then(setQueue)
  }

  if (open) return <Submission id={open} onDone={refresh} onBack={() => setOpen(null)} />

  return (
    <>
      <h1 className="id-h1">{t('Review queue')}</h1>
      {queue === null && <QueueSkeleton />}
      {queue?.length === 0 && (
        <EmptyState
          mark="tray"
          tone="good"
          line={t('Nothing waiting')}
          sub={t("Every submitted version is read before it runs in anyone's browser, including updates to creations that are already live.")}
        />
      )}

      {queue !== null && queue.length > 0 && (
        <RowList label={t('Waiting for review')}>
          {queue.map((item) => (
            <RowItem
              key={item.id}
              onClick={() => setOpen(item.id)}
              title={item.name}
              meta={
                <>
                  @{item.handle} · v{item.version} ·{' '}
                  {item.kind === 'update' ? t('update') : t('new creation')} ·{' '}
                  {tn(item.fileCount, '{count} files', '{count} files')} ·{' '}
                  {Math.ceil(item.byteSize / 1024)} KB · {waited(item.submittedAt)}
                </>
              }
              trailing={
                <>
                  {/*
                    Gold, not the quiet pending grey, and not brick.
                    
                    The diff on the submission page is loud because that is
                    where the decision is made. This pill is where *triage
                    order* is decided, which on a busy day is what determines
                    whether the escalating row gets opened first or fifth — and
                    a grey chip in a row that also reads "3 files · 1 KB ·
                    waiting under an hour" does not carry that. Gold is the
                    attention register; brick stays the one alarm.
                  */}
                  {item.escalates && (
                    <StatusPill tone="gold" icon="alert-circle">
                      {t('asks for more')}
                    </StatusPill>
                  )}
                  {item.warningCount > 0 && (
                    <StatusPill tone="quiet">
                      {tn(item.warningCount, '{count} warning', '{count} warnings')}
                    </StatusPill>
                  )}
                </>
              }
            />
          ))}
        </RowList>
      )}
    </>
  )
}

function Submission(props: { id: string; onBack(): void; onDone(): void }) {
  const [detail, setDetail] = useState<ReviewDetail | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)

  useEffect(() => {
    void fetchSubmission(props.id).then((result) => {
      if (isError(result)) setProblem(result.message)
      else setDetail(result)
    })
  }, [props.id])

  async function submit(decision: 'approve' | 'reject' | 'request_changes') {
    setBusy(true)
    setProblem(null)
    const result = await decide(props.id, decision, note)
    setBusy(false)

    if (isError(result)) {
      setProblem(result.message)
      return
    }
    // The town changing underneath a queued submission is a real outcome, not
    // an error: the reviewer meant to approve and the platform said no. Say so
    // plainly rather than showing a success state that did not happen.
    setOutcome(
      result.submission.status === 'approved'
        ? t('Live at /{slug}.', { slug: result.creation?.slug ?? '' })
        : t('Marked {status}.', {
            status: t(STATUS_LABEL[result.submission.status] ?? result.submission.status.replace('_', ' ')),
          }),
    )
    setTimeout(props.onDone, 1400)
  }

  if (problem && !detail) return <InlineError live>{problem}</InlineError>
  if (!detail) return <QueueSkeleton />

  const manifest = detail.submission.manifest as {
    tagline?: string
    description?: string
  }
  // A rejection or a change request is the only moment the platform tells a
  // resident no, and how it reads decides whether they ever build again.
  const needsNote = note.trim().length === 0

  return (
    <>
      <Button
        variant="quiet"
        size="sm"
        icon="arrow-left"
        className="id-back"
        onClick={props.onBack}
      >
        {t('Queue')}
      </Button>

      <h1 className="id-h1">{detail.submission.name}</h1>
      <p className="mod-row-detail">
        @{detail.submission.handle} · v{detail.submission.version} ·{' '}
        {detail.kind === 'update' ? (
          <>
            {t('update to')} <code>{detail.live?.slug}</code>,{' '}
            {t('currently on v{version}', { version: detail.live?.version ?? '' })}
          </>
        ) : (
          <>
            {t('new creation, proposed')} <code>{detail.submission.proposedSlug}</code>
          </>
        )}
      </p>
      {manifest.tagline && <p className="id-lede">{manifest.tagline}</p>}
      {manifest.description && <p>{manifest.description}</p>}

      {detail.diff && <Diff diff={detail.diff} />}
      {detail.kind === 'new' && <Grants grants={detail.grants} />}

      {detail.warnings.length > 0 && (
        <section>
          <h2 className="id-eyebrow">{t('Flagged for a human')}</h2>
          <ul className="mod-warnings">
            {detail.warnings.map((w, i) => (
              <li key={i}>
                <code>{w.path}</code> · {w.code} — {w.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mod-source">
        <h2 className="id-eyebrow id-eyebrow-sep">{t('Source')}</h2>
        {detail.files.map((file) => (
          <details key={file.path} open={file.path === 'townsquare.json'}>
            <summary>
              {file.path} · {t('{bytes} bytes', { bytes: file.bytes })}
            </summary>
            <pre className="mod-code">{file.text}</pre>
          </details>
        ))}
        {detail.omitted.length > 0 && (
          <p className="id-note">
            {t('Not shown: {files}', {
              files: detail.omitted.map((o) => `${o.path} (${o.reason})`).join(', '),
            })}
          </p>
        )}
      </section>

      <section className="mod-decide">
        <h2 className="id-eyebrow">{t('Decide')}</h2>
        <Textarea
          label={t('What the builder should know')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder={t('Required unless you are approving.')}
          help={t('Shown to the builder verbatim.')}
        />
        <div className="id-actions">
          <Button variant="primary" loading={busy} onClick={() => void submit('approve')}>
            {t('Approve and publish')}
          </Button>
          <Button
            variant="secondary"
            disabled={busy || needsNote}
            onClick={() => void submit('request_changes')}
          >
            {t('Request changes')}
          </Button>
          <Button
            variant="quiet"
            disabled={busy || needsNote}
            onClick={() => void submit('reject')}
          >
            {t('Reject')}
          </Button>
        </div>
        {needsNote && (
          <p className="id-fine">
            <Icon name="info" size={14} />
            {t('“No” with no reason is a dead end the builder cannot act on, so turning something down needs a note. Approving does not.')}
          </p>
        )}
        {problem && <InlineError live>{problem}</InlineError>}
        {outcome && (
          <p className="id-outcome" role="status">
            <Icon name="check-circle" size={15} />
            <span>{outcome}</span>
          </p>
        )}
        <p className="id-fine">
          <Icon name="lock" size={14} />
          {t('Approval is of this exact version, pinned by digest')}{' '}
          <code>{detail.submission.bundleDigest.slice(0, 12)}</code>.{' '}
          {t('A later update comes back here.')}
        </p>
      </section>
    </>
  )
}

// ── reports ──────────────────────────────────────────────────────────────────

/**
 * The report queue.
 *
 * Unadorned on purpose. A report is one resident saying they looked at
 * something and did not like what they saw; a count badge or a severity colour
 * would dress that up as a signal, and a signal is a thing worth manufacturing.
 */
function ReportsTab() {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  function load() {
    setOpen(null)
    void fetchReports().then(setReports)
  }

  useEffect(load, [])

  return (
    <>
      <h1 className="id-h1">{t('Reports')}</h1>
      {reports === null && <QueueSkeleton />}
      {reports?.length === 0 && (
        <EmptyState
          mark="tray"
          tone="good"
          line={t('Nothing open')}
          sub={t('A queue nobody drains is worse than no queue, so these are meant to be read and closed, including the many that are read and closed with nothing else happening.')}
        />
      )}

      {/*
        A card rather than a row, and the difference is not cosmetic. A Row is
        one target: a resident's own words and a control to answer them are two
        things, and nesting a button inside a row's tap area is the one thing
        the primitive is written not to do.
      */}
      <ul className="mod-queue">
        {reports?.map((report) => (
          <li key={report.id}>
            <Card>
              <CardBody>
                <CardTitle>
                  {report.targetLabel}
                  {report.targetVersion ? ` · v${report.targetVersion}` : ''}
                </CardTitle>
                <CardMeta>
                  {t(REASON_LABEL[report.reason] ?? report.reason)} ·{' '}
                  {t('reported by @{handle}', { handle: report.reporterHandle })} ·{' '}
                  {onDay(report.createdAt)}
                </CardMeta>
                {report.detail && <p className="mod-row-say">{report.detail}</p>}
                {open === report.id ? (
                  <ResolveForm id={report.id} onDone={load} onCancel={() => setOpen(null)} />
                ) : (
                  <div className="id-actions">
                    <Button variant="secondary" size="sm" onClick={() => setOpen(report.id)}>
                      {t('Close this report')}
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>

      <p className="id-fine">
        <Icon name="info" size={14} />
        {t('Acting on a creation, hiding it, blocking it, reverting it, closes the open reports against it on its own. This is for the ones where the answer is that nothing needs to happen.')}
      </p>
    </>
  )
}

function ResolveForm(props: { id: string; onDone(): void; onCancel(): void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function submit(resolution: 'upheld' | 'dismissed') {
    setBusy(true)
    setProblem(null)
    const result = await resolveReport(props.id, resolution, note)
    setBusy(false)
    if (isError(result)) setProblem(result.message)
    else props.onDone()
  }

  return (
    <div className="mod-decide">
      <Textarea
        label={t('What you concluded')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={4000}
        help={t('Kept with the report. The person who filed it is told what was concluded, and often that is “we read it, nothing needed to happen”.')}
      />
      <div className="id-actions">
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          onClick={() => void submit('dismissed')}
        >
          {t('Nothing to do')}
        </Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void submit('upheld')}>
          {t('Fair, handled elsewhere')}
        </Button>
        <Button variant="quiet" size="sm" disabled={busy} onClick={props.onCancel}>
          {t('Cancel')}
        </Button>
      </div>
      {problem && <InlineError live>{problem}</InlineError>}
    </div>
  )
}

// ── live creations ───────────────────────────────────────────────────────────

function LiveTab() {
  const [rows, setRows] = useState<ModeratedCreation[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    void fetchModeratedCreations().then(setRows)
  }, [])

  if (open) {
    return (
      <LiveCreation
        id={open}
        onBack={() => {
          setOpen(null)
          setRows(null)
          void fetchModeratedCreations().then(setRows)
        }}
      />
    )
  }

  return (
    <>
      <h1 className="id-h1">{t('Live creations')}</h1>
      {rows === null && <QueueSkeleton />}
      {rows?.length === 0 && (
        <EmptyState
          mark="grid"
          line={t('Nothing has been approved yet')}
          sub={t('This fills as the queue is worked through. The example creations were never submitted, so they are not here.')}
        />
      )}

      {rows !== null && rows.length > 0 && (
        <RowList label={t('Everything already running')}>
          {rows.map((row) => (
            <RowItem
              key={row.id}
              onClick={() => setOpen(row.id)}
              title={row.name}
              meta={
                <>
                  /{row.slug}
                  {row.activeVersion ? ` · v${row.activeVersion}` : ''}
                </>
              }
              trailing={
                <>
                  {row.status !== 'active' && (
                    <StatusPill tone="quiet">{t(STATUS_LABEL[row.status] ?? row.status)}</StatusPill>
                  )}
                  {/*
                    A count, not a ranking, and only on a screen no resident can
                    reach. It tells a moderator there is something to read here;
                    the same number anywhere public would be a pile-on button.
                  */}
                  {row.openReports > 0 && (
                    <StatusPill tone="pending">
                      {tn(row.openReports, '{count} open report', '{count} open reports')}
                    </StatusPill>
                  )}
                </>
              }
            />
          ))}
        </RowList>
      )}
    </>
  )
}

const ACTION_LABEL: Record<string, string> = {
  hide: msg('Hidden'),
  block: msg('Blocked'),
  restore: msg('Put back'),
  revert: msg('Reverted'),
}

// Status words the API sends as machine values and the screen shows as they
// are. English renders each one unchanged.
const STATUS_LABEL: Record<string, string> = {
  active: msg('active'),
  hidden: msg('hidden'),
  blocked: msg('blocked'),
  submitted: msg('submitted'),
  approved: msg('approved'),
  rejected: msg('rejected'),
  superseded: msg('superseded'),
  changes_requested: msg('changes requested'),
}

const REASON_LABEL: Record<string, string> = {
  illegal: msg('illegal'),
  security: msg('security'),
  impersonation: msg('impersonation'),
  spam: msg('spam'),
  broken: msg('broken'),
  other: msg('other'),
}

/**
 * One creation, and everything a moderator can do to it.
 *
 * The version list is the important part of the screen. Reverting is the
 * cheapest useful action available — it puts a known-good version back without
 * taking anything from anybody — so it is a list of versions to choose from
 * rather than something buried behind the two blunter buttons.
 *
 * Nothing here says "delete", because nothing here deletes. Hiding and blocking
 * stop the sandbox serving and are undone by putting it back; a revert
 * republishes old bytes as a *new* version and leaves the one it replaced in
 * the list with its author still on it. That is what makes acting promptly
 * cheap enough to be worth doing.
 */
function LiveCreation(props: { id: string; onBack(): void }) {
  const [detail, setDetail] = useState<ModerationDetail | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)

  function load() {
    void fetchCreationDetail(props.id).then((result) => {
      if (isError(result)) setProblem(result.message)
      else setDetail(result)
    })
  }

  useEffect(load, [props.id])

  async function act(action: 'hide' | 'block' | 'restore' | 'revert', versionId?: string) {
    setBusy(true)
    setProblem(null)
    setOutcome(null)
    const result = await moderate(props.id, action, note, versionId)
    setBusy(false)

    if (isError(result)) {
      setProblem(result.message)
      return
    }
    const closed = result.resolvedReports.length
    const done = `${t(ACTION_LABEL[action] ?? action)}.`
    setOutcome(
      closed
        ? `${done} ${tn(closed, '{count} open report closed with it.', '{count} open reports closed with it.')}`
        : done,
    )
    setNote('')
    load()
  }

  if (problem && !detail) return <InlineError live>{problem}</InlineError>
  if (!detail) return <QueueSkeleton />

  const openReports = detail.reports.filter((r) => r.resolvedAt === null)
  // The API refuses an action with an empty note. Saying so with a disabled
  // button is kinder than saying it with a 400 after the press.
  const needsReason = note.trim().length === 0

  return (
    <>
      <Button
        variant="quiet"
        size="sm"
        icon="arrow-left"
        className="id-back"
        onClick={props.onBack}
      >
        {t('Live creations')}
      </Button>

      <h1 className="id-h1">{detail.creation.name}</h1>
      <p className="mod-row-detail">
        /{detail.creation.slug} · {t(STATUS_LABEL[detail.creation.status] ?? detail.creation.status)}
      </p>

      {openReports.length > 0 && (
        <section className="mod-diff" data-escalates>
          <div className="mod-diff-head">
            <h3>{t('Open reports')}</h3>
          </div>
          {openReports.map((report) => (
            <p key={report.id}>
              <b>{t(REASON_LABEL[report.reason] ?? report.reason)}</b>
              {report.targetVersion ? ` · v${report.targetVersion}` : ''} — @{report.reporterHandle}
              {report.detail ? `: ${report.detail}` : ''}
            </p>
          ))}
        </section>
      )}

      <section className="mod-decide">
        <h2 className="id-eyebrow">{t('Act')}</h2>
        <Textarea
          label={t('Why')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder={t('Required, and kept in the moderation log.')}
          help={t('“Who did this, when, and what did they say” is what makes this role accountable. Required for putting something back, too.')}
        />
        <div className="id-actions">
          {detail.creation.status === 'active' ? (
            <>
              <Button
                variant="secondary"
                disabled={busy || needsReason}
                onClick={() => void act('hide')}
              >
                {t('Hide')}
              </Button>
              {/*
                Block is the one that means something, for what the law forces.
                It is a plain button rather than a red one: the alarm colour is
                for the river, and a moderator using this reads the sentence
                under it, not the paint.
              */}
              <Button
                variant="secondary"
                disabled={busy || needsReason}
                onClick={() => void act('block')}
              >
                {t('Block')}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              disabled={busy || needsReason}
              onClick={() => void act('restore')}
            >
              {t('Put it back')}
            </Button>
          )}
        </div>
        {problem && <InlineError live>{problem}</InlineError>}
        {outcome && (
          <p className="id-outcome" role="status">
            <Icon name="check-circle" size={15} />
            <span>{outcome}</span>
          </p>
        )}
        <p className="id-fine">
          <Icon name="history" size={14} />
          {t('Nothing here deletes anything. Hidden and blocked both stop the sandbox serving it, both get an explainer page rather than a blank frame, and both are undone by putting it back.')}
        </p>
      </section>

      <section>
        <h2 className="id-eyebrow id-eyebrow-sep">{t('Versions')}</h2>
        <ul className="mod-versions">
          {/*
            A card each, and the live one carries the only edge on the list.
            These are not rows for the same reason a report is not: each holds a
            button that acts on it, and a Row is one target.

            Live is marked with a class rather than a data attribute, because
            `Card` forwards `className` and deliberately does not spread
            arbitrary props onto its element.
          */}
          {detail.versions.map((version) => (
            <li key={version.id}>
              <Card className={version.live ? 'mod-version mod-version-live' : 'mod-version'}>
                <CardBody>
                  <div className="mod-version-head">
                    <span className="mod-version-n">v{version.version}</span>
                    {version.live && <StatusPill tone="live">{t('live')}</StatusPill>}
                    {version.revertedFromVersionId && (
                      <StatusPill tone="quiet" icon="history">
                        {t('a revert')}
                      </StatusPill>
                    )}
                    {!version.live && version.status === 'superseded' && (
                      <StatusPill tone="quiet">{t('replaced')}</StatusPill>
                    )}
                    <span className="mod-version-when">{onDay(version.createdAt)}</span>
                  </div>
                  <div className="mod-attrib">
                    <span>
                      <Icon name="lock" size={14} />
                      <code>{version.bundleDigest.slice(0, 12)}</code>
                    </span>
                    <span>{t(STATUS_LABEL[version.status] ?? version.status)}</span>
                  </div>
                  {version.revertable && (
                    <div className="id-actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy || needsReason}
                        onClick={() => void act('revert', version.id)}
                      >
                        {t('Put v{version} back', { version: version.version })}
                      </Button>
                    </div>
                  )}
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
        <p className="id-fine">
          <Icon name="git-branch" size={14} />
          {t('Reverting publishes these exact bytes again as a new version, re-checked against the digest they were approved with. The version being replaced stays in this list with its author still on it, so undoing this costs one more forward write.')}
        </p>
      </section>

      {detail.log.length > 0 && (
        <section>
          <h2 className="id-eyebrow id-eyebrow-sep">{t('Moderation log')}</h2>
          <ul className="mod-log">
            {detail.log.map((entry) => (
              <li key={entry.id}>
                <b>{t(ACTION_LABEL[entry.action] ?? entry.action)}</b>{' '}
                {t('by @{handle}', { handle: entry.actorHandle })} ·{' '}
                {onDay(entry.createdAt)}
                {entry.note && <p className="mod-log-note">{entry.note}</p>}
              </li>
            ))}
          </ul>
          <p className="id-fine">
            <Icon name="scale" size={14} />
            {t('Append-only. An entry is never edited or removed, including one somebody regrets.')}
          </p>
        </section>
      )}
    </>
  )
}

// ── the permission diff ──────────────────────────────────────────────────────

const LABELS: Record<string, string> = {
  identity: msg('identity'),
  read: msg('reads records'),
  write: msg('writes records'),
  network: msg('network'),
  storage: msg('private storage'),
  device: msg('device'),
}

function Diff(props: { diff: ManifestDiff }) {
  const { diff } = props
  const escalates = diff.escalations.length > 0
  const quiet = !escalates && diff.newRecordTypes.length === 0 && !diff.renamed

  return (
    <section className="mod-diff" data-escalates={escalates || undefined}>
      <div className="mod-diff-head">
        <h3>
          {t('What changed · v{from} to v{to}', { from: diff.versionFrom, to: diff.versionTo })}
        </h3>
        {escalates && (
          <StatusPill tone="pending" icon="alert-circle">
            {t('asks for more')}
          </StatusPill>
        )}
      </div>

      {quiet && (
        <p className="id-note">{t('Nothing new is being asked for. This update only changes code.')}</p>
      )}

      {diff.renamed && (
        <p data-add>
          <b>{t('Renamed')}</b>{' '}
          {t('from {from} to {to}', { from: diff.renamed.from, to: diff.renamed.to })}
        </p>
      )}

      {/*
        Storage is a boolean, so `listOf` models it as the single value
        "storage" to make every key diff the same way. Printing that value would
        read "Adds private storage: storage", which repeats the key at a
        reviewer and sits oddly beside three lines that name a real host or
        record type. The grant is the whole fact here.
      */}
      {diff.escalations.map((change) => (
        <p key={change.key} data-add>
          <b>{t('Adds')}</b> {t(LABELS[change.key] ?? change.key)}
          {change.key === 'storage' ? null : (
            <>
              : <code>{change.added.join(', ')}</code>
            </>
          )}
        </p>
      ))}

      {diff.newRecordTypes.length > 0 && (
        <p data-add>
          <b>{t('Defines new record types:')}</b> <code>{diff.newRecordTypes.join(', ')}</code>
        </p>
      )}

      {diff.reductions.map((change) => (
        <p key={change.key} data-drop>
          {t('Drops {permission}:', { permission: t(LABELS[change.key] ?? change.key) })}{' '}
          <code>{change.removed.join(', ')}</code>
        </p>
      ))}
    </section>
  )
}

function Grants(props: { grants: PermissionChange[] }) {
  return (
    <section className="mod-diff">
      <div className="mod-diff-head">
        <h3>{t('What it asks for')}</h3>
      </div>
      {props.grants.length === 0 ? (
        <p className="id-note">
          {t('Nothing. It reads public town data, which needs no declaration, and can reach nothing else.')}
        </p>
      ) : (
        props.grants.map((grant) => (
          <p key={grant.key} data-add>
            <b>{t(LABELS[grant.key] ?? grant.key)}:</b> <code>{grant.added.join(', ')}</code>
          </p>
        ))
      )}
    </section>
  )
}
