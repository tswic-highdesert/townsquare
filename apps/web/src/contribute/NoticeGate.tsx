/**
 * Notices, and the gate in front of them.
 *
 * **The gate is a route, not a refusal**, because the person hitting it is
 * almost always right and just in the wrong door. Somebody who wants to post a
 * notice has something to tell the town. Refusing them and stopping there
 * teaches them the product is closed. So the screen names the actual reason,
 * offers the route that solves it, and then lists the three things they
 * probably meant instead, in the order they are likely.
 *
 * The third of those sends them to the phone. That is the correct answer and
 * the one a community platform is usually too proud to give.
 *
 * On the composer side: **the severity list spells out the consequence of each
 * level in the level's own words**, in physical terms rather than policy terms.
 * The failure mode is not malice, it is a kind secretary who genuinely believes
 * the supper time matters urgently, and it does, to her. "Wakes up every phone
 * in Russellville, tonight, including people asleep" is a sentence that stops
 * that; "high priority" is not.
 *
 * There are three rungs here and the ladder has four. `emergency` breaks
 * through a silent phone and is the one channel nobody can turn off, so it is
 * not a thing a person types into a form. The service refuses it outright.
 */

import { Button, Textarea, TextInput } from '../ui/index.js'
import { Icon } from '../Icon.js'
import { NOTICE_SEVERITIES } from './contributeData.js'

export interface NoticeDraft {
  title: string
  body: string
  severity: (typeof NOTICE_SEVERITIES)[number]['value']
}

export const emptyNotice: NoticeDraft = { title: '', body: '', severity: 'informational' }

export function noticeContent(draft: NoticeDraft) {
  return { title: draft.title, body: draft.body, severity: draft.severity }
}

export function noticeMissing(draft: NoticeDraft): string | null {
  if (!draft.title.trim()) return 'The notice needs a line saying what it is.'
  if (!draft.body.trim()) return 'It needs the detail underneath.'
  return null
}

/**
 * What a resident sees when their account is a person.
 *
 * Which, today, is everybody: Town Square has no organisation model yet, so
 * nothing can grant an affiliation and every resident lands here. That is the
 * honest state of the world rather than a screen waiting for a feature flag.
 */
export function NoticeGate(props: {
  reason: string | null
  onPickEvent: () => void
  onPickCorrection: () => void
}) {
  return (
    <div className="cn-gate">
      <div className="cn-gate-ic">
        <Icon name="megaphone" size={32} />
      </div>
      <h3 className="cn-gate-title">Notices come from organisations</h3>
      <p className="cn-gate-body">
        {props.reason ??
          'A notice goes out under an organisation name, so residents know who is telling them.'}{' '}
        The library, a church, the school district, a city department. Your account is a person, so
        this one is not open to you yet.
      </p>
      <p className="cn-gate-body">
        If you run something in town, or you help run it, we can attach you to it. It takes a couple
        of days and a person reads it.
      </p>

      <div className="cn-gate-acts">
        {/* No handler: claiming an organisation needs an organisation model,
            and there is not one. A button that opened nothing would be worse
            than a sentence that says what to do. */}
        <p className="cn-gate-soon">
          <Icon name="badge-check" size={16} />
          Claiming an organisation is not built yet. Email a moderator and they will sort it out.
        </p>
      </div>

      <div className="cn-gate-alt">
        <p className="cn-gate-alt-head">Or, if what you have is one of these</p>
        <ul className="cn-gate-list">
          <li>
            <Icon name="calendar" size={16} />
            <span>
              <b>Something is happening.</b> That is an event, and anyone verified can add one.
            </span>
            <Button variant="quiet" size="sm" onClick={props.onPickEvent}>
              Add an event
            </Button>
          </li>
          <li>
            <Icon name="edit" size={16} />
            <span>
              <b>Something is wrong on a listing.</b> That is a correction.
            </span>
            <Button variant="quiet" size="sm" onClick={props.onPickCorrection}>
              Correct a listing
            </Button>
          </li>
          <li>
            <Icon name="alert-circle" size={16} />
            <span>
              <b>Water is out on your street right now.</b> Ring the city. We are not an emergency
              service and we will not pretend to be.
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}

/** The composer, for an account that is attached to an organisation. */
export function NoticeComposer(props: {
  draft: NoticeDraft
  onChange: (draft: NoticeDraft) => void
}) {
  const { draft, onChange } = props

  return (
    <>
      <TextInput
        label="The notice"
        value={draft.title}
        maxLength={140}
        onChange={(e) => onChange({ ...draft, title: e.target.value })}
      />

      <Textarea
        label="Detail"
        value={draft.body}
        rows={3}
        maxLength={400}
        help="Say it the way you would say it from the pulpit."
        onChange={(e) => onChange({ ...draft, body: e.target.value })}
      />

      <div className="cn-field">
        <span className="cn-label" id="cn-sev">
          How far this goes
        </span>
        <div className="cn-sev" role="radiogroup" aria-labelledby="cn-sev">
          {NOTICE_SEVERITIES.map((rung) => {
            const on = draft.severity === rung.value
            return (
              <label
                key={rung.value}
                className="cn-sev-opt"
                data-on={on || undefined}
                data-loud={rung.value === 'urgent' || undefined}
              >
                <input
                  type="radio"
                  name="cn-severity"
                  checked={on}
                  onChange={() => onChange({ ...draft, severity: rung.value })}
                />
                <span className="cn-sev-mark" aria-hidden="true" />
                <span className="cn-sev-text">
                  <span className="cn-sev-name">
                    {rung.name}
                    {rung.note ? <span className="cn-sev-default">{rung.note}</span> : null}
                  </span>
                  <span className="cn-sev-what">{rung.what}</span>
                </span>
              </label>
            )
          })}
        </div>

        <div className="cn-nudge">
          <Icon name="lightbulb" size={16} />
          <p>
            Supper time changing is a notice. Urgent is for when somebody could get hurt. Nobody
            thinks less of you for using the quiet one, and everyone notices the loud one twice.
          </p>
        </div>
      </div>
    </>
  )
}
