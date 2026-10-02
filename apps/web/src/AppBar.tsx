/**
 * The bar across the top of every tab. `design/hifi-v2` section 02, specimens
 * 1, 2 and 16.
 *
 * It carries four things and refuses a fifth: **who made this** (the mark),
 * **where you are** (the place line), **find something**, and **you**. Every
 * product like this eventually grows a hamburger, and the hamburger is where
 * the five destinations go to die. They are at the bottom under a thumb
 * instead, or in the rail on a wide screen.
 *
 * ## What the hi-fi has and this does not
 *
 * **The notification bell.** There is no notifications source, no table and no
 * endpoint. A bell that never lights is a promise the product has not made.
 *
 * **The town switcher.** `GET /api/town` returns exactly one town. A menu
 * offering Delta and Harbor would be two fictional towns in a resident's face
 * on the screen whose entire job is being true about this one. The place line
 * is therefore text, not a control — and the moment there is a second town it
 * becomes a button without anything else here moving, which is the point of
 * the seam in `design/hifi-v2/sections/11-system`.
 *
 * ## The place line is set in the serif
 *
 * In sans it reads as a field value. In the serif it reads as a dateline,
 * which is what it actually is.
 */

import { useEffect, useRef, useState } from 'react'
import { Icon, Mark } from './Icon.js'
import { useShell } from './nav/shellContext.js'
import type { AccountView } from './session.js'
import './nav/nav.css'

export interface AppBarProps {
  /** "Town Square" on Today, the tab's name elsewhere. */
  label: string
  place: string
  account: AccountView | null
  canReview: boolean
  onAccount: () => void
  onReview: () => void
}

/**
 * Past this much scroll the bar condenses.
 *
 * 64px is roughly the greeting: far enough that it never fires on the small
 * bounce a thumb makes settling on a screen, close enough that it has happened
 * by the time a resident is reading the first headline.
 */
const CONDENSE_AT = 64

export function AppBar(props: AppBarProps) {
  const { account } = props
  const shell = useShell()
  const [condensed, setCondensed] = useState(false)
  const bar = useRef<HTMLElement | null>(null)

  useEffect(() => {
    // Read in a frame rather than on every scroll event. Layout-reading in a
    // scroll handler is how a list that scrolls beautifully on a laptop
    // stutters on the phone somebody actually owns.
    let queued = false
    const onScroll = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(() => {
        queued = false
        setCondensed(window.scrollY > CONDENSE_AT)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      {/*
        First in the DOM, off screen until focused, and a real anchor rather
        than a button with a handler: an anchor to an id is what a screen
        reader announces as a skip link and what the browser's own focus
        handling already understands.

        The target is owned by the screen. Today, Nearby and Yours each put
        `id="ts-main" tabIndex={-1}` on their first block of content, which is
        the only place that knows which block that is. An earlier version had
        this component reach out and stamp the id on its own next sibling; it
        worked, and it was a component quietly writing attributes onto DOM it
        does not own.
      */}
      <a className="ts-skip" href={`#${SKIP_TARGET}`}>
        Skip to the top of {props.place || 'town'}
      </a>

      <header className="today-bar ts-appbar" data-condensed={condensed || undefined} ref={bar}>
        <Mark size={22} className="ts-appbar-mark" />

        <div className="ts-appbar-brand">
          <span className="today-wordmark">Town Square</span>
          <span className="today-place">{props.place}</span>
        </div>

        {/*
          Resting search on a wide screen is a field, not an icon: there is
          room, and a field says what it will do before you press it. On a
          phone the same control is a 44px icon button. One button, two
          shapes, so there is only ever one thing to focus.
        */}
        <button
          className="ts-appbar-search"
          type="button"
          onClick={shell.onSearch}
          aria-expanded={shell.searchOpen}
          aria-label={`Search ${props.place || 'the town'}`}
        >
          <Icon name="search" size={18} />
          <span className="ts-appbar-search-label">Search {props.place || 'the town'}</span>
        </button>

        <div className="today-bar-actions">
          {props.canReview && (
            <button className="back" onClick={props.onReview}>
              Review queue
            </button>
          )}
          {/*
            The label carries the handle, not the initials on the tile. "BT" is
            a visual shorthand for someone who can already see the screen and is
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
    </>
  )
}

/** The id the skip link points at, and the bar assigns. */
export const SKIP_TARGET = 'ts-main'

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
