/**
 * Giving a vouch, and the budget it comes out of.
 *
 * One real question, asked plainly, with the consequence stated *before* the
 * button rather than in a receipt afterwards. Vouching is the one action on
 * this screen that puts a resident's name on somebody else's standing, and the
 * chain is admin-visible, so "if this goes wrong a moderator will ask you"
 * belongs above the control and not under it.
 *
 * The budget is a rolling ninety days computed on read (`vouchBudget`), not a
 * counter that resets, which is why the empty state says the window rather than
 * a date: `AccountView` carries `available / budget / used / windowDays` and
 * not `nextReplenishAt`, so this screen cannot say *when* the next one comes
 * back. "You have none left" with no date reads as a punishment, and the
 * nearest honest substitute is naming the window and where the vouches went.
 * The date needs the API to pass the value it already computes.
 *
 * There is no list of who you vouched for, for the same reason: nothing serves
 * one. A withdrawal is therefore by handle, typed, and confirmed.
 */

import { useState } from 'react'
import { Button, InlineError, Modal, TextInput } from '../ui/index.js'
import { Icon } from '../Icon.js'
import { isError, revokeVouch, vouchFor, type AccountView } from '../session.js'
import './identity.css'

export interface VouchingProps {
  account: AccountView
  onAccountChange(account: AccountView): void
}

export function Vouching(props: VouchingProps) {
  const { account } = props
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)

  const spent = account.vouches.used
  const budget = account.vouches.budget
  const none = account.vouches.available === 0

  async function give(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    setNote(null)

    const result = await vouchFor(handle.trim())
    setBusy(false)

    if (isError(result)) {
      setProblem(result.message)
      return
    }
    props.onAccountChange(result.account)
    setNote(`You vouched for @${result.vouchee?.handle}. They can see the count went up, not who.`)
    setHandle('')
  }

  async function withdraw(target: string) {
    setWithdrawing(null)
    setBusy(true)
    setProblem(null)
    setNote(null)

    const result = await revokeVouch(target.trim())
    setBusy(false)

    if (isError(result)) {
      setProblem(result.message)
      return
    }
    props.onAccountChange(result.account)
    // Said plainly, because the surprising part is what does *not* happen.
    setNote(
      `Vouch for @${result.revoked} withdrawn. They stay verified. The branch under them is flagged so a moderator reads it, and nothing anyone built comes down.`,
    )
  }

  return (
    <section className="id-vouch" aria-labelledby="id-vouch-t">
      <h2 className="id-h2" id="id-vouch-t">
        Vouching
      </h2>

      <div className="id-budget" data-empty={none || undefined}>
        <div className="id-budget-head">
          <div>
            <div className="id-budget-count">
              {none ? <b>None</b> : <b>{account.vouches.available}</b>}
              {none ? ' available today' : ` of ${budget} available`}
            </div>
            <div className="id-budget-sub">
              {spent === 0
                ? 'You have not vouched for anyone yet'
                : `${spent} ${spent === 1 ? 'is' : 'are'} out with people you vouched for`}
            </div>
          </div>
          <Icon name={none ? 'clock' : 'handshake'} size={22} className="id-budget-icon" />
        </div>

        {/*
          A track of cells rather than a bar. Ten discrete favours is what this
          number is, and a percentage-filled bar would read as progress toward
          something — which is the exact framing the ask surface refuses.
        */}
        <div
          className="id-budget-track"
          role="img"
          aria-label={`${account.vouches.available} of ${budget} vouches available`}
        >
          {Array.from({ length: budget }, (_, i) => (
            <span key={i} className="id-budget-cell" data-spent={i < spent || undefined} />
          ))}
        </div>

        <p className="id-budget-fine">
          Vouches replenish on a rolling window, not a monthly reset: each one comes back{' '}
          {account.vouches.windowDays} days after you give it. The limit is not a scarcity trick.
          Ten in ninety days is roughly the number of people anyone genuinely knows well enough to
          answer for, and it is what makes a chain worth auditing.
        </p>
      </div>

      <form className="id-form" onSubmit={give}>
        <TextInput
          label="Vouch for a neighbour"
          value={handle}
          onChange={(e) => {
            setHandle(e.target.value)
            setProblem(null)
          }}
          placeholder="their handle"
          autoComplete="off"
          required
          disabled={none}
          help="Someone you know lives in Russellville. Not someone who seems fine, and not someone you have only talked to online."
        />

        {/* The consequence, above the button. Below it, it is a receipt. */}
        <div className="id-consequence">
          <Icon name="git-branch" size={16} />
          <div>
            <b>Your name is on this.</b> Vouch chains are visible to the committee, never to the
            town. If this one goes wrong, it traces back to you and a moderator will ask.
          </div>
        </div>

        {problem && <InlineError>{problem}</InlineError>}
        {note && (
          <p className="id-outcome" role="status">
            <Icon name="check-circle" size={15} />
            <span>{note}</span>
          </p>
        )}

        <div className="id-actions">
          <Button variant="primary" size="lg" icon="handshake" full loading={busy} type="submit" disabled={none}>
            Vouch for them
          </Button>
          {/*
            Withdrawing appears once there is a handle to withdraw from, rather
            than sitting there greyed out. A permanently disabled control next
            to the one live button reads as something broken, and this one is
            not an alternative to vouching — it is a different errand that
            happens to need the same field.
          */}
          {handle.trim().length > 0 && (
            <Button variant="quiet" full disabled={busy} onClick={() => setWithdrawing(handle.trim())}>
              Withdraw my vouch for @{handle.trim()} instead
            </Button>
          )}
        </div>
      </form>

      <Modal
        open={withdrawing !== null}
        onClose={() => setWithdrawing(null)}
        title={`Withdraw your vouch for @${withdrawing ?? ''}?`}
        description="They stay verified. The branch under them is flagged so a moderator reads it, and nothing anyone built comes down. Withdrawing is a way to say “I am no longer sure”, not a way to remove someone."
        actions={
          <>
            <Button variant="quiet" onClick={() => setWithdrawing(null)}>
              Keep it
            </Button>
            <Button variant="primary" onClick={() => void withdraw(withdrawing ?? '')}>
              Withdraw it
            </Button>
          </>
        }
      />
    </section>
  )
}
