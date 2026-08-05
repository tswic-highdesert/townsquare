/**
 * The publish gates: every state, and what each one says.
 *
 * "Pending" on its own is a way of not answering. Every state here says what is
 * happening, who has it, and roughly when — because a resident who has just
 * pressed publish is asking one question and a spinner is not a reply to it.
 *
 * **The turned-down screen is the most important one in this section.** It is
 * the only moment the platform tells a resident no, and how it reads decides
 * whether they ever contribute again. So it is a person writing to a person: it
 * names what was wrong with the *record* and never with them, the moderator's
 * words are shown verbatim, and it offers a way back in. It is signed "a
 * moderator" rather than by name, because in a town of 29,000 a named moderator
 * gets stopped in the Kroger car park, and that is how you lose your only
 * moderator.
 *
 * `--ts-brick` appears nowhere on this file. Being turned down is not an
 * emergency, and spending the alarm register here is how it stops meaning
 * anything at 6am when the river is up.
 */

import { Button, Card, EmptyState } from '../ui/index.js'
import { Icon } from '../Icon.js'
import type { Contribution, PauseState, SubmitResult } from './contributeData.js'

/** What the composer shows the moment a submission lands. */
export function OutcomePanel(props: {
  result: SubmitResult
  onDone: () => void
  onHistory: (recordId: string) => void
}) {
  const { result } = props

  if (result.duplicate) {
    return (
      <Card className="cn-outcome" elevation="raised">
        <StatusLine icon="check-circle" tone="wait" label="Already sent" />
        <p className="cn-gate-say">
          <b>You already sent this one.</b> We kept the first one rather than making a second, so a
          moderator reads it once. Nothing was lost and nothing was duplicated.
        </p>
        <Button variant="secondary" onClick={props.onDone}>
          Back
        </Button>
      </Card>
    )
  }

  if (result.outcome === 'published') {
    return (
      <Card className="cn-outcome" elevation="raised">
        <StatusLine icon="check-circle" tone="live" label="Live" />
        <p className="cn-gate-say">
          <b>It is up.</b> Editing it makes a new version, and the old one stays where it is.
        </p>
        <div className="cn-gate-acts-row">
          {result.recordId ? (
            <Button variant="quiet" size="sm" onClick={() => props.onHistory(result.recordId!)}>
              See its history
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={props.onDone}>
            Done
          </Button>
        </div>
      </Card>
    )
  }

  if (result.outcome === 'held_for_verification') {
    return (
      <Card className="cn-outcome" elevation="raised">
        <StatusLine icon="user-plus" tone="need" label="Needs vouching" />
        <p className="cn-gate-say">
          <b>Saved, and it will post the moment you are verified.</b> Adding this is for verified
          residents. You need neighbours to vouch for you, and we are holding this for you until
          they have. Nothing is lost.
        </p>
        <Button variant="secondary" onClick={props.onDone}>
          Back
        </Button>
      </Card>
    )
  }

  if (result.outcome === 'scheduled') {
    const when = result.contribution.scheduledFor
    return (
      <Card className="cn-outcome" elevation="raised">
        <StatusLine icon="calendar" tone="sched" label="Scheduled" />
        <p className="cn-gate-say">
          <b>{when ? `Goes out ${fullWhen(when)}.` : 'Goes out at the time you set.'}</b> Nobody can
          see it before then, including you on another device. You can pull it back any time before
          it sends.
        </p>
        <Button variant="secondary" onClick={props.onDone}>
          Back
        </Button>
      </Card>
    )
  }

  return (
    <Card className="cn-outcome" elevation="raised">
      <StatusLine icon="clock" tone="wait" label="Being read" />
      <p className="cn-gate-say">
        <b>A moderator has this.</b> Corrections are read by a person before they change the town's
        record. You will see the answer in your list either way, with whatever they wrote.
      </p>
      <Button variant="secondary" onClick={props.onDone}>
        Back
      </Button>
    </Card>
  )
}

/**
 * One row in the resident's own list, per status.
 *
 * A declined one carries the moderator's note in full and offers the way back.
 * Nothing was deleted, and the row says so, because "your edit was rejected and
 * removed" is three untrue words when the truth is it was superseded and is
 * still there.
 */
export function ContributionRow(props: {
  contribution: Contribution
  onWithdraw: (id: string) => void
  onHistory: (recordId: string) => void
}) {
  const c = props.contribution
  const title = titleOf(c)

  return (
    <li>
      {/* A `Card`, not a `Row`: `Row` is one target for the whole row and this
          one carries a History and a Withdraw button. `Row`'s own note says a
          trailing slot is not a second tap target, and Nearby's Call and
          Directions are the pattern for a card that genuinely has two. */}
      <Card className="cn-mine-row" elevation="flat">
      <div className="cn-mine-head" data-status={c.status}>
        <StatusLine {...statusFor(c.status)} />
        <span className="cn-mine-age">{ago(c.updatedAt)}</span>
      </div>
      <h4 className="cn-mine-title">{title}</h4>

      {c.status === 'declined' ? (
        <>
          <p className="cn-gate-say">
            <b>A moderator did not put this one up, and left you a note.</b>
          </p>
          {c.decisionNote ? (
            <blockquote className="cn-modnote">
              <p>{c.decisionNote}</p>
              <footer>
                <Icon name="shield" size={16} /> A moderator
              </footer>
            </blockquote>
          ) : null}
          <p className="cn-gate-tiny">Nothing was deleted. What you wrote is exactly as you wrote it.</p>
        </>
      ) : null}

      <div className="cn-gate-acts-row">
        {c.recordId ? (
          <Button variant="quiet" size="sm" onClick={() => props.onHistory(c.recordId!)}>
            History
          </Button>
        ) : null}
        {c.status === 'queued' || c.status === 'scheduled' || c.status === 'held_for_verification' ? (
          <Button variant="quiet" size="sm" onClick={() => props.onWithdraw(c.id)}>
            Withdraw it
          </Button>
        ) : null}
      </div>
      </Card>
    </li>
  )
}

/**
 * The pause, which is a pause and not a wall.
 *
 * The copy names the threat model rather than the number, because "you have
 * reached your daily limit" makes a person feel suspected and the person
 * hitting it is nearly always the one running the market booth. It then lists
 * what still works, which is the most useful sentence on a rate limit screen,
 * and the escalation path is a message to a person rather than a form.
 */
export function PausePanel(props: { pause: PauseState; message: string; onDraft: () => void }) {
  return (
    <div className="cn-pause">
      <div className="cn-pause-ic">
        <Icon name="coffee" size={32} />
      </div>
      <h3 className="cn-pause-title">
        That is {props.pause.count} things you have added today, and they were all good ones
      </h3>
      <p className="cn-pause-body">{props.message}</p>
      {props.pause.retryAt ? (
        <p className="cn-pause-when">
          <Icon name="clock" size={16} />
          <span>
            You can post again <b>{fullWhen(props.pause.retryAt)}</b>.
          </span>
        </p>
      ) : null}
      <ul className="cn-pause-list">
        {props.pause.stillAllowed.map((line) => (
          <li key={line}>
            <Icon name="check" size={16} /> {line}
          </li>
        ))}
      </ul>
      <Button variant="primary" onClick={props.onDraft}>
        Save this as a draft
      </Button>
      <p className="cn-pause-foot">
        If you run the market or the school calendar and this is genuinely not enough, say so and we
        will raise yours. That takes a message, not an application.
      </p>
    </div>
  )
}

/** Nothing proposed yet. Section 10's anatomy: a fact, then what is true. */
export function MineEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <EmptyState
      mark="tray"
      line="You have not added anything yet."
      sub="An event, a correction to a listing, or a collection. Whatever you add carries your handle, and you can always take it back."
      action={{ label: 'Add something', onAct: onAdd }}
    />
  )
}

/* ── small pieces ────────────────────────────────────────────────────────── */

type Tone = 'live' | 'wait' | 'need' | 'sched' | 'no'

function StatusLine(props: { icon: 'check-circle' | 'clock' | 'user-plus' | 'calendar' | 'x-circle'; tone: Tone; label: string }) {
  return (
    <span className="cn-status" data-tone={props.tone}>
      <Icon name={props.icon} size={16} />
      {props.label}
    </span>
  )
}

function statusFor(status: Contribution['status']): {
  icon: 'check-circle' | 'clock' | 'user-plus' | 'calendar' | 'x-circle'
  tone: Tone
  label: string
} {
  switch (status) {
    case 'published':
      return { icon: 'check-circle', tone: 'live', label: 'Live' }
    case 'queued':
      return { icon: 'clock', tone: 'wait', label: 'Being read' }
    case 'held_for_verification':
      return { icon: 'user-plus', tone: 'need', label: 'Needs vouching' }
    case 'scheduled':
      return { icon: 'calendar', tone: 'sched', label: 'Scheduled' }
    case 'declined':
      return { icon: 'x-circle', tone: 'no', label: 'Turned down' }
    case 'withdrawn':
      return { icon: 'x-circle', tone: 'no', label: 'Withdrawn' }
  }
}

function titleOf(c: Contribution): string {
  const content = c.content
  for (const key of ['title', 'name', 'caption', 'targetLabel']) {
    const value = content[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return c.type
}

function fullWhen(at: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(at))
}

/** An interval a person can feel, rather than a timestamp to do sums on. */
function ago(at: number): string {
  const mins = Math.round((Date.now() - at) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(at))
}
