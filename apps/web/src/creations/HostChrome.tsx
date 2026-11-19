/**
 * The strip above a running creation, and the strip below it.
 *
 * This is not decoration. It is the reason a creation cannot credibly imitate
 * Town Square: a resident always has a frame of reference the guest cannot draw
 * over, and there is no login form anywhere inside a creation for one to
 * imitate. Three properties hold it up and none of them should be traded for
 * layout:
 *
 *   **The badge never moves.** It is pinned to the end of the strip, it is not
 *   conditional, and a long title does not push it. A badge whose position
 *   depends on content is a badge whose position can be predicted, and a
 *   predictable position is a coverable one.
 *
 *   **The live title is a separate row.** `app.setTitle` is the only place a
 *   creation gets to write in our chrome, so it goes in a quieter voice on its
 *   own line rather than substituting into the title we wrote. It is rendered
 *   as a text node.
 *
 *   **Report sits outside the frame.** A resident reporting a creation is
 *   always talking to Town Square and never to the thing they are reporting.
 *   Putting that button inside the frame would be the single most obvious hole
 *   in the design.
 */

import { Icon } from '../Icon.js'
import { AppIcon } from './parts.js'
import { t } from '../i18n/index.js'
import type { CreationSummary } from '../townData.js'

export interface HostChromeProps {
  creation: CreationSummary
  /** The last thing the creation reported through `app.setTitle`, if anything. */
  liveTitle: string | null
  /** Set when the host caught the creation doing something it should not. */
  alert?: boolean
  onBack: () => void
}

export function HostChrome(props: HostChromeProps) {
  const { creation } = props

  return (
    <>
      <div className="cr-chrome" data-state={props.alert ? 'alert' : undefined}>
        <button className="cr-iconbtn" aria-label={t('Back')} onClick={props.onBack}>
          <Icon name="arrow-left" size={20} />
        </button>
        <AppIcon creation={creation} size="sm" />
        <div className="cr-chrome-id">
          <h1 className="cr-chrome-title">{creation.name}</h1>
          {/*
            Attribution is platform-assigned at approval and a manifest that
            asserts an author is rejected outright as an impersonation attempt.
            Nothing in development has been through the review queue, so this is
            the honest line, and it is deliberately not initials.
          */}
          <span className="cr-chrome-by">{t('by a neighbor')}</span>
        </div>
        <span className="cr-badge">{t('Sandboxed')}</span>
      </div>

      {props.liveTitle && <div className="cr-livetitle">{props.liveTitle}</div>}
    </>
  )
}

export interface FooterChromeProps {
  version: string
  reporting: boolean
  onToggleReport: () => void
}

export function FooterChrome(props: FooterChromeProps) {
  return (
    <div className="cr-footchrome" data-state={props.reporting ? 'open' : undefined}>
      <Icon name="package" size={14} />
      <span>{t('running on Town Square · v{version}', { version: props.version })}</span>
      <button
        className="cr-linkbtn"
        data-state={props.reporting ? 'on' : undefined}
        aria-expanded={props.reporting}
        onClick={props.onToggleReport}
      >
        {t('Report')}
      </button>
    </div>
  )
}
