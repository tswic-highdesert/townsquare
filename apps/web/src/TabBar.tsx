/**
 * The destinations. `design/hifi-v2` section 02, specimens 4, 5, 6 and 7.
 *
 * One component, two shapes. On a phone it is the bar across the bottom under
 * a thumb; at 1040px and up the same markup becomes the rail down the left of
 * the desktop shell. Same list, same order, same `aria-current` — a rail built
 * as a second component is a second chance for the current tab to be
 * highlighted in two places at once, which is exactly the bug that made this
 * one component in the first place.
 *
 * ## Creations is a peer, and that is the argument
 *
 * It used to be a button at the foot of Today. It sits in the nav now because
 * the thesis is that value compounds with builders: a platform that hides the
 * thing residents made has already decided it is a news app. Everything else a
 * builder needs stays off the You tab, so the resident path stays four words
 * wide.
 *
 * ## What the hi-fi has and this does not
 *
 * **Calendar.** The hi-fi's fifth destination has no screen and no endpoint.
 * What is on today is on Today, where nothing claims to be a calendar.
 *
 * **The badge.** The hi-fi puts a "3" on Calendar for events you said you
 * would go to. There is no RSVP anywhere in this product, so there is no
 * number to draw. When there is one it goes here, as a dot before it is ever a
 * count.
 *
 * ## How current is carried
 *
 * A rule, a weight, a fill and `aria-current`, before colour is asked to do
 * anything at all. A resident with deuteranopia should still know which tab
 * they are on, and so should a screenshot printed in greyscale.
 */

import { Icon, type IconName } from './Icon.js'
import './nav/nav.css'

export type TabName = 'today' | 'nearby' | 'creations' | 'yours'

const TABS: ReadonlyArray<{ name: TabName; label: string; icon: IconName }> = [
  { name: 'today', label: 'Today', icon: 'home' },
  /*
    The word matches the heading it lands on. `Directory` titles its own bar
    "Directory" and opens with "There are 741 places in this directory", and a
    tab labelled Nearby that arrives on a page called Directory is the same
    small lie as a You tab landing on a screen called Yours. The internal key
    stays `nearby` because `Directory` renders `TabBar current="nearby"` and
    that file is not ours to change.
  */
  { name: 'nearby', label: 'Directory', icon: 'compass' },
  { name: 'creations', label: 'Creations', icon: 'puzzle' },
  /*
    "Yours" rather than the hi-fi's "You". The screen behind it is titled Yours
    and holds the things you kept and the things you built, and a tab whose
    word disagrees with the heading it lands on is a small lie told four times
    a day.
  */
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
    <nav className="today-nav ts-nav" aria-label="Sections">
      {TABS.map((tab) => {
        const here = tab.name === current
        return (
          <button
            key={tab.name}
            className="nav-item ts-tab"
            type="button"
            /*
              The current tab stays a button rather than becoming a span.
              Pressing it is how a resident gets back to the top of a long
              screen, and it keeps the five targets identical in size and
              order whichever one you are on — a bar whose items change
              element under you is a bar that moves while you aim at it.
            */
            aria-current={here ? 'page' : undefined}
            onClick={() => onChange(tab.name)}
          >
            <span className="ts-tab-ind" aria-hidden="true" />
            <Icon name={tab.icon} size={22} />
            <span className="ts-tab-label">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
