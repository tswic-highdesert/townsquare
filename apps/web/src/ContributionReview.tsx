import { useEffect, useState } from 'react'
import { Button, Card, CardBody, EmptyState, InlineError, RowItem, RowList, Textarea } from './ui/index.js'
import type { Contribution } from './contribute/contributeData.js'
import { intlLocale, t } from './i18n/index.js'
import { decideContribution, fetchContributionQueue, fetchContributionReview, isError, type CorrectionReviewDetail } from './reviewApi.js'

/** A reviewer sees the original proposal and the current value before deciding. */
export function ContributionReview() {
  const [rows, setRows] = useState<Contribution[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  async function refresh() {
    setSelected(null); setError(''); setRows(null)
    try {
      const result = await fetchContributionQueue()
      if (isError(result)) setError(result.message)
      else setRows(result)
    } catch { setError(t('The correction queue could not be loaded. Please try again.')) }
  }
  useEffect(() => { void refresh() }, [])
  if (selected) return <CorrectionDecision id={selected} onBack={() => void refresh()} />
  return <>
    <h1 className="id-h1">{t('Community corrections')}</h1>
    <p className="id-lede">{t('Neighbors help keep the directory useful. Check the source before changing a public listing.')}</p>
    {error && <><InlineError live>{error}</InlineError><Button onClick={() => void refresh()}>{t('Try again')}</Button></>}
    {!rows && !error && <p role="status">{t('Loading corrections…')}</p>}
    {rows?.length === 0 && <EmptyState mark="tray" tone="good" line={t('Nothing waiting')} sub={t('New corrections will appear here for a person to review.')} />}
    {rows && rows.length > 0 && <RowList label={t('Corrections waiting for review')}>
      {rows.map((row) => <RowItem key={row.id} title={titleOf(row)} onClick={() => setSelected(row.id)} meta={<>{'handle' in row.attribution ? `@${row.attribution.handle}` : t('Community contribution')} · {new Date(row.createdAt).toLocaleDateString(intlLocale())}</>} trailing={t('Review')} />)}
    </RowList>}
  </>
}

function titleOf(row: Contribution): string {
  const label = row.content['targetLabel'] ?? row.content['title'] ?? row.type
  return `${String(label)}${row.type === 'correction' ? ` · ${String(row.content['field'])}` : ''}`
}

function CorrectionDecision({ id, onBack }: { id: string; onBack(): void }) {
  const [detail, setDetail] = useState<CorrectionReviewDetail | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [decided, setDecided] = useState<Contribution | null>(null)
  useEffect(() => {
    let active = true
    void fetchContributionReview(id).then((result) => {
      if (!active) return
      if (isError(result)) setError(result.message)
      else {
        setDetail(result)
        if (result.contribution.status !== 'queued') setDecided(result.contribution)
      }
    }, () => active && setError(t('This correction could not be loaded. Go back and try again.')))
    return () => { active = false }
  }, [id])
  async function decide(decision: 'approve' | 'decline') {
    setBusy(true); setError('')
    try {
      const result = await decideContribution(id, decision, note)
      if (isError(result)) {
        setError(result.message)
        if (result.error === 'conflict' || result.error === 'stale') {
          const fresh = await fetchContributionReview(id)
          if (!isError(fresh)) {
            setDetail(fresh)
            if (fresh.contribution.status !== 'queued') setDecided(fresh.contribution)
          }
        }
      } else setDecided(result.contribution)
    } catch { setError(t('The decision could not be saved. Please try again.')) }
    finally { setBusy(false) }
  }
  const beforeValue = detail?.contribution.content['beforeValue']
  const changedSinceSubmission = typeof beforeValue === 'string' && Boolean(beforeValue) && detail?.currentValue !== null && beforeValue !== detail?.currentValue
  return <>
    <Button variant="quiet" icon="arrow-left" onClick={onBack} disabled={busy}>{t('Back to corrections')}</Button>
    {error && <InlineError live>{error}</InlineError>}
    {!detail && !error && <p role="status">{t('Loading the proposal…')}</p>}
    {detail && <>
      <h1 className="id-h1">{titleOf(detail.contribution)}</h1>
      {decided ? <Card><CardBody><h2 className="id-h2">{decided.status === 'published' ? t('Correction published') : decided.status === 'declined' ? t('Correction declined') : t('Correction withdrawn')}</h2><p>{t('The decision is saved and visible to the neighbor who sent it.')}</p>{decided.decisionNote && <blockquote>{decided.decisionNote}</blockquote>}</CardBody></Card> : <>
        <div className="mod-correction-diff">
          <section><h2 className="id-h2">{t('On the listing now')}</h2><p>{detail.currentValue || t('No value is listed.')}</p></section>
          <section><h2 className="id-h2">{t('Proposed change')}</h2><p>{String(detail.contribution.content['newValue'] ?? detail.contribution.content['title'] ?? '')}</p></section>
        </div>
        <h2 className="id-h2">{t('How the neighbor knows')}</h2>
        <p className="id-note">{String(detail.contribution.content['reason'] ?? detail.contribution.content['body'] ?? '')}</p>
        <Textarea label={t('Note to the neighbor')} value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={4000} help={t('Required when declining. Explain the decision kindly; the neighbor will read these exact words.')} />
        {changedSinceSubmission && <InlineError>{t('This listing changed since the correction was submitted. Decline with an explanation so the neighbor can send an updated proposal.')}</InlineError>}
        <p className="id-fine">{t('Approval changes the public listing after its short cache refresh. Every version stays in the record.')}</p>
        <div className="id-actions"><Button variant="primary" disabled={busy || changedSinceSubmission} onClick={() => void decide('approve')}>{t('Approve correction')}</Button><Button variant="secondary" disabled={busy || !note.trim()} onClick={() => void decide('decline')}>{t('Decline correction')}</Button></div>
      </>}
    </>}
  </>
}
