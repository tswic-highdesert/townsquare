/**
 * Where a resident stands, and what standing there is for.
 *
 * The design draws a five-rung ladder — nought, three of ten, nine of ten,
 * verified, flagged — and this renders two rungs, because two is what the
 * platform actually knows. `Identity.vouchFor` calls `applyVerification` on the
 * *first* vouch, and no row anywhere counts how many a resident has received.
 * A meter reading "3 of 10" would be the single most convincing invented number
 * on this screen: it is exactly the kind of thing a person repeats to a
 * neighbour when they ask for the next one. So the count is out until the
 * threshold is real, and what is left is true.
 *
 * The rung at zero is written to be liveable. Plenty of good residents sit
 * there for weeks, and a screen that treats that as a failure loses precisely
 * the privacy-minded people most likely to build something. Nothing on it is
 * urgent, nothing is a progress bar, and it leads with what already works.
 */

import { Card, CardBody, StatusPill } from '../ui/index.js'
import { Icon, type IconName } from '../Icon.js'
import type { AccountView } from '../session.js'
import './identity.css'

/**
 * `raised` rather than flat: this is the one card on the page that stands
 * alone rather than sitting in a list, and it is the answer to the question a
 * resident opened the screen with.
 */
export function VerificationCard(props: { account: AccountView }) {
  const { account } = props

  if (!account.verified) {
    return (
      <Card elevation="raised" className="id-rung">
        <CardBody>
          <header className="id-rung-head">
            <h2 className="id-rung-t">You are set up</h2>
            <StatusPill tone="quiet">Not verified</StatusPill>
          </header>
          <p className="id-rung-say">
            You can read everything, save things, and build, validate and preview a creation right
            now. Nothing here is waiting on you.
          </p>
          <p className="id-rung-fine">
            Publishing code that runs in a neighbour&rsquo;s browser, reporting something, and
            correcting town data all need a neighbour to say they know you live here. There is no
            hurry, and anything you write before then is held rather than thrown away.
          </p>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card elevation="raised" className="id-rung id-rung-verified">
      <CardBody>
        <header className="id-rung-head">
          <h2 className="id-rung-t">
            <Icon name="badge-check" size={18} />
            Verified resident
          </h2>
          {/*
            The method, because it is the one verification fact this account
            actually holds and because the two mean different things: a
            neighbour answered for you, or the committee let you in to start
            the town off.
          */}
          <StatusPill tone="sage">
            {account.verifiedMethod === 'vouch' ? 'By a neighbour' : 'By an admin'}
          </StatusPill>
        </header>
        <p className="id-rung-say">
          {account.verifiedMethod === 'vouch'
            ? 'A neighbour said they know you live here. That is the whole record. No address was collected or stored at any point.'
            : 'An admin verified you directly, which is how the first residents of a town exist at all. No address was collected or stored at any point.'}
        </p>
        <p className="id-rung-fine">
          You can publish creations, report things, correct town data, and vouch for other people.
          Who vouched for you stays between you and them.
        </p>
      </CardBody>
    </Card>
  )
}

/**
 * What verified unlocks, said plainly and early.
 *
 * A gate whose reward is unstated reads as arbitrary, and arbitrary gates get
 * resented. Every row here is a rule that exists in code rather than a
 * marketing summary of one: reporting checks `verified` on the session at each
 * call, submitting checks `canSubmit`, a contribution written before
 * verification lands as `held_for_verification` rather than being refused, and
 * the moderator row is a role check, never an ownership one.
 */
interface Row {
  what: string
  /** Signed out, signed in, verified. */
  at: [boolean, boolean, boolean]
  icon: IconName
}

const ROWS: readonly Row[] = [
  {
    what: 'Read the town square, browse the directory, open any creation',
    at: [true, true, true],
    icon: 'newspaper',
  },
  {
    what: 'Save an event or a place',
    at: [false, true, true],
    icon: 'bookmark',
  },
  {
    what: 'Build, validate and preview a creation',
    at: [false, true, true],
    icon: 'code',
  },
  {
    what: 'Publish a creation that runs in a neighbour’s browser',
    at: [false, false, true],
    icon: 'puzzle',
  },
  {
    what: 'Report a creation or a record',
    at: [false, false, true],
    icon: 'flag',
  },
  {
    what: 'Correct town data: hours, a closed trail, a moved meeting',
    at: [false, false, true],
    icon: 'edit',
  },
  {
    what: 'Vouch for a neighbour',
    at: [false, false, true],
    icon: 'handshake',
  },
]

export function UnlockTable(props: { account: AccountView | null }) {
  // Which column the reader is standing in, so the table answers "where am I"
  // without a legend. Highlighting a column is an enhancement of a table that
  // reads correctly with no column highlighted at all.
  const here = !props.account ? 0 : props.account.verified ? 2 : 1

  return (
    <div className="id-unlock">
      <table className="id-table">
        <caption className="id-table-cap">
          What each step gives you. Everything a person actually comes here for sits in the first
          column.
        </caption>
        <thead>
          <tr>
            <th scope="col">You want to</th>
            <th scope="col" data-here={here === 0 || undefined}>
              Signed out
            </th>
            <th scope="col" data-here={here === 1 || undefined}>
              Signed in
            </th>
            <th scope="col" data-here={here === 2 || undefined}>
              Verified
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, i) => (
            <tr
              key={row.what}
              data-gate={row.at[1] === false || undefined}
              /*
               * The line above the first gated row is drawn from here rather
               * than from a `:first-of-type` in CSS, which matches the first
               * `tr` in the table and not the first one carrying `data-gate`.
               * The selector looked right and quietly drew nothing.
               */
              data-gate-start={ROWS.findIndex((r) => !r.at[1]) === i || undefined}
            >
              <th scope="row">
                <Icon name={row.icon} size={15} />
                {row.what}
              </th>
              {row.at.map((yes, column) => (
                <td
                  key={column}
                  data-yes={yes || undefined}
                  data-here={here === column || undefined}
                >
                  {/* Never colour alone: the tick and the dash carry it, and a
                      screen reader gets the word rather than the glyph. */}
                  {yes ? (
                    <Icon name="check" size={16} />
                  ) : (
                    <span className="id-dash" aria-hidden="true" />
                  )}
                  <span className="ts-sr-only">{yes ? 'Yes' : 'No'}</span>
                </td>
              ))}
            </tr>
          ))}
          <tr data-role>
            <th scope="row">
              <Icon name="scale" size={15} />
              Decide a submission, close a report, put an old version back
            </th>
            <td colSpan={3} className="id-role-cell">
              Moderator, a role held by the local committee
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
