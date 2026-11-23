/**
 * The report form, and the three answers it can end on.
 *
 * Reporting is quiet by design and every refusal below is load-bearing. It does
 * not say how many others reported the same thing, it never marks the creation
 * publicly, it does not tell the builder who reported them, and it promises no
 * outcome. Every one of those exists on the platforms this is explicitly not: a
 * visible count is a pile-on button, a public mark is a scarlet letter, and a
 * status thread turns a neighbour's quiet note into a case they now have to
 * follow.
 *
 * Two smaller things the copy has to get right.
 *
 * **The verified gate is stated before the form, never after the send.**
 * Filling in a box that was never going to go anywhere is worse than never
 * seeing the box.
 *
 * **A duplicate is not thanked.** The API answers a second open report with
 * `200` and `duplicate: true` rather than filing another, and pretending it
 * counted would turn the queue into a tally and reporting into a campaign.
 *
 * This is a component rather than a screen so the chrome under a running
 * creation and any later door onto reporting share one form. Reporting from
 * inside the thing being reported would be worth nothing, which is why the
 * caller is always chrome.
 */

import { useState } from 'react'
import { Button, Card, CardBody, InlineError, Select, Textarea } from '../ui/index.js'
import { Icon } from '../Icon.js'
import { REPORT_REASONS, fileReport, isError, type ReportReason } from '../reportApi.js'
import { t } from '../i18n/index.js'
import './identity.css'

export interface ReportFormProps {
  slug: string
  /** What is being reported, in the resident's words rather than a slug. */
  name: string
  /** From the manifest a resident is running, so a moderator reads the right bytes. */
  version?: string
  /** Null when signed out. Reporting needs a verified resident. */
  account: { handle: string; verified: boolean } | null
  onClose(): void
}

export function ReportForm(props: ReportFormProps) {
  const [reason, setReason] = useState<ReportReason>('broken')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<{ duplicate: boolean } | null>(null)

  if (!props.account?.verified) {
    return (
      <Card elevation="raised" className="id-report">
        <CardBody>
          <h2 className="id-report-h">{t('Report {name}', { name: props.name })}</h2>
          <p className="id-report-note">
            {props.account
              ? t('Reporting is for verified residents, so a moderator knows a neighbour is behind it. Someone who is already verified can vouch for you from their account page.')
              : t('Sign in to report this. Reporting is for verified residents, so a moderator knows a neighbour is behind it.')}
          </p>
          <div className="id-actions">
            <Button variant="quiet" onClick={props.onClose}>
              {t('Close')}
            </Button>
          </div>
        </CardBody>
      </Card>
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
    setOutcome({ duplicate: result.duplicate })
  }

  if (outcome) {
    return (
      <Card elevation="raised" className="id-report">
        <CardBody>
          <h2 className="id-report-h">
            {outcome.duplicate ? t('Already reported') : t('Report {name}', { name: props.name })}
          </h2>
          <p className="id-outcome" data-flat={outcome.duplicate || undefined} role="status">
            <Icon name={outcome.duplicate ? 'inbox' : 'check-circle'} size={15} />
            <span>
              {outcome.duplicate
                ? t('You had already reported this, so we kept your first report rather than adding another.')
                : t('Sent. A moderator will read it. Most reports are read and closed with nothing else happening, and that is normal.')}
            </span>
          </p>
          <div className="id-actions">
            <Button variant="quiet" onClick={props.onClose}>
              {t('Close')}
            </Button>
          </div>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card elevation="raised" className="id-report">
      <CardBody>
        <h2 className="id-report-h">{t('Report {name}', { name: props.name })}</h2>
        <p className="id-report-note">
          {t('Town Square follows the law and does not referee taste. What gets acted on is mostly the first two.')}
        </p>

        <Select
          label={t('What is wrong')}
          value={reason}
          onChange={(e) => setReason(e.target.value as ReportReason)}
        >
          {REPORT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {t(r.label)}
            </option>
          ))}
        </Select>

        <Textarea
          label={t('Anything a moderator should know')}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={t('Optional. What you saw, and where.')}
          help={t('One category, one box. More fields would make this feel like paperwork and would collect things a moderator does not need.')}
        />

        {problem && <InlineError live>{problem}</InlineError>}

        <div className="id-actions">
          <Button variant="primary" full loading={busy} onClick={() => void send()}>
            {t('Send report')}
          </Button>
          <Button variant="quiet" full disabled={busy} onClick={props.onClose}>
            {t('Cancel')}
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}
