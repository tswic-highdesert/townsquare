/**
 * What the chrome needs from the shell, without every screen having to pass it.
 *
 * `AppBar` is rendered by Today, Nearby and Yours, and those three files belong
 * to somebody else. Search, the account door and the review queue are shell
 * concerns rather than screen concerns, so threading them through as props
 * would mean editing three screens every time the chrome grows a control — and
 * three chances for one of them to pass a slightly different handler.
 *
 * A context is the seam instead: `App` provides it once, the bar reads it, and
 * a screen renders `<AppBar label=… place=… />` knowing nothing about either.
 *
 * The default is deliberately inert rather than a throwing stub. A bar
 * rendered outside the provider — a test, a specimen page — should still draw
 * and simply not do anything, because the alternative is a component that
 * explodes in the one place somebody is trying to look at it.
 */

import { createContext, useContext } from 'react'

export interface ShellChrome {
  /** Opens the omni search overlay. */
  onSearch: () => void
  /** True while the overlay is open, so the trigger can carry aria-expanded. */
  searchOpen: boolean
}

const INERT: ShellChrome = {
  onSearch: () => undefined,
  searchOpen: false,
}

export const ShellContext = createContext<ShellChrome>(INERT)

export function useShell(): ShellChrome {
  return useContext(ShellContext)
}
