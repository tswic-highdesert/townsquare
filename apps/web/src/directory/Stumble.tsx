/**
 * Show me something. `design/hifi-v2` section 05, second specimen.
 *
 * ## A card you flip, not a lever you pull
 *
 * A slot machine withholds: it spins, it delays, it implies you might win.
 * This does the opposite. The next card is **already there**, drawn as two
 * edges behind the current one, and the swap is a 160ms cross of opacity and a
 * fraction of a degree of rotation — the physical feeling of turning a card
 * over on a table. Nothing is being scored. There is no counter climbing, no
 * streak, and no "you have seen 12 today", because the moment this surface
 * starts keeping score it becomes a game about the app rather than a way to
 * find a bike shop. The footer says so out loud.
 *
 * ## Two actions, weighted
 *
 * "Show me another" is the primary, because the honest expectation is that most
 * draws are a miss and a miss should cost one tap. Seeing the full listing is
 * the quieter button, which is the correct ranking: stumbling is cheap and
 * committing is deliberate.
 *
 * ## The deck is shuffled, not rolled
 *
 * `shuffleDeck` deals every place before it deals any place twice. A resident
 * who sees the same tyre shop within five taps concludes the button is broken,
 * and "one place at a time, drawn at random" is a promise the screen has to
 * keep for longer than three presses.
 */

import { useMemo, useState } from 'react'
import { Icon } from '../Icon.js'
import { Button, IconButton } from '../ui/index.js'
import { formatDistance, milesBetween, type Position } from '../nearbyData.js'
import { t, tn } from '../i18n/index.js'
import {
  isPlaced,
  shuffleDeck,
  stumbleLine,
  type DirectoryPlace,
  type RankedPlace,
} from './directoryData.js'
import { OpenPill, Plate } from './parts.js'

export interface StumbleProps {
  places: readonly DirectoryPlace[]
  position: Position | null
  total: number
  saved: ReadonlySet<string>
  canSave: boolean
  onToggleSave: (place: RankedPlace) => void
  onOpen: (place: RankedPlace) => void
  onClose: () => void
}

export function Stumble(props: StumbleProps) {
  /**
   * The deck is dealt once, at mount, from a seed taken then.
   *
   * Held in state rather than recomputed, so a re-render — a save landing, a
   * position arriving — does not silently reshuffle the deck under somebody
   * mid-draw. Leaving the screen and coming back is a new deck, which is the
   * behaviour a resident expects from a button called "show me something".
   */
  const [seed] = useState(() => Date.now())
  const [at, setAt] = useState(0)

  const deck = useMemo(() => shuffleDeck(props.places, seed), [props.places, seed])

  const ranked = useMemo<RankedPlace[]>(
    () =>
      // Only the three cards on screen need a distance. Measuring all 741 on
      // every draw is work nobody sees.
      [0, 1, 2]
        .map((offset) => deck[(at + offset) % Math.max(deck.length, 1)])
        .filter((p): p is DirectoryPlace => p !== undefined)
        .map((p) => ({
          ...p,
          miles: props.position && isPlaced(p) ? milesBetween(props.position, p) : null,
        })),
    [deck, at, props.position],
  )

  const current = ranked[0]

  if (!current) {
    return (
      <main className="dir-stumble">
        <p className="dir-stumble-foot">{t('There is nothing in the directory to draw from.')}</p>
        <Button variant="secondary" onClick={props.onClose}>
          {t('Back to the directory')}
        </Button>
      </main>
    )
  }

  const savedNow = props.saved.has(`business:${current.id}`)

  return (
    <main className="dir-stumble">
      <div className="dir-stumble-chrome">
        <IconButton name="close" label={t('Close')} onClick={props.onClose} />
        <span className="dir-stumble-eyebrow">{t('Drawn from {total}', { total: props.total })}</span>
        {props.canSave ? (
          <IconButton
            name={savedNow ? 'bookmark-filled' : 'bookmark'}
            label={savedNow ? t('Remove {name} from your saved things', { name: current.name }) : t('Save {name}', { name: current.name })}
            aria-pressed={savedNow}
            onClick={() => props.onToggleSave(current)}
          />
        ) : (
          // A 44px hole rather than a button that bounces a signed-out reader
          // into a sign-in form. The chrome stays balanced either way.
          <span className="dir-stumble-spacer" aria-hidden="true" />
        )}
      </div>

      <div className="dir-stumble-deck">
        {/*
          The two edges are the next two cards, already dealt. They are drawn
          rather than implied, because "there is more behind this" is the whole
          reason this reads as a deck instead of a request to a server.
        */}
        <span className="dir-stumble-edge" aria-hidden="true" />
        <span className="dir-stumble-edge" aria-hidden="true" />

        {/*
          Keyed on the place, so React replaces the node and the flip animation
          runs. Without the key the card mutates in place and the turn is a text
          swap, which reads as a bug.
        */}
        <article className="dir-stumble-card" key={current.id}>
          <span className="dir-stumble-plate">
            <Plate group={current.group} category={current.category} caption />
          </span>
          <div className="dir-stumble-body">
            <span className="dir-stumble-cat">{stumbleLine(current, current.miles)}</span>
            <h1 className="dir-stumble-name">{current.name}</h1>
            {/*
              No description. The scrape's is the category and the town
              restated — "Book store in Russellville, AR." — so printing it here
              would be the same fact twice in a voice pretending to be a person.
              What goes in its place is true and useful: the open state, and how
              far it is if the resident shared that.
            */}
            <OpenPill phase={current.phase} label={current.detail} />
          </div>
        </article>
      </div>

      <div className="dir-stumble-actions">
        <Button variant="secondary" icon="map-pin" onClick={() => props.onOpen(current)}>
          {t('See the listing')}
        </Button>
        <Button
          variant="primary"
          icon="refresh"
          onClick={() => setAt((n) => (n + 1) % deck.length)}
        >
          {t('Show me another')}
        </Button>
      </div>

      <p className="dir-stumble-foot">
        {t('Nothing is being scored and nothing is being saved unless you save it.')}
        {current.miles !== null && ` ${t('This one is {distance} away.', { distance: formatDistance(current.miles) })}`}
      </p>

      <p className="dir-stumble-seen" aria-hidden="true">
        <Icon name="layers" size={13} />
        {tn(
          deck.length - 1,
          '{count} more in the deck before anything repeats',
          '{count} more in the deck before anything repeats',
        )}
      </p>
    </main>
  )
}
