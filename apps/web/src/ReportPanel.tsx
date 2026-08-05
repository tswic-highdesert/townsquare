/**
 * Reporting a creation, from the chrome around it.
 *
 * It lives in the shell's footer rather than inside the frame, for the same
 * reason the header does: a creation cannot draw over the chrome, so a resident
 * always has one surface that is definitely Town Square's. A report button
 * rendered by the thing being reported would be worth nothing.
 *
 * Three things this deliberately does not do. It does not say how many other
 * people reported the same creation, it does not promise an outcome, and it
 * does not pretend a duplicate was a new report. Reporting here is a way to ask
 * a neighbour to look at something, not a voting mechanism.
 *
 * The reasons are radios rather than a select, because the list is the design.
 * A closed set of six is what makes a report triageable, and a dropdown hides
 * five of them behind a tap — which is how "Something else" becomes the modal
 * answer and the queue becomes untriageable again.
 */

import { useId, useState } from 'react'
import { Icon } from './Icon.js'
import {
  REPORT_REASONS,
  fileReport,
  isError,
  type ReportReason,
} from './reportApi.js'
import './creations/creations.css'

export interface ReportPanelProps {
  slug: string
  name: string
  /** From the manifest a resident is running, so a moderator reads the right bytes. */
  version?: string
  /** Null when signed out. Reporting needs a verified resident. */
  account: { handle: string; verified: boolean } | null
  onClose(): void
}

export function ReportPanel(props: ReportPanelProps) {
  const group = useId()
  const [reason, setReason] = useState<ReportReason>('broken')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)

  // Said up front rather than after the click. Finding out that the form you
  // just filled in was never going to send is worse than not seeing the form.
  if (!props.account?.verified) {
    return (
      <div className="cr-report">
        <div className="cr-report-h">Report {props.name}</div>
        <p className="cr-report-note">
          {props.account
            ? 'Reporting is for verified residents. Someone who is already verified can vouch for you from their account page.'
            : 'Sign in to report this. Reporting is for verified residents, so a moderator knows a neighbour is behind it.'}
        </p>
        <div className="cr-report-foot">
          <button className="cr-secondary-sm" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
    )
  }

  async function send() {
    setBusy(true)
    setProblem(null)
    const result = await fileReport({
      slug: props.slug,
      reason,
      detail,
      ...(props.version ? { version: props.version } : {}),
    })
    setBusy(false)

    if (isError(result)) {
      setProblem(result.message)
      return
    }
    setOutcome(
      result.duplicate
        ? 'You had already reported this, so we kept your first report rather than adding another.'
        : 'Sent. A moderator will read it. Most reports are read and closed with nothing else happening, and that is normal.',
    )
  }

  if (outcome) {
    return (
      <div className="cr-report">
        <div className="cr-report-h">Report {props.name}</div>
        <p className="cr-report-note">{outcome}</p>
        <div className="cr-report-foot">
          <button className="cr-secondary-sm" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="cr-report">
      <div className="cr-report-h">Tell the committee what happened</div>
      <p className="cr-report-note">
        Town Square follows the law and does not referee taste. What gets acted on is mostly the
        first two.
      </p>

      <div className="cr-report-opts" role="radiogroup" aria-label="What is wrong">
        {REPORT_REASONS.map((r) => (
          <label key={r.value} className="cr-radio">
            <input
              type="radio"
              name={group}
              value={r.value}
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
            />
            {r.label}
          </label>
        ))}
      </div>

      <label className="cr-report-detail">
        <span>Anything a moderator should know</span>
        <textarea
          className="cr-textarea"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={2}
          placeholder="Optional. A sentence is plenty."
        />
      </label>

      {problem && (
        <p className="cr-report-problem" role="alert">
          <Icon name="alert-circle" size={14} /> {problem}
        </p>
      )}

      <div className="cr-report-foot">
        {/*
          Who it is sent as, and with what. A report that does not say it
          carries your handle is a report somebody files thinking it is
          anonymous, and finds out later that it was not.
        */}
        <span>
          Sent as @{props.account.handle}
          {props.version ? ` with version ${props.version}` : ''}.
        </span>
        <button className="cr-secondary-sm" disabled={busy} onClick={props.onClose}>
          Cancel
        </button>
        <button className="cr-primary-sm" disabled={busy} onClick={() => void send()}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
