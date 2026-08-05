/**
 * The shell's side of reporting.
 *
 * One call, and that is the entire surface a resident has onto moderation. No
 * "how many reports does this have", no "what happened to mine": both would
 * make a report into a public signal, and a public signal is a thing worth
 * manufacturing.
 */

import { isError, type ApiError } from './session.js'

export type ReportReason = 'illegal' | 'security' | 'impersonation' | 'spam' | 'broken' | 'other'

/**
 * What a resident actually picks from.
 *
 * Written as sentences rather than category names, because the honest version
 * of this list tells someone what will happen. Town Square is neutral
 * substrate: it follows the law and stops there, and most of these get read and
 * closed. Saying so here is fairer than a form that implies otherwise.
 */
export const REPORT_REASONS: ReadonlyArray<{ value: ReportReason; label: string }> = [
  { value: 'illegal', label: 'Illegal — this breaks the law' },
  { value: 'security', label: 'Security — it is doing something it should not be able to' },
  { value: 'impersonation', label: 'Impersonation — it pretends to be someone or something else' },
  { value: 'spam', label: 'Spam — it exists to advertise' },
  { value: 'broken', label: 'Broken — it does not work any more' },
  { value: 'other', label: 'Something else' },
]

export interface FiledReport {
  report: { id: string; reason: ReportReason; targetLabel: string; createdAt: number }
  /** The resident already had an open report on this. Say so; do not pretend. */
  duplicate: boolean
}

export async function fileReport(input: {
  slug: string
  reason: ReportReason
  detail: string
  version?: string
}): Promise<FiledReport | ApiError> {
  const res = await fetch('/api/reports', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const parsed: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    return (
      (parsed as ApiError | null) ?? { error: 'unavailable', message: 'Could not send that.' }
    )
  }
  return parsed as FiledReport
}

export { isError }
