/**
 * The honest version of what Town Square holds about a person.
 *
 * Written to be read once so a resident can stop wondering, and every line of
 * it is checkable against `User` in `packages/identity/src/store.ts`: a handle,
 * an email, whether that email is confirmed, a role, three verification facts,
 * a vouch budget override, and two timestamps. There is no address column, no
 * name column and no phone column, and the point of writing the list out is
 * that the absences are the interesting half.
 *
 * The values shown are this account's own, from the session. Nothing here is
 * illustrative: a privacy page that describes a *typical* account is a privacy
 * page nobody can check.
 */

import { Icon } from '../Icon.js'
import type { AccountView } from '../session.js'
import './identity.css'

export function WhatWeHold(props: { account: AccountView }) {
  const { account } = props

  return (
    <section className="id-hold" aria-labelledby="id-hold-t">
      <h2 className="id-h2" id="id-hold-t">
        What we hold about you
      </h2>

      <ul className="id-hold-list" data-have>
        <li>
          <Icon name="check" size={15} />
          <span>
            Your handle, <b>@{account.handle}</b>, which the town sees.
          </span>
        </li>
        <li>
          <Icon name="check" size={15} />
          <span>
            Your email, which nobody sees. It signs you in and lets a moderator reach you.
            {account.emailConfirmed ? ' Confirmed.' : ' Not confirmed yet.'}
          </span>
        </li>
        <li>
          <Icon name="check" size={15} />
          <span>
            Two facts about verification: that you are{account.verified ? '' : ' not'} verified
            {account.verified && account.verifiedMethod
              ? `, and that the method was ${account.verifiedMethod}`
              : ''}
            .
          </span>
        </li>
        <li>
          <Icon name="check" size={15} />
          <span>Which handles vouched for you, and which you vouched for. Committee only.</span>
        </li>
        <li>
          <Icon name="check" size={15} />
          <span>What you built and what you changed, with the date.</span>
        </li>
      </ul>

      <h3 className="id-eyebrow id-eyebrow-sep">And what we do not</h3>
      <ul className="id-hold-list" data-havent>
        <li>
          <Icon name="close" size={15} />
          <span>Your address. Not hashed, not once, not ever. There is no column.</span>
        </li>
        <li>
          <Icon name="close" size={15} />
          <span>Your real name, unless you typed it into your handle yourself.</span>
        </li>
        <li>
          <Icon name="close" size={15} />
          <span>Your phone number.</span>
        </li>
        <li>
          <Icon name="close" size={15} />
          <span>Where you are. Nearby measures distances on your phone and tells us nothing.</span>
        </li>
      </ul>

      <p className="id-quiet-note">
        <Icon name="shield" size={15} />
        <span>
          A creation you open is handed your handle and whether you are verified, and that is the
          entire list. No email, no id it could join on, no vouch count.
        </span>
      </p>
    </section>
  )
}
