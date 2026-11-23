/**
 * "You are leaving Town Square": the question a resident answers before a
 * creation's link opens.
 *
 * Drawn by the shell, outside the frame, so a creation cannot restyle it,
 * cover it or press its buttons. Everything shown comes from the host's checked
 * copy of the link (`checkOutboundLink`), never from the creation's own text:
 * the destination in large type is the parsed host name, in ASCII, so a
 * look-alike domain shows up as the `xn--` name it really is.
 *
 * Nothing here is rendered as HTML. Every value is a React text node.
 */

import type { OutboundLink } from '@townsquare/shared'
import { Icon } from '../Icon.js'
import { Button, Modal } from '../ui/index.js'
import { t } from '../i18n/index.js'

export interface LeavingDialogProps {
  /** The creation asking, by its approved manifest name. */
  creationName: string
  link: OutboundLink | null
  onStay(): void
  onGo(): void
}

/** Long query strings are real but unreadable; the host carries the meaning. */
const MAX_SHOWN_URL_CHARS = 300

export function LeavingDialog({ creationName, link, onStay, onGo }: LeavingDialogProps) {
  if (!link) return <Modal open={false} onClose={onStay} title="" />

  switch (link.kind) {
    case 'web':
      return (
        <Modal
          open
          onClose={onStay}
          kind="confirm"
          className="cr-leaving"
          title={t("You're leaving Town Square")}
          description={t(
            "{name} wants to open a website in a new tab. Town Square doesn't run that site and can't vouch for it.",
            { name: creationName },
          )}
          actions={
            <>
              <Button variant="secondary" onClick={onStay}>
                {t('Stay here')}
              </Button>
              <Button variant="primary" trailingIcon="external" onClick={onGo}>
                {t('Open site')}
              </Button>
            </>
          }
        >
          <div className="cr-leaving-dest">
            <span className="cr-leaving-label">{t('Going to')}</span>
            <span className="cr-leaving-host">{link.host}</span>
            <span className="cr-leaving-url">{shorten(link.href)}</span>
          </div>
          {!link.secure && (
            <p className="cr-leaving-warn">
              <Icon name="unlock" size={16} />
              <span>
                {t("This site's connection isn't private. Don't type a password or card number there.")}
              </span>
            </p>
          )}
          {link.international && (
            <p className="cr-leaving-warn">
              <Icon name="warning" size={16} />
              <span>
                {t(
                  'This address uses letters from another alphabet, which can make it look like a different site. Check the name carefully.',
                )}
              </span>
            </p>
          )}
        </Modal>
      )

    case 'phone':
      return (
        <Modal
          open
          onClose={onStay}
          kind="confirm"
          className="cr-leaving"
          title={t('Make a phone call?')}
          description={t(
            '{name} wants to start a call. Your phone or calling app will open with this number, and nothing is dialled until you press call there.',
            { name: creationName },
          )}
          actions={
            <>
              <Button variant="secondary" onClick={onStay}>
                {t('Not now')}
              </Button>
              <Button variant="primary" icon="phone" onClick={onGo}>
                {t('Call')}
              </Button>
            </>
          }
        >
          <div className="cr-leaving-dest">
            <span className="cr-leaving-label">{t('Calling')}</span>
            <span className="cr-leaving-host">{link.number}</span>
          </div>
        </Modal>
      )

    case 'email':
      return (
        <Modal
          open
          onClose={onStay}
          kind="confirm"
          className="cr-leaving"
          title={t('Write an email?')}
          description={
            link.subject || link.hasBody
              ? t(
                  '{name} wants to start an email. Your email app will open with a message drafted for you to read, and nothing is sent until you press send there.',
                  { name: creationName },
                )
              : t(
                  '{name} wants to start an email. Your email app will open, and nothing is sent until you press send there.',
                  { name: creationName },
                )
          }
          actions={
            <>
              <Button variant="secondary" onClick={onStay}>
                {t('Not now')}
              </Button>
              <Button variant="primary" icon="mail" onClick={onGo}>
                {t('Write email')}
              </Button>
            </>
          }
        >
          <div className="cr-leaving-dest">
            <span className="cr-leaving-label">{t('To')}</span>
            <span className="cr-leaving-host">{link.to}</span>
            {link.subject && <span className="cr-leaving-url">{t('Subject: {subject}', { subject: link.subject })}</span>}
          </div>
        </Modal>
      )
  }
}

function shorten(href: string): string {
  return href.length > MAX_SHOWN_URL_CHARS ? href.slice(0, MAX_SHOWN_URL_CHARS - 1) + '…' : href
}
