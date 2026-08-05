/**
 * The three tabs, shared by the three screens that have them.
 *
 * Lifted out of `Today.tsx` when Nearby and Yours stopped being disabled
 * buttons. It is one component rather than three copies because the bar is the
 * one piece of chrome a resident uses to orient themselves — three copies is
 * three chances for the current tab to be highlighted in two places at once.
 */

import { Icon, type IconName } from './Icon.js'

export type TabName = 'today' | 'nearby' | 'yours'

const TABS: ReadonlyArray<{ name: TabName; label: string; icon: IconName }> = [
  { name: 'today', label: 'Today', icon: 'home' },
  { name: 'nearby', label: 'Nearby', icon: 'compass' },
  { name: 'yours', label: 'Yours', icon: 'bookmarks' },
]

export function TabBar({
  current,
  onChange,
}: {
  current: TabName
  onChange: (tab: TabName) => void
}) {
  return (
    <nav className="today-nav" aria-label="Sections">
      {TABS.map((tab) =>
        tab.name === current ? (
          // The current tab is not a button. Pressing it would do nothing, and
          // a control that does nothing is worse than a label that says where
          // you are.
          <span key={tab.name} className="nav-item" aria-current="page">
            <Icon name={tab.icon} size={23} />
            {tab.label}
          </span>
        ) : (
          <button key={tab.name} className="nav-item" onClick={() => onChange(tab.name)}>
            <Icon name={tab.icon} size={23} />
            {tab.label}
          </button>
        ),
      )}
    </nav>
  )
}
