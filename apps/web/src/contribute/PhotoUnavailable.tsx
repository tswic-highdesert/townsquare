/**
 * Share a photo, which does not work yet, and says so.
 *
 * This screen is a decision rather than a placeholder. Section 12 draws a
 * complete photo composer with five upload states and a panel explaining that
 * we stripped the EXIF location out of the file. Every part of that is right,
 * and none of it can ship: there is no image store in this repo, nothing strips
 * EXIF, and an upload control that accepted a file and dropped it would be the
 * worst version of this screen.
 *
 * So the honest thing is a straight answer, in the same voice the rest of the
 * product uses, that names what is missing. The service agrees: submitting a
 * photo returns `501 unavailable` with the same reason, which is a different
 * code from `invalid` precisely so nobody goes hunting for the mistake in their
 * caption.
 *
 * The EXIF promise is repeated here, in the future tense, because it is the
 * reason this is worth waiting for rather than working around. A resident who
 * would otherwise post the picture somewhere with no such promise should know
 * what the delay is buying them.
 */

import { Button } from '../ui/index.js'
import { Icon } from '../Icon.js'
import { t } from '../i18n/index.js'

export function PhotoUnavailable(props: { reason: string | null; onBack: () => void }) {
  return (
    <div className="cn-gate">
      <div className="cn-gate-ic">
        <Icon name="camera" size={32} />
      </div>
      <h3 className="cn-gate-title">{t('Photos are not open yet')}</h3>
      <p className="cn-gate-body">
        {props.reason ??
          t('Sharing a photo needs somewhere to put the file and an EXIF strip before it lands, and Town Square has no image store yet.')}
      </p>
      <p className="cn-gate-body">
        {t("When it opens, your phone's copy of the picture will still have the exact coordinates of wherever you took it written inside the file. We will take that out, along with the camera serial, before anything leaves your phone, and we will say so on the screen at the moment it happens. That is the part worth waiting for.")}
      </p>

      <div className="cn-gate-alt">
        <p className="cn-gate-alt-head">{t('In the meantime')}</p>
        <ul className="cn-gate-list">
          <li>
            <Icon name="calendar" size={16} />
            <span>
              {t('If the photo is of something happening, the thing itself is an event and anyone verified can add one.')}
            </span>
          </li>
        </ul>
      </div>

      <Button variant="secondary" onClick={props.onBack}>
        {t('Back')}
      </Button>
    </div>
  )
}
