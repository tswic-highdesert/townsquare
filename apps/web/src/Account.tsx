/**
 * A resident's own page: who they are here, where they stand, and what the
 * platform holds about them.
 *
 * The design draws this as two views of one page, a visitor's and the owner's,
 * with the owner's being the visitor's plus a private block. Only the owner
 * half is built, because nothing serves anyone else's page — there is no route
 * that takes a handle and returns a profile, and the visitor view is where the
 * identity contract is actually tested. It is the more important half to get
 * right and it is the half that has to wait for an endpoint.
 *
 * What is deliberately not on this screen, and what each would need:
 *
 * | Missing | Needs |
 * |---|---|
 * | The vouch ladder's middle rungs, "3 of 10" | a received-vouch count and a threshold. Verification currently lands on the first vouch |
 * | "Verified since 14 July" | `verifiedAt`, which the user row holds and `AccountView` does not project |
 * | The people you vouched for, and when each returns | a list route. `vouchBudget` computes `nextReplenishAt` and nothing passes it on |
 * | Asking for a vouch, and who you asked | an ask model. Nothing records that one resident asked another |
 * | Built / contributed counts | on Yours, which owns them |
 * | Notification switches, export, delete | no route for any of the three |
 *
 * The ask surface is the interesting absence. It is the one screen here that
 * would obviously raise the verified count, and it is also the one that turns
 * neighbours into leads the moment it grows a reminder or a progress bar. When
 * it is built it needs to arrive without either.
 */

import { Button } from './ui/index.js'
import { Icon } from './Icon.js'
import { initials } from './AppBar.js'
import { SignIn } from './identity/SignIn.js'
import { UnlockTable, VerificationCard } from './identity/Verification.js'
import { Vouching } from './identity/Vouching.js'
import { WhatWeHold } from './identity/WhatWeHold.js'
import { signOut, type AccountView } from './session.js'
import './identity/identity.css'

export interface AccountScreenProps {
  account: AccountView | null
  onAccountChange(account: AccountView | null): void
  onBack(): void
}

export function AccountScreen(props: AccountScreenProps) {
  if (!props.account) return <SignIn onBack={props.onBack} />
  return <SignedIn {...props} account={props.account} />
}

function SignedIn(props: AccountScreenProps & { account: AccountView }) {
  const { account } = props

  async function leave(everywhere: boolean) {
    await signOut(everywhere)
    props.onAccountChange(null)
  }

  return (
    <div className="id-screen">
      <Button variant="quiet" size="sm" icon="arrow-left" className="id-back" onClick={props.onBack}>
        Back
      </Button>

      <header className="id-profile">
        <span className="id-avatar" data-verified={account.verified || undefined} aria-hidden="true">
          {initials(account.handle)}
        </span>
        <div>
          <h1 className="id-h1">
            @{account.handle}
            {account.verified && <Icon name="badge-check" size={18} className="id-tick" />}
          </h1>
          {/*
            The role is shown only when there is one, and only to its holder.
            A moderator badge on a public page is a target in a town of 29,000;
            the committee is named on its own page, which is a decision those
            three people made about themselves.
          */}
          <p className="id-profile-meta">
            {account.verified ? 'Verified resident' : 'Signed in'}
            {account.role !== 'user' && ` · ${account.role}`}
          </p>
        </div>
      </header>

      <VerificationCard account={account} />

      {account.verified ? (
        <Vouching account={account} onAccountChange={props.onAccountChange} />
      ) : (
        <section className="id-vouch">
          <h2 className="id-h2">Vouching</h2>
          <p className="id-lede">
            Vouching is a closure: only a verified resident can vouch, which is what stops one
            person minting a town. When a neighbour vouches for you, this is where you vouch for the
            next person.
          </p>
        </section>
      )}

      <section aria-labelledby="id-unlock-t">
        <h2 className="id-h2" id="id-unlock-t">
          What verified unlocks
        </h2>
        <UnlockTable account={account} />
      </section>

      <WhatWeHold account={account} />

      <section className="id-leaving" aria-labelledby="id-leaving-t">
        <h2 className="id-h2" id="id-leaving-t">
          Leaving
        </h2>
        <div className="id-actions">
          <Button variant="secondary" onClick={() => void leave(false)}>
            Sign out
          </Button>
          <Button variant="quiet" onClick={() => void leave(true)}>
            Sign out everywhere
          </Button>
        </div>
        <p className="id-fine">
          Signing out everywhere ends every session on every device and clears what this one
          remembered. It is the one account control a pseudonymous account has, so it is a plain
          button rather than a red one.
        </p>
      </section>
    </div>
  )
}
