/**
 * Drafts: scratch space, with recovery.
 *
 * Autosave is worth nothing if a resident cannot find the thing it saved, so
 * this list is one tap from the plus and every row resumes exactly where it was
 * left. The row says what is still missing before it can post, because "why is
 * the button greyed out" is a question a resident should never have to open a
 * composer to answer.
 *
 * **Drafts are yours alone.** Not a moderator's, not an organisation's you help
 * run. The line at the bottom says so, and it is true because the store is
 * scoped by owner with no method that could address anybody else's.
 */

import { Icon } from '../Icon.js'
import { EmptyState } from '../ui/index.js'
import { t, tn } from '../i18n/index.js'
import { TYPE_NAMES, type ContributionType, type Draft } from './contributeData.js'

const TYPE_ICON: Record<ContributionType, 'calendar' | 'edit' | 'megaphone' | 'layers' | 'camera'> =
  {
    event: 'calendar',
    correction: 'edit',
    notice: 'megaphone',
    collection: 'layers',
    photo: 'camera',
  }

export function DraftsList(props: {
  drafts: Draft[]
  onResume: (draft: Draft) => void
  onDiscard: (draft: Draft) => void
}) {
  if (props.drafts.length === 0) {
    return (
      <EmptyState
        mark="tray"
        line={t('Nothing half-written.')}
        sub={t('Anything you start is kept here automatically, even if you close the app in the middle of it.')}
      />
    )
  }

  return (
    <>
      <h1 className="cn-h1">{t('Your drafts')}</h1>
      <ul className="cn-drafts">
        {props.drafts.map((draft) => (
          <li className="cn-draft" key={draft.id}>
            <span className="cn-draft-ic" data-type={draft.type}>
              <Icon name={TYPE_ICON[draft.type]} size={16} />
            </span>
            <button type="button" className="cn-draft-text" onClick={() => props.onResume(draft)}>
              <b>{draft.title}</b>
              <span>
                <span className="cn-cap">{t(TYPE_NAMES[draft.type])}</span> · {ago(draft.updatedAt)}
              </span>
              {missing(draft) ? (
                <span className="cn-draft-missing">
                  <Icon name="alert-circle" size={14} /> {missing(draft)}
                </span>
              ) : null}
              {stale(draft.updatedAt) ? (
                <span className="cn-draft-old">
                  <Icon name="archive" size={14} /> {t('Drafts are kept for 90 days, then tidied away')}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="cn-icon-btn cn-icon-btn--sm"
              aria-label={t('Throw away {title}', { title: draft.title })}
              onClick={() => props.onDiscard(draft)}
            >
              <Icon name="trash" size={16} />
            </button>
          </li>
        ))}
      </ul>
      <p className="cn-drafts-foot">
        {t('Drafts are yours alone. Nobody else can see one, not a moderator, not an organisation you help run.')}
      </p>
    </>
  )
}

/**
 * What is stopping this one going up, in the resident's own terms.
 *
 * Deliberately a hint rather than a validation result: the real check runs on
 * the server at publish, and a client that decided a draft was publishable
 * would be the second implementation of a rule that only gets to have one.
 */
function missing(draft: Draft): string | null {
  const c = draft.content as Record<string, unknown>
  const has = (key: string) => typeof c[key] === 'string' && (c[key] as string).trim().length > 0

  switch (draft.type) {
    case 'event':
      if (!has('title')) return t('Needs a name before it can post')
      if (typeof c['startsAt'] !== 'number') return t('Needs a start time before it can post')
      return null
    case 'correction':
      if (!has('newValue')) return t('Needs the corrected value')
      if (!has('reason')) return t('Needs a reason before it can be sent')
      return null
    case 'notice':
      return has('title') ? null : t('Needs a line saying what it is')
    case 'collection':
      if (!has('name')) return t('Needs a name')
      return Array.isArray(c['items']) && (c['items'] as unknown[]).length > 0
        ? null
        : t('Needs at least one thing in it')
    default:
      return null
  }
}

const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000
/** Warned about only once it is old enough for the tidy-away to be relevant. */
const stale = (at: number) => Date.now() - at > NINETY_DAYS * 0.75

function ago(at: number): string {
  const mins = Math.round((Date.now() - at) / 60_000)
  if (mins < 1) return t('just now')
  // English has always said "1 minutes ago"; both forms are given so the
  // English output is unchanged while Spanish gets a real singular.
  if (mins < 60) return tn(mins, '{count} minutes ago', '{count} minutes ago')
  const hours = Math.round(mins / 60)
  if (hours < 24) return tn(hours, '{count} hours ago', '{count} hours ago')
  const days = Math.round(hours / 24)
  return days === 1 ? t('yesterday') : tn(days, '{count} days ago', '{count} days ago')
}
