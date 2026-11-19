/**
 * Version history, from the contributor's side.
 *
 * A revert is a new version, not a deletion, so this list reads as a record of
 * care rather than a disciplinary file. That is the whole reason the screen
 * exists: a resident whose correction was put back can see their version still
 * sitting there with their reason on it, which is the difference between
 *
 *   "Your edit was rejected and has been removed"
 *
 * and
 *
 *   "A moderator put version 2 back on Friday. Your version 3 is still here."
 *
 * The first sentence contains three untrue words. It was not rejected, it was
 * superseded. It was not removed, it is version 3 and always will be. And there
 * is no strike system, so any threat of one is a fiction that costs a real
 * contributor.
 *
 * The footer says the mechanism out loud, because "putting a version back does
 * not erase the ones after it" is the sentence that makes the whole thing safe
 * to use, and a resident who does not know it will not risk the button.
 */

import { useEffect, useState } from 'react'
import { Skeleton } from '../ui/index.js'
import { Icon } from '../Icon.js'
import { t, tn } from '../i18n/index.js'
import { fetchHistory, type Attribution, type RecordHistory } from './contributeData.js'

export function HistoryPanel({ recordId }: { recordId: string }) {
  const [history, setHistory] = useState<RecordHistory | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let live = true
    void fetchHistory(recordId).then((found) => {
      if (!live) return
      if (found === null) setMissing(true)
      else setHistory(found)
    })
    return () => {
      live = false
    }
  }, [recordId])

  if (missing) return <p className="cn-hint">{t('That record is not there any more.')}</p>
  if (!history) return <Skeleton shape="block" height={160} />

  // Newest first: the question is almost always "what does it say now, and who
  // changed it last", and the origin story is the thing you scroll for.
  const versions = [...history.versions].sort((a, b) => b.version - a.version)

  return (
    <>
      <h1 className="cn-h1">{t('History')}</h1>
      <p className="cn-lead">
        {tn(
          versions.length,
          'One version. Everything that has ever been on this record is here.',
          '{count} versions. Everything that has ever been on this record is still here.',
        )}
      </p>

      <ol className="cn-hist">
        {versions.map((version) => {
          const current = version.version === history.record.currentVersion
          return (
            <li className="cn-hist-row" key={version.id} data-current={current || undefined}>
              <span className="cn-hist-dot" aria-hidden="true" />
              <div className="cn-hist-card">
                <div className="cn-hist-head">
                  <b>{t('Version {version}', { version: version.version })}</b>
                  {current ? <span className="cn-hist-now">{t('on the record now')}</span> : null}
                </div>
                <p className="cn-hist-what">{describe(version.data)}</p>
                <p className="cn-hist-who">
                  <Icon name={version.revertedFrom !== null ? 'history' : 'user'} size={14} />{' '}
                  {who(version.author, version.revertedFrom)}
                </p>
              </div>
            </li>
          )
        })}
      </ol>

      <p className="cn-hist-foot">
        <Icon name="info" size={16} />
        {t('Putting a version back does not erase the ones after it. It writes a new version that copies an old one, which is why nobody can quietly rewrite what happened here.')}
      </p>
    </>
  )
}

/**
 * What changed, from the version's own data.
 *
 * Prints the fields the record holds rather than a computed diff. A diff would
 * be nicer and it would also be this screen quietly deciding which change
 * mattered, which is a judgement it has no business making about somebody
 * else's correction.
 */
function describe(data: Record<string, unknown>): string {
  const fields = data['fields']
  if (typeof fields === 'object' && fields !== null) {
    const entries = Object.entries(fields as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => `${k}: ${v as string}`)
    if (entries.length > 0) return entries.join(' · ')
  }
  for (const key of ['title', 'name', 'caption']) {
    if (typeof data[key] === 'string') return data[key] as string
  }
  return t('Created')
}

/**
 * Who wrote this version.
 *
 * A revert names the role and not the person, for the same reason the decline
 * note is signed "a moderator": in a town of 29,000 a named moderator gets
 * stopped in the Kroger car park. The original author keeps the credit for what
 * they wrote, and the revert is a separate line rather than a replacement.
 */
function who(author: Attribution, revertedFrom: number | null): string {
  if (revertedFrom !== null) return t('A moderator put version {version} back', { version: revertedFrom })
  switch (author.kind) {
    case 'resident':
      return `@${author.handle}`
    case 'resident_via_creation':
      return t('@{handle}, through {creation}', { handle: author.handle, creation: author.creationName })
    case 'organisation':
      return t('{org}, by @{handle}', { org: author.orgName, handle: author.handle })
    case 'creation':
      return t('{creation}, owned by @{owner}', { creation: author.creationName, owner: author.ownerHandle })
    case 'source':
      return author.label
  }
}
