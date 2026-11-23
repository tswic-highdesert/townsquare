/**
 * The trust page. `design/hifi-v2/sections/06-creations`, specimen 5.
 *
 * This is the moment a resident decides, and it is not a formality. Every line
 * on it comes from `describeManifest` reading the frozen manifest, so a
 * creation cannot write its own trust page — that property is the reason the
 * manifest is declarative at all, and nothing in this file goes near it.
 *
 * The arrangement is by consequence, not by capability. What outlives the visit
 * and what leaves town get the terracotta inset and sit at the top; the rest is
 * true of nearly every creation and reads as reassurance. Absence is stated as
 * loudly as presence, because "can't reach anything outside town" is the most
 * reassuring line available and it only means something because it is generated
 * from the same field that would otherwise list a host.
 *
 * The demanding manifest gets no red, no warning triangle and no scare copy. It
 * gets a count, a second button, and one sentence saying it is fine to walk
 * away. Making this screen frightening would teach residents to fear the trust
 * sheet rather than read it, and the sheet is only worth anything if they read
 * it every time.
 */

import { Icon } from '../Icon.js'
import { Button } from '../ui/index.js'
import { AppIcon, MADE_BY, TRUST_GLYPHS, trustText } from './parts.js'
import { t } from '../i18n/index.js'
import { summariseTrust } from './trustGroups.js'
import type { CreationSummary } from '../townData.js'
import './creations.css'

export interface TrustScreenProps {
  creation: CreationSummary
  /** Where back goes, named. "Back" tells a resident nothing about where. */
  backLabel: string
  onBack: () => void
  onOpen: () => void
  /** Optional: the fuller page about this creation, when the shell has a route for it. */
  onDetail?: () => void
}

const TALLY_GLYPH = { calm: 'check-circle', notable: 'info', heavy: 'alert-circle' } as const

export function TrustScreen(props: TrustScreenProps) {
  const { creation } = props
  const summary = summariseTrust(creation.manifest)

  return (
    <main className="shell cr-screen">
      <button className="cr-back" onClick={props.onBack}>
        <Icon name="arrow-left" size={16} /> {props.backLabel}
      </button>

      <div className="cr-trust-head">
        <AppIcon creation={creation} size="lg" />
        <div>
          <h1 className="cr-h1 cr-h1-tight">{creation.name}</h1>
          <p className="cr-lede cr-lede-tight">{creation.tagline}</p>
          <p className="cr-by">{t(MADE_BY)}</p>
        </div>
      </div>

      <p className="cr-detail-desc">{creation.description}</p>

      {/*
        The heading is above the tally rather than above the first group: a
        resident skimming reads what the screen is about, then the count, then
        as much of the list as they want.
      */}
      <div className="cr-detail-h">{t('What it can touch')}</div>

      <div className="cr-tally" data-tone={summary.tone}>
        <Icon name={TALLY_GLYPH[summary.tone]} size={16} />
        {summary.tally}
      </div>

      {summary.groups.map((group) => (
        <div key={group.title}>
          <div className="cr-trust-group">{group.title}</div>
          <ul className="cr-trust">
            {group.lines.map((line) => (
              <li key={line.kind} data-weight={line.weight}>
                <div className="cr-trust-icon">
                  <Icon name={TRUST_GLYPHS[line.kind]} size={16} />
                </div>
                <div>
                  <div className="cr-trust-title">{trustText(line.title)}</div>
                  <div className="cr-trust-detail">{trustText(line.detail)}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {summary.counsel && (
        <div className="cr-counsel">
          <Icon name="scale" size={16} />
          <div>
            <b>{t('You do not have to open this.')}</b>
            <span>
              {t(
                'Nothing on this page is an accusation. The committee approved it because it declared everything honestly, which is a different question from whether you want it.',
              )}
            </span>
          </div>
        </div>
      )}

      {/*
        The label stays "Open" whatever the tally says. Repeating the creation's
        name on the button under a heading that already carries it adds nothing
        for a sighted resident and makes a screen reader say it twice.
      */}
      <div className={summary.counsel ? 'cr-actions' : 'cr-action'}>
        {/* The safe choice first, so it is the easy target under a thumb. */}
        {summary.counsel && (
          <Button variant="secondary" size="lg" full onClick={props.onBack}>
            {t('Not now')}
          </Button>
        )}
        <Button variant="primary" size="lg" full onClick={props.onOpen}>
          {t('Open')}
        </Button>
      </div>

      {props.onDetail && (
        <p className="cr-trust-more">
          <button className="cr-linkbtn" onClick={props.onDetail}>
            {t('More about this creation')}
          </button>
        </p>
      )}

      {/*
        The version, and not a review date. Every creation in the gallery was
        approved by a person, but the catalogue does not carry when — and a
        date is exactly the kind of detail that would be believed.
      */}
      <p className="cr-footnote">
        {t(
          'Version {version}. Reviewed by a neighbour on the committee before it went up, and every update is read again.',
          { version: creation.manifest.version },
        )}
      </p>
    </main>
  )
}
