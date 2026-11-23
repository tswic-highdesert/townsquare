/**
 * The pieces every directory surface is built from.
 *
 * Four densities of one listing — a browse card, a list row, a compact rail
 * card and a pin card. Three of them are `Card` and `Row` from `ui/` plus
 * props; the fourth is not, and the note on `MiniCard` says exactly why.
 *
 * ## There are no photographs, and nothing here pretends otherwise
 *
 * The directory is a Google Places extract with images deliberately excluded.
 * Not one of the 741 listings carries a picture, there is no upload path yet,
 * and there is no image API budget — so the absence is permanent rather than
 * pending. Every card draws `Plate`: the design's own CSS-gradient-over-
 * `--ts-stone` convention, tinted by the group and carrying the group's glyph.
 * It is a fixed box at every size so a grid of 700 never goes ragged, because a
 * shorter card beside a taller one would make "we have no picture of this
 * place" look like a layout bug instead of a fact we are stating.
 *
 * Drawing the design sheet's `data-shot` storefronts and bookshelves against
 * real listings was the tempting version and it is the one thing this codebase
 * will not do. An abstract plate says "no photograph". A drawn awning over a
 * neighbour's salon says "here is a photograph of it", and it is not.
 *
 * `CardMedia` is deliberately not used, and that is the one place the primitive
 * does not reach. See the note on `Plate`.
 */

import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon.js'
import { Card, CardBody, CardMeta, CardTitle, Row } from '../ui/index.js'
import { formatDistance } from '../nearbyData.js'
import { msg, t } from '../i18n/index.js'
import type { GroupId, OpenPhase, PlaceKind, RankedPlace } from './directoryData.js'
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
 * The door names the server writes (`GROUP_LABELS` in `apps/api/src/directory.ts`),
 * marked for translation. Screens render `t(group.label)`, so English stays
 * exactly what the payload carries and Spanish finds its entry here.
 */
export const GROUP_LABEL: Readonly<Record<GroupId, string>> = {
  eat: msg('Eat and drink'),
  shop: msg('Shop'),
  auto: msg('Auto and repair'),
  health: msg('Health and care'),
  home: msg('Home and trades'),
  beauty: msg('Beauty and barber'),
  money: msg('Money and law'),
  stay: msg('Stay the night'),
  out: msg('Outdoors and parks'),
  learn: msg('Learn'),
  pets: msg('Pets'),
  kids: msg('Kids and family'),
  fun: msg('Fun and fitness'),
  civic: msg('Civic'),
  serv: msg('Services'),
}

/**
 * The map's glyphs, which are a coarser question than the browse grid's.
 *
 * Five, not fifteen. A legend a resident has to learn is not a map, and at the
 * 12px a pin is drawn at, fifteen shapes are indistinguishable — "Beauty and
 * barber" and "Health and care" are the same smudge. `placeKind` on the server
 * is the tested five-bucket cut and this is its icon table; the finer grouping
 * still runs the browse grid, and both are true of the same listing.
 */
export const KIND_ICON: Readonly<Record<PlaceKind, IconName>> = {
  eat: 'utensils',
  shop: 'storefront',
  care: 'heartbeat',
  civic: 'vote',
  service: 'wrench',
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
 * the 741 listings, and a muted dot beside an open one reads as "closed". "We
 * could not read this business's hours" and "this business is shut" are
 * different facts and they must not share a shape, so unknown swaps the dot for
 * a clock. The glyph changes, not just the colour.
 *
 * Open is `--ts-verified`, the role rather than the raw sage. Open and vouched
 * are the same claim in this system — something is alive and we checked it —
 * which is why they share a colour, and naming the role is what keeps them
 * moving together when a town reskins.
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
 * The stand-in for a photograph that is never coming.
 *
 * Not `CardMedia` with no `src`, and the difference is the whole point.
 * `CardMedia`'s placeholder is right for Today, where roughly half the town's
 * stories carry a photo and the other half might tomorrow: a bare stone
 * rectangle holds the height and waits. In the directory nothing will ever fill
 * it — the extract excluded images and there is no paid image API — so a bare
 * rectangle in every one of 741 cards reads as an app that failed to load. This
 * says what it is instead: the category's glyph, the category's tone, and the
 * words "no photo yet" where there is room to read them.
 *
 * If `CardMedia` grew a `children` slot and a tone, this would be that.
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
      aria-label={t('No photo of this {category}', { category: category.toLowerCase() })}
    >
      <Icon name={GROUP_ICON[group]} size={caption ? 26 : 20} />
      {caption && <span className="dir-plate-cap">{t('No photo yet')}</span>}
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

/** The line under a name: what it is, and which street it is on. */
function whatAndWhere(place: RankedPlace): string {
  return [place.category, place.address ? shortAddress(place.address) : null]
    .filter(Boolean)
    .join(' · ')
}

export interface ListingProps {
  place: RankedPlace
  saved: boolean
  canSave: boolean
  onToggleSave: () => void
  onOpen: (place: RankedPlace) => void
}

/**
 * The browse card: `Card`, a plate, a body, and one secondary target.
 *
 * The card is not itself the press, which is the one deviation from `Card`'s
 * default shape and the reason it stays a `<div>` rather than taking `onClick`.
 * Save is a separate 44px button sitting on the plate, and a button nested
 * inside a button is invalid markup and unreachable by keyboard. `Card`'s own
 * note names the pattern — Nearby's Call and Directions — and this is the same
 * situation one size smaller: opening a listing and saving it are different
 * intentions, and rolling them into one press gets one of them wrong every
 * time.
 */
export function BrowseCard({ place, saved, canSave, onToggleSave, onOpen }: ListingProps) {
  return (
    <Card className="dir-card">
      <span className="dir-card-plate">
        <Plate group={place.group} category={place.category} caption />
        {canSave && <SaveButton place={place} saved={saved} onToggle={onToggleSave} />}
      </span>
      <CardBody className="dir-card-body">
        <button className="dir-card-open" onClick={() => onOpen(place)}>
          <CardTitle as="h3">{place.name}</CardTitle>
          <CardMeta>{whatAndWhere(place)}</CardMeta>
        </button>
        <span className="dir-card-foot">
          <OpenPill phase={place.phase} label={place.detail} />
          {place.miles !== null && (
            <span className="dir-card-dist">{formatDistance(place.miles)}</span>
          )}
        </span>
      </CardBody>
    </Card>
  )
}

/**
 * The density workhorse: `Row`, inside a `compact` `RowList`.
 *
 * The `<li>` is written out rather than using `RowItem`, for one reason:
 * `RowItem` renders exactly one `Row` inside the list item, and the save
 * bookmark has to be a **sibling** of it rather than a child. `Row` with
 * `onClick` is a `<button>`, so a bookmark in its `trailing` slot would be a
 * button inside a button. `RowList` still draws the frame and still sets the
 * density, and the inset divider still lands, because both are keyed off
 * `.ts-row` inside an `li` rather than off `RowItem` itself.
 *
 * The open state goes in `trailing`, which is a fixed column, so a finger
 * running down the edge of the screen reads a column of dots and can skip
 * everything else.
 */
export function ListRow({ place, saved, canSave, onToggleSave, onOpen }: ListingProps) {
  return (
    <li className="dir-row">
      <Row
        className="dir-row-main"
        lead={<Plate group={place.group} category={place.category} />}
        title={place.name}
        meta={whatAndWhere(place)}
        trailing={
          <span className="dir-row-right">
            <OpenPill phase={place.phase} label={place.detail} />
            {place.miles !== null && (
              <span className="dir-row-dist">{formatDistance(place.miles)}</span>
            )}
          </span>
        }
        onClick={() => onOpen(place)}
      />
      {canSave && <SaveButton place={place} saved={saved} onToggle={onToggleSave} inline />}
    </li>
  )
}

/**
 * The 132px rail card, and the one shape here that is **not** `Card` plus props.
 *
 * `Card` is a full-width block with `--ts-space-4` of padding all round and an
 * inset media well. This is a fixed-width tile in a horizontal scroller, with
 * the plate running full bleed to three of its edges and a name clamped to two
 * lines at caption size. Building it out of `Card` means overriding the width,
 * the padding, the media inset and the title size — at which point nothing of
 * the primitive survives except the border, and a component overridden to
 * nothing is worse than one that was not used, because the next person reads it
 * as shared and edits it as shared.
 *
 * A `Card` that took `padding="none"` and let a caller size it would absorb
 * this exactly. Reported rather than worked around.
 */
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
 * The pin card: a raised `Card`, laid out sideways.
 *
 * The same component loose or over a map, which is the design's argument for
 * having one at all — a map that grows its own card is a second design system.
 * Call, directions and the website open three different apps, so they are three
 * targets and never one card link, which is also why this card is not itself
 * pressable. A listing with no phone number draws the call target as
 * unavailable and takes it out of the tab order rather than offering to dial
 * nothing.
 */
export function PinCard({ place }: { place: RankedPlace }) {
  const directions = directionsUrl(place.address)

  return (
    <Card elevation="raised" className="dir-pin">
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
          <a className="dir-iconbtn" href={`tel:${place.phone.replace(/[^\d+]/g, '')}`} aria-label={t('Call {name}', { name: place.name })}>
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
            aria-label={t('Directions to {name}', { name: place.name })}
          >
            <Icon name="directions" size={18} />
          </a>
        )}
      </span>
    </Card>
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
      aria-label={saved ? t('Remove {name} from your saved things', { name: place.name }) : t('Save {name}', { name: place.name })}
      aria-pressed={saved}
    >
      <Icon name={saved ? 'bookmark-filled' : 'bookmark'} size={18} />
    </button>
  )
}
