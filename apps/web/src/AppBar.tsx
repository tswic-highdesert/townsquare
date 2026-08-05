/**
 * The bar across the top of every tab.
 *
 * Lifted out of `Today.tsx` alongside `TabBar` when Nearby and Yours arrived.
 * The mark, the town's name and the way back to your account are the resident's
 * fixed points; a tab that drew its own would be a tab where signing in works
 * differently.
 */

import { Icon, Mark } from './Icon.js'
import type { AccountView } from './session.js'

export interface AppBarProps {
  /** "Town Square" on Today, the tab's name elsewhere. */
  label: string
  place: string
  account: AccountView | null
  canReview: boolean
  onAccount: () => void
  onReview: () => void
}

export function AppBar(props: AppBarProps) {
  const { account } = props

  return (
    <header className="today-bar">
      <Mark size={22} />
      <span className="today-wordmark">{props.label}</span>
      <span className="today-place">{props.place}</span>

      <div className="today-bar-actions">
        {props.canReview && (
          <button className="back" onClick={props.onReview}>
            Review queue
          </button>
        )}
        {/*
          The label carries the handle, not the initials on the tile. "BT" is a
          visual shorthand for someone who can already see the screen and is
          meaningless to anyone who cannot.
        */}
        <button
          className="avatar-button"
          onClick={props.onAccount}
          aria-label={
            account
              ? `${account.handle}${account.verified ? ', verified' : ''} — your account`
              : 'Sign in'
          }
        >
          {account ? (
            <span className="avatar" data-verified={account.verified || undefined}>
              {initials(account.handle)}
            </span>
          ) : (
            <span className="today-signin">Sign in</span>
          )}
        </button>
      </div>
    </header>
  )
}

/** The verified tick, where a screen has room to say it in words as well. */
export function VerifiedChip({ verified }: { verified: boolean }) {
  return (
    <span className="verified-chip" data-verified={verified || undefined}>
      <Icon name="verified" size={13} />
      {verified ? 'Verified resident' : 'Not verified yet'}
    </span>
  )
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? '·'
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : (words[0]?.[1] ?? '')
  return (first + second).toUpperCase()
}
