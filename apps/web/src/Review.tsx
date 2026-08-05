/**
 * The review screen. One reviewer, reading source, deciding.
 *
 * The whole design goal is to spend the reviewer's attention only where a
 * machine cannot help. The automated pass already ran at submit, so this screen
 * never shows a manifest error — those never reach the queue. What it does show,
 * in this order:
 *
 *   1. **what changed**, for an update. A permission diff, not a permissions
 *      block. The attack this defends against is getting approved with something
 *      innocuous and then pushing an update that adds a network host, and a
 *      reviewer re-reading a full block for the fifth time will not catch it.
 *   2. **what it asks for**, for a first submission, where everything is new.
 *   3. **the warnings** a human was asked to look at.
 *   4. **the source**, last, because by then you know what to look for.
 *
 * A rejection needs a note. The builder reads it, and "no" with no reason is a
 * dead end they cannot act on.
 */

import { useEffect, useState } from 'react'
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

export interface ReviewScreenProps {
  onBack(): void
}

type Tab = 'submissions' | 'reports' | 'live'

/**
 * Three tabs, in the order the work happens: decide what may run, read what
 * residents said about what already does, act on it.
 *
 * One screen rather than three entry points, because they are one job. A
 * moderator who has to remember that reports live somewhere else is a moderator
 * who reads them weekly.
 */
export function ReviewScreen(props: ReviewScreenProps) {
  const [tab, setTab] = useState<Tab>('submissions')

  const nav = (
    <nav className="review-tabs">
      {(
        [
          ['submissions', 'Submissions'],
          ['reports', 'Reports'],
          ['live', 'Live creations'],
        ] as Array<[Tab, string]>
      ).map(([value, label]) => (
        <button key={value} aria-current={tab === value} onClick={() => setTab(value)}>
          {label}
        </button>
      ))}
    </nav>
  )

  if (tab === 'reports') return <ReportsTab onBack={props.onBack} nav={nav} />
  if (tab === 'live') return <LiveTab onBack={props.onBack} nav={nav} />
  return <SubmissionsTab onBack={props.onBack} nav={nav} />
}

function SubmissionsTab(props: { onBack(): void; nav: React.ReactNode }) {
  const [queue, setQueue] = useState<QueueItem[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    void fetchQueue().then(setQueue)
  }, [])

  function refresh() {
    setOpen(null)
    void fetchQueue().then(setQueue)
  }

  if (open) return <Submission id={open} onDone={refresh} onBack={() => setOpen(null)} />

  return (
    <div className="shell">
      <button className="back" onClick={props.onBack}>
        ← Back
      </button>
      {props.nav}
      <h1>Review queue</h1>

      {queue === null && <p className="lede">Loading…</p>}
      {queue?.length === 0 && (
        <p className="lede">
          Nothing waiting. Every submitted version is reviewed before it runs in anyone's browser,
          including updates to creations that are already live.
        </p>
      )}

      <ul className="queue">
        {queue?.map((item) => (
          <li key={item.id}>
            <button className="queue-row" onClick={() => setOpen(item.id)}>
              <span className="name">{item.name}</span>
              <span className="detail">
                @{item.handle} · v{item.version} ·{' '}
                {item.kind === 'update' ? 'update' : 'new creation'} · {item.fileCount} files ·{' '}
                {Math.ceil(item.byteSize / 1024)} KB
              </span>
              <span className="flags">
                {item.escalates && <span className="flag escalates">asks for more</span>}
                {item.warningCount > 0 && (
                  <span className="flag">
                    {item.warningCount} warning{item.warningCount === 1 ? '' : 's'}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
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
    // The town changed underneath a queued submission is a real outcome, not an
    // error: the reviewer meant to approve and the platform said no. Say so
    // plainly rather than showing a success state that did not happen.
    setOutcome(
      result.submission.status === 'approved'
        ? `Live at ${result.creation?.slug ?? ''}.`
        : `Marked ${result.submission.status.replace('_', ' ')}.`,
    )
    setTimeout(props.onDone, 1200)
  }

  if (problem && !detail) return <p className="lede">{problem}</p>
  if (!detail) return <p className="lede">Loading…</p>

  const manifest = detail.submission.manifest as { tagline?: string; description?: string }

  return (
    <div className="shell">
      <button className="back" onClick={props.onBack}>
        ← Queue
      </button>

      <h1>{detail.submission.name}</h1>
      <p className="lede">
        @{detail.submission.handle} · v{detail.submission.version} ·{' '}
        {detail.kind === 'update' ? (
          <>
            update to <code>{detail.live?.slug}</code>, currently on v{detail.live?.version}
          </>
        ) : (
          <>
            new creation, proposed <code>{detail.submission.proposedSlug}</code>
          </>
        )}
      </p>
      {manifest.tagline && <p className="tagline">{manifest.tagline}</p>}
      {manifest.description && <p className="description">{manifest.description}</p>}

      {detail.diff && <Diff diff={detail.diff} />}
      {detail.kind === 'new' && <Grants grants={detail.grants} />}

      {detail.warnings.length > 0 && (
        <section>
          <h2>Flagged for a human</h2>
          <ul className="warnings">
            {detail.warnings.map((w, i) => (
              <li key={i}>
                <code>{w.path}</code> · {w.code} — {w.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Source</h2>
        {detail.files.map((file) => (
          <details key={file.path} open={file.path === 'townsquare.json'}>
            <summary>
              {file.path} · {file.bytes} bytes
            </summary>
            <pre>{file.text}</pre>
          </details>
        ))}
        {detail.omitted.length > 0 && (
          <p className="note">
            Not shown: {detail.omitted.map((o) => `${o.path} (${o.reason})`).join(', ')}
          </p>
        )}
      </section>

      <section className="decide">
        <h2>Decide</h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What the builder should know. Required unless you are approving."
          rows={4}
        />
        <div className="buttons">
          <button disabled={busy} onClick={() => void submit('approve')}>
            Approve and publish
          </button>
          <button disabled={busy} onClick={() => void submit('request_changes')}>
            Request changes
          </button>
          <button disabled={busy} onClick={() => void submit('reject')}>
            Reject
          </button>
        </div>
        {problem && <p className="problem">{problem}</p>}
        {outcome && <p className="outcome">{outcome}</p>}
        <p className="note">
          Approval is of this exact version, pinned by digest <code>{detail.submission.bundleDigest.slice(0, 12)}</code>.
          A later update comes back here.
        </p>
      </section>
    </div>
  )
}

/**
 * The report queue.
 *
 * Deliberately unadorned. There is no count badge, no severity colour and no
 * ranking: a report is one resident saying they looked at something and did not
 * like what they saw, and dressing that up as a signal would make it one.
 */
function ReportsTab(props: { onBack(): void; nav: React.ReactNode }) {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    void fetchReports().then(setReports)
  }, [])

  return (
    <div className="shell">
      <button className="back" onClick={props.onBack}>
        ← Back
      </button>
      {props.nav}
      <h1>Reports</h1>

      {reports === null && <p className="lede">Loading…</p>}
      {reports?.length === 0 && (
        <p className="lede">
          Nothing open. A queue nobody drains is worse than no queue, so these are meant to be read
          and closed — including the many that are read and closed with nothing else happening.
        </p>
      )}

      <ul className="queue">
        {reports?.map((report) => (
          <li key={report.id}>
            <div className="queue-row static">
              <span className="name">
                {report.targetLabel}
                {report.targetVersion ? ` · v${report.targetVersion}` : ''}
              </span>
              <span className="detail">
                {report.reason} · reported by @{report.reporterHandle} ·{' '}
                {new Date(report.createdAt).toLocaleDateString()}
              </span>
              {report.detail && <p className="report-detail">{report.detail}</p>}
              {open === report.id ? (
                <ResolveForm
                  id={report.id}
                  onDone={() => {
                    setOpen(null)
                    void fetchReports().then(setReports)
                  }}
                  onCancel={() => setOpen(null)}
                />
              ) : (
                <div className="buttons">
                  <button onClick={() => setOpen(report.id)}>Close this report</button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="note">
        Acting on a creation — hiding it, blocking it, reverting it — closes the open reports
        against it on its own. This is for the ones where the answer is that nothing needs to
        happen.
      </p>
    </div>
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
    <div className="decide">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="What you concluded. Kept with the report."
      />
      <div className="buttons">
        <button disabled={busy} onClick={() => void submit('dismissed')}>
          Nothing to do
        </button>
        <button disabled={busy} onClick={() => void submit('upheld')}>
          Fair, handled elsewhere
        </button>
        <button className="back" disabled={busy} onClick={props.onCancel}>
          Cancel
        </button>
      </div>
      {problem && <p className="problem">{problem}</p>}
    </div>
  )
}

/** Everything already running, with whatever is wrong with it at the top. */
function LiveTab(props: { onBack(): void; nav: React.ReactNode }) {
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
          void fetchModeratedCreations().then(setRows)
        }}
      />
    )
  }

  return (
    <div className="shell">
      <button className="back" onClick={props.onBack}>
        ← Back
      </button>
      {props.nav}
      <h1>Live creations</h1>

      {rows === null && <p className="lede">Loading…</p>}
      {rows?.length === 0 && <p className="lede">Nothing has been approved yet.</p>}

      <ul className="queue">
        {rows?.map((row) => (
          <li key={row.id}>
            <button className="queue-row" onClick={() => setOpen(row.id)}>
              <span className="name">{row.name}</span>
              <span className="detail">
                /{row.slug}
                {row.activeVersion ? ` · v${row.activeVersion}` : ''} · {row.status}
              </span>
              <span className="flags">
                {row.openReports > 0 && (
                  <span className="flag escalates">
                    {row.openReports} open report{row.openReports === 1 ? '' : 's'}
                  </span>
                )}
                {row.status !== 'active' && <span className="flag">{row.status}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const ACTION_LABEL: Record<string, string> = {
  hide: 'Hide',
  block: 'Block',
  restore: 'Put back',
  revert: 'Reverted',
}

/**
 * One creation, and everything a moderator can do to it.
 *
 * The version list is the important part of this screen. Reverting is the
 * cheapest useful action available — it puts a known-good version back without
 * taking anything away from anybody — so it is shown as a list of versions to
 * choose from rather than buried behind the two blunter buttons.
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
    setOutcome(
      `${ACTION_LABEL[action]}${action === 'revert' ? '' : 'd'}.` +
        (closed ? ` ${closed} open report${closed === 1 ? '' : 's'} closed with it.` : ''),
    )
    setNote('')
    load()
  }

  if (problem && !detail) return <p className="lede">{problem}</p>
  if (!detail) return <p className="lede">Loading…</p>

  const openReports = detail.reports.filter((r) => r.resolvedAt === null)

  return (
    <div className="shell">
      <button className="back" onClick={props.onBack}>
        ← Live creations
      </button>

      <h1>{detail.creation.name}</h1>
      <p className="lede">
        /{detail.creation.slug} · {detail.creation.status}
      </p>

      {openReports.length > 0 && (
        <section className="diff escalates">
          <h2>Open reports</h2>
          {openReports.map((report) => (
            <p key={report.id} className="added">
              <strong>{report.reason}</strong>
              {report.targetVersion ? ` · v${report.targetVersion}` : ''} — @{report.reporterHandle}
              {report.detail ? `: ${report.detail}` : ''}
            </p>
          ))}
        </section>
      )}

      <section className="decide">
        <h2>Act</h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Why. Required, and kept in the moderation log."
        />
        <div className="buttons">
          {detail.creation.status === 'active' ? (
            <>
              <button disabled={busy} onClick={() => void act('hide')}>
                Hide
              </button>
              <button disabled={busy} onClick={() => void act('block')}>
                Block
              </button>
            </>
          ) : (
            <button disabled={busy} onClick={() => void act('restore')}>
              Put it back
            </button>
          )}
        </div>
        {problem && <p className="problem">{problem}</p>}
        {outcome && <p className="outcome">{outcome}</p>}
        <p className="note">
          Nothing here deletes anything. Hidden and blocked both stop the sandbox serving it, and
          both are undone by putting it back.
        </p>
      </section>

      <section>
        <h2>Versions</h2>
        <ul className="versions">
          {detail.versions.map((version) => (
            <li key={version.id}>
              <span className="name">
                v{version.version}
                {version.live && <span className="flag">live</span>}
                {version.revertedFromVersionId && <span className="flag">a revert</span>}
              </span>
              <span className="detail">
                {version.status} · {new Date(version.createdAt).toLocaleDateString()} ·{' '}
                <code>{version.bundleDigest.slice(0, 12)}</code>
              </span>
              {version.revertable && (
                <button disabled={busy} onClick={() => void act('revert', version.id)}>
                  Put this version back
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="note">
          Reverting publishes these exact bytes again as a new version, and re-checks them against
          the digest they were approved with. The version being replaced stays in this list.
        </p>
      </section>

      {detail.log.length > 0 && (
        <section>
          <h2>Moderation log</h2>
          <ul className="warnings">
            {detail.log.map((entry) => (
              <li key={entry.id}>
                {ACTION_LABEL[entry.action] ?? entry.action} · @{entry.actorHandle} ·{' '}
                {new Date(entry.createdAt).toLocaleDateString()}
                {entry.note ? ` — ${entry.note}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

const LABELS: Record<string, string> = {
  identity: 'identity',
  read: 'reads records',
  write: 'writes records',
  network: 'network',
  storage: 'private storage',
  device: 'device',
}

function Diff(props: { diff: ManifestDiff }) {
  const { diff } = props
  const quiet =
    diff.escalations.length === 0 && diff.newRecordTypes.length === 0 && !diff.renamed

  return (
    <section className={diff.escalations.length ? 'diff escalates' : 'diff'}>
      <h2>
        What changed · v{diff.versionFrom} → v{diff.versionTo}
      </h2>

      {quiet && <p className="note">Nothing new is being asked for. This update only changes code.</p>}

      {diff.renamed && (
        <p className="renamed">
          Renamed from <strong>{diff.renamed.from}</strong> to <strong>{diff.renamed.to}</strong>
        </p>
      )}

      {diff.escalations.map((change) => (
        <p key={change.key} className="added">
          <strong>Adds</strong> {LABELS[change.key] ?? change.key}: {change.added.join(', ')}
        </p>
      ))}

      {diff.newRecordTypes.length > 0 && (
        <p className="added">
          <strong>Defines new record types:</strong> {diff.newRecordTypes.join(', ')}
        </p>
      )}

      {diff.reductions.map((change) => (
        <p key={change.key} className="removed">
          Drops {LABELS[change.key] ?? change.key}: {change.removed.join(', ')}
        </p>
      ))}
    </section>
  )
}

function Grants(props: { grants: PermissionChange[] }) {
  if (props.grants.length === 0) {
    return (
      <section className="diff">
        <h2>What it asks for</h2>
        <p className="note">
          Nothing. It reads public town data, which needs no declaration, and can reach nothing else.
        </p>
      </section>
    )
  }
  return (
    <section className="diff">
      <h2>What it asks for</h2>
      {props.grants.map((grant) => (
        <p key={grant.key} className="added">
          <strong>{LABELS[grant.key] ?? grant.key}:</strong> {grant.added.join(', ')}
        </p>
      ))}
    </section>
  )
}
