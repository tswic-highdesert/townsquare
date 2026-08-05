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
  fetchQueue,
  fetchSubmission,
  isError,
  type ManifestDiff,
  type PermissionChange,
  type QueueItem,
  type ReviewDetail,
} from './reviewApi.js'

export interface ReviewScreenProps {
  onBack(): void
}

export function ReviewScreen(props: ReviewScreenProps) {
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
