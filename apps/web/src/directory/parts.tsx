/**
 * The pieces every directory surface is built from.
 *
 * Five densities of the same listing — a rail card, a browse card, a list row,
 * a pin card and a stumble card — and one open-now pill shared by all of them.
 * Kept in one file because that is what keeps them the same component rather
 * than five drifting copies of a card: the design's whole argument for the pin
 * card is that the map is not a second design system.
 *
 * ## There are no photographs, and nothing here pretends otherwise
 *
 * The directory is a Google Places extract with images deliberately excluded.
 * Not one of the 741 listings carries a picture, and there is no upload path
 * yet, so every card here draws `Plate` — a washed gradient in the category's
 * own tone with the category glyph on it, which is the design's own no-photo
 * treatment. It is a fixed box at every size so a grid of 700 never goes
 * ragged: a shorter card beside a taller one would make "we have no picture of
 * this place" look like a layout bug instead of a fact we are stating.
 *
 * Drawing the design's `data-shot` storefronts and bookshelves against real
 * listings was the tempting version and it is the one thing this codebase will
 * not do. An abstract plate says "no photograph". A drawn awning over a
 * neighbour's salon says "here is a photograph of it", and it is not.
 */

import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon.js'
import { formatDistance } from '../nearbyData.js'
import type { GroupId, OpenPhase, RankedPlace } from './directoryData.js'
import { shortAddress } from './directoryData.js'

/**
 * A glyph per door.
 *
 * Health takes `heartbeat`, the pulse trace `Icon.tsx` draws by hand precisely
 * because a heart at that size reads as "like this place" rather than "this is
 * the health category". That frees the actual heart for Pets, which is the one
 * group in the directory that is about affection rather than medicine. The
 * sprite has no paw and `design/` is not ours to add one to.
 */
export const GROUP_ICON: Readonly<Record<GroupId, IconName>> = {
  eat: 'utensils',
  shop: 'storefront',
  auto: 'wrench',
  health: 'heartbeat',
  home: 'home',
  beauty: 'sparkle',
  money: 'scale',
  stay: 'key',
  out: 'tree',
  learn: 'book',
  pets: 'heart',
  kids: 'users',
  fun: 'sport',
  civic: 'vote',
  serv: 'package',
}

/**
 * Four washes across fifteen groups, not fifteen colours.
 *
 * A palette with a distinct hue per category is a dashboard: nothing is
 * emphasised because everything is. Four tones give a browse grid rhythm and
 * keep the house rule that colour is reserved for the thing that earns it.
 */
export const GROUP_TONE: Readonly<Record<GroupId, 'clay' | 'navy' | 'sage' | 'gold'>> = {
  eat: 'clay',
  auto: 'clay',
  beauty: 'clay',
  home: 'clay',
  fun: 'clay',
  serv: 'clay',
  shop: 'navy',
  money: 'navy',
  civic: 'navy',
  out: 'sage',
  health: 'sage',
  pets: 'sage',
  learn: 'gold',
  stay: 'gold',
  kids: 'gold',
}

/**
 * The open-now pill, and the only place in the shell that draws one.
 *
 * Five states, and they differ in **dot shape** before they differ in colour:
 * solid, haloed, half, hollow, and no dot at all. Desaturate the screen and
 * every state is still readable, which is the requirement — `unknown` is 184 of
 * the 741 listings, and a muted dot beside a sage one reads as "closed". "We
 * could not read this business's hours" and "this business is shut" are
 * different facts and they must not share a shape, so unknown swaps the dot for
 * a clock. The glyph changes, not just the colour.
 */
export function OpenPill({ phase, label }: { phase: OpenPhase; label: string }) {
  return (
    <span className="dir-open" data-state={phase}>
      {phase === 'unknown' ? (
        <Icon name="clock" size={13} />
      ) : (
        <span className="dir-open-dot" aria-hidden="true" />
      )}
      {label}
    </span>
  )
}

/**
 * The stand-in for a photograph we do not have.
 *
 * Not a skeleton and not a broken image: it is the finished state of a card for
 * a listing nobody has photographed, and it is meant to look deliberate. The
 * caption appears only at the sizes where there is room to read it — at 48px in
 * a list row the glyph alone is the whole message.
 */
export function Plate({
  group,
  category,
  caption,
  children,
}: {
  group: GroupId
  category: string
  caption?: boolean
  children?: ReactNode
}) {
  return (
    <span
      className="dir-plate"
      data-tone={GROUP_TONE[group]}
      // Named for what it is, so a screen reader is told there is no picture
      // rather than being handed a decorative box it cannot explain.
      role="img"
      aria-label={`No photo of this ${category.toLowerCase()}`}
    >
      <Icon name={GROUP_ICON[group]} size={caption ? 26 : 20} />
      {caption && <span className="dir-plate-cap">No photo yet</span>}
      {children}
    </span>
  )
}

/** Google Maps, from the address the scrape already has. Never a coordinate. */
export function directionsUrl(address: string | null): string | null {
  return address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
    : null
}

export interface CardProps {
  place: RankedPlace
  saved: boolean
  canSave: boolean
  onToggleSave: () => void
  onOpen: (place: RankedPlace) => void
}

/**
 * The browse card. A fixed 16:10 plate so a grid of 700 never goes ragged.
 *
 * Save is a separate 44px target sitting on the plate rather than part of the
 * card's own press, because saving and opening are different intentions and
 * rolling them together gets one of them wrong every time.
 */
export function BrowseCard({ place, saved, canSave, onToggleSave, onOpen }: CardProps) {
  return (
    <article className="dir-card">
      <span className="dir-card-plate">
        <Plate group={place.group} category={place.category} caption />
        {canSave && <SaveButton place={place} saved={saved} onToggle={onToggleSave} />}
      </span>
      <button className="dir-card-body" onClick={() => onOpen(place)}>
        <span className="dir-card-name">{place.name}</span>
        <span className="dir-card-cat">
          {[place.category, place.address ? shortAddress(place.address) : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="dir-card-foot">
          <OpenPill phase={place.phase} label={place.detail} />
          {place.miles !== null && (
            <span className="dir-card-dist">{formatDistance(place.miles)}</span>
          )}
        </span>
      </button>
    </article>
  )
}

/**
 * The density workhorse: 72px per listing, so a group of 127 is nine screens
 * rather than thirty.
 *
 * The open state sits right-aligned in its own column, so a finger running down
 * the edge of the screen reads a column of dots and can skip everything else.
 */
export function ListRow({ place, saved, canSave, onToggleSave, onOpen }: CardProps) {
  return (
    <li className="dir-row">
      <button className="dir-row-main" onClick={() => onOpen(place)}>
        <Plate group={place.group} category={place.category} />
        <span className="dir-row-body">
          <span className="dir-row-name">{place.name}</span>
          <span className="dir-row-cat">
            {[place.category, place.address ? shortAddress(place.address) : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span className="dir-row-right">
          <OpenPill phase={place.phase} label={place.detail} />
          {place.miles !== null && (
            <span className="dir-row-dist">{formatDistance(place.miles)}</span>
          )}
        </span>
        <Icon name="chevron-right" size={16} className="dir-row-go" />
      </button>
      {canSave && <SaveButton place={place} saved={saved} onToggle={onToggleSave} inline />}
    </li>
  )
}

/** The 132px rail card. Drops the address before it drops the open state. */
export function MiniCard({ place, onOpen }: { place: RankedPlace; onOpen: (p: RankedPlace) => void }) {
  return (
    <button className="dir-mini" onClick={() => onOpen(place)}>
      <span className="dir-mini-plate">
        <Plate group={place.group} category={place.category} />
      </span>
      <span className="dir-mini-body">
        <span className="dir-mini-name">{place.name}</span>
        <OpenPill phase={place.phase} label={place.detail} />
        {place.miles !== null && (
          <span className="dir-mini-dist">{formatDistance(place.miles)}</span>
        )}
      </span>
    </button>
  )
}

/**
 * The pin card, which is the same component loose or over a map.
 *
 * Call, directions and the website open three different apps, so they are three
 * targets and never one card link. A listing with no phone number draws the
 * call target as disabled and takes it out of the tab order rather than
 * offering to dial nothing.
 */
export function PinCard({ place }: { place: RankedPlace }) {
  const directions = directionsUrl(place.address)

  return (
    <article className="dir-pin">
      <span className="dir-pin-plate">
        <Plate group={place.group} category={place.category} />
      </span>
      <span className="dir-pin-body">
        <span className="dir-pin-cat">{place.category}</span>
        <span className="dir-pin-name">{place.name}</span>
        {place.address && (
          <span className="dir-pin-addr">
            {shortAddress(place.address)}
            {place.miles !== null ? ` · ${formatDistance(place.miles)}` : ''}
          </span>
        )}
        <OpenPill phase={place.phase} label={place.detail} />
      </span>
      <span className="dir-pin-acts">
        {place.phone ? (
          <a className="dir-iconbtn" href={`tel:${place.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${place.name}`}>
            <Icon name="phone" size={18} />
          </a>
        ) : (
          <span className="dir-iconbtn" data-off aria-hidden="true">
            <Icon name="phone" size={18} />
          </span>
        )}
        {directions && (
          <a
            className="dir-iconbtn"
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Directions to ${place.name}`}
          >
            <Icon name="directions" size={18} />
          </a>
        )}
      </span>
    </article>
  )
}

/**
 * The bookmark, and only for somebody who can actually use it.
 *
 * A button that bounces a signed-out reader into a sign-in form the first time
 * they press it is a worse introduction than not offering it yet — the same
 * rule `Nearby.tsx` already follows.
 */
function SaveButton({
  place,
  saved,
  onToggle,
  inline,
}: {
  place: RankedPlace
  saved: boolean
  onToggle: () => void
  inline?: boolean
}) {
  return (
    <button
      className={inline ? 'dir-row-save' : 'dir-card-save'}
      data-saved={saved || undefined}
      onClick={onToggle}
      aria-label={saved ? `Remove ${place.name} from your saved things` : `Save ${place.name}`}
      aria-pressed={saved}
    >
      <Icon name={saved ? 'bookmark-filled' : 'bookmark'} size={18} />
    </button>
  )
}
