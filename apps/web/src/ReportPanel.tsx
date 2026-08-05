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
 */

import { useState } from 'react'
import {
  REPORT_REASONS,
  fileReport,
  isError,
  type ReportReason,
} from './reportApi.js'

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
  const [reason, setReason] = useState<ReportReason>('broken')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)

  // Said up front rather than after the click. Finding out that the form you
  // just filled in was never going to send is worse than not seeing the form.
  if (!props.account?.verified) {
    return (
      <div className="report">
        <h2>Report {props.name}</h2>
        <p className="note">
          {props.account
            ? 'Reporting is for verified residents. Someone who is already verified can vouch for you from their account page.'
            : 'Sign in to report this. Reporting is for verified residents, so a moderator knows a neighbour is behind it.'}
        </p>
        <button className="back" onClick={props.onClose}>
          Close
        </button>
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
      <div className="report">
        <h2>Report {props.name}</h2>
        <p className="outcome">{outcome}</p>
        <button className="back" onClick={props.onClose}>
          Close
        </button>
      </div>
    )
  }

  return (
    <div className="report">
      <h2>Report {props.name}</h2>
      <p className="note">
        Town Square follows the law and does not referee taste. What gets acted on is mostly the
        first two.
      </p>

      <label className="report-field">
        <span>What is wrong</span>
        <select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
          {REPORT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className="report-field">
        <span>Anything a moderator should know</span>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          placeholder="Optional. What you saw, and where."
        />
      </label>

      <div className="buttons">
        <button className="primary" disabled={busy} onClick={() => void send()}>
          Send report
        </button>
        <button className="back" disabled={busy} onClick={props.onClose}>
          Cancel
        </button>
      </div>
      {problem && <p className="problem">{problem}</p>}
    </div>
  )
}
