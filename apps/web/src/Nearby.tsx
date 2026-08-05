/**
 * Nearby — what is around you. `design/hifi` section 5a.
 *
 * ## The position stays on the device
 *
 * `GET /api/nearby` takes no coordinates and returns the whole placeable town.
 * Everything about distance — measuring it, sorting on it, printing it — happens
 * in `nearbyData.ts`, in this browser. There is no request anywhere in this file
 * that carries a location, which is why the permission prompt can say so
 * plainly, and why saying no costs a resident the distances and nothing else.
 *
 * ## The map talks to nobody either
 *
 * 5a leads with a map, and the ordinary way to get one puts a tile host in the
 * load path of this origin — the one holding the session cookie — with every
 * pan naming the square of town a resident is looking at. So Town Square draws
 * its own, out of the street corridors implied by the directory's 741
 * addresses. **The shell's CSP is unchanged by this screen.** `TownMap.tsx` and
 * `apps/api/src/townMap.ts` carry the reasoning and the limits.
 *
 * The List half is the default and stands alone: the switch only appears when
 * the payload carries bounds to draw, so a town with nothing placeable is a
 * list, exactly as it was.
 *
 * ## Two things in the hi-fi are not here
 *
 * **A creation's layer.** The hi-fi pins "#1 on Luis's Burrito Index" to a
 * restaurant. That is a creation writing into the town's shared record store,
 * which is `records` — specified, not built. It is omitted rather than mocked.
 *
 * **Events.** They were built, shipped to a screenshot, and taken back out: the
 * calendar's coordinates turned out to be a hardcoded town centre and a run of
 * literal zeroes. `nearby.ts` has the whole story. What is on tonight is on
 * Today, where nothing claims a distance.
 */

import { useEffect, useMemo, useState } from 'react'
import { AppBar } from './AppBar.js'
import { Icon, type IconName } from './Icon.js'
import { TabBar, type TabName } from './TabBar.js'
import { TownMap } from './TownMap.js'
import {
  fetchNearby,
  formatDistance,
  positionAlreadyAllowed,
  rankPlaces,
  reachLabel,
  requestPosition,
  type NearbyPayload,
  type NearbyPlace,
  type PlaceKind,
  type Position,
  type RankedPlace,
} from './nearbyData.js'
import { saveThing, unsaveThing, type SavedThing } from './savesData.js'
import type { AccountView } from './session.js'

export interface NearbyProps {
  account: AccountView | null
  canReview: boolean
  saved: SavedThing[]
  onSavedChange: (saves: SavedThing[]) => void
  onTab: (tab: TabName) => void
  onAccount: () => void
  onReview: () => void
}

/**
 * How many rows the list draws.
 *
 * The payload is the whole town — 741 listings — because that is what keeping
 * the position on the device costs. Rendering all of them would be a scroll
 * nobody reaches the end of, and "nearby" stops meaning anything somewhere
 * around the fortieth row.
 */
const SHOWN = 40

const KIND_ICON: Record<PlaceKind, IconName> = {
  eat: 'cutlery',
  shop: 'bag',
  care: 'heartbeat',
  civic: 'gavel',
  service: 'toolbox',
}

const KIND_LABEL: Record<PlaceKind, string> = {
  eat: 'Food',
  shop: 'Shops',
  care: 'Health',
  civic: 'Civic',
  service: 'Services',
}

/** Services last. It is the honest default bucket and a third of the town. */
const CHIP_ORDER: readonly PlaceKind[] = ['eat', 'shop', 'care', 'civic', 'service']

/**
 * The map draws every match; the list draws the first forty of them.
 *
 * Forty rows is as far as anybody scrolls, and forty dots is not a town — the
 * first pass limited both to forty and produced a map with roads out to the
 * edges and every pin in one downtown clot. A map is scanned rather than read,
 * so it takes the whole filtered set: 741 circles is nothing for an SVG, and
 * the shape of the place is the entire reason to look at one.
 */
const MAPPED = Number.MAX_SAFE_INTEGER

export function Nearby(props: NearbyProps) {
  const [payload, setPayload] = useState<NearbyPayload | null>(null)
  const [failed, setFailed] = useState(false)
  const [position, setPosition] = useState<Position | null>(null)
  /** Null before we have asked. False once a refusal or a timeout came back. */
  const [located, setLocated] = useState<boolean | null>(null)
  const [locating, setLocating] = useState(false)
  const [kind, setKind] = useState<PlaceKind | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'map' | 'list'>('list')
  const [selected, setSelected] = useState<NearbyPlace | null>(null)

  useEffect(() => {
    void fetchNearby().then(setPayload, () => setFailed(true))

    // Only ask outright if the browser will answer without a dialog. Throwing a
    // permission prompt at someone for opening a tab is how a resident learns
    // to dismiss them, and the screen works without it.
    void positionAlreadyAllowed().then((allowed) => {
      if (allowed) void locate()
    })
  }, [])

  async function locate() {
    setLocating(true)
    const found = await requestPosition()
    setLocating(false)
    setPosition(found)
    setLocated(found !== null)
  }

  const ranked = useMemo(
    () =>
      payload ? rankPlaces(payload.places, { position, kind, query, limit: MAPPED }) : [],
    [payload, position, kind, query],
  )
  const listed = ranked.slice(0, SHOWN)

  const savedRefs = useMemo(
    () => new Set(props.saved.map((s) => `${s.kind}:${s.refId}`)),
    [props.saved],
  )

  async function toggleSave(place: RankedPlace) {
    if (savedRefs.has(`business:${place.id}`)) {
      if (await unsaveThing('business', place.id)) {
        props.onSavedChange(
          props.saved.filter((s) => !(s.kind === 'business' && s.refId === place.id)),
        )
      }
      return
    }

    const saved = await saveThing({
      kind: 'business',
      refId: place.id,
      title: place.name,
      // The snapshot is what was on the screen when they pressed it. See the
      // note on `Save.title` for why a save is not a live pointer.
      detail: place.detail,
      ...(place.url ? { url: place.url } : {}),
    })
    if (saved) props.onSavedChange([saved, ...props.saved])
  }

  const bar = (
    <AppBar
      label="Nearby"
      place={payload?.town.name ?? ''}
      account={props.account}
      canReview={props.canReview}
      onAccount={props.onAccount}
      onReview={props.onReview}
    />
  )

  if (failed) {
    return (
      <div className="today">
        {bar}
        <div className="today-state">
          <p className="problem">Nearby could not be loaded.</p>
          <button className="secondary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
        <TabBar current="nearby" onChange={props.onTab} />
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="today">
        {bar}
        <div className="today-state">Loading the town…</div>
        <TabBar current="nearby" onChange={props.onTab} />
      </div>
    )
  }

  // Measured from the rows underneath it, not from the far end of the map.
  const reach = reachLabel(listed)

  return (
    <div className="today">
      {bar}

      <div className="nearby-controls">
        <div className="nearby-search">
          <Icon name="search" size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${payload.town.name}`}
            aria-label={`Search ${payload.town.name}`}
            type="search"
          />

          {/*
            The switch lives in the search bar, as the hi-fi has it, and is only
            drawn when there is something to draw — `bounds` needs placeable
            listings, and a Map button that opens an empty rectangle is worse
            than no Map button.
          */}
          {payload.bounds && (
            <span className="view-switch">
              <button
                data-on={view === 'map' || undefined}
                onClick={() => setView('map')}
                aria-pressed={view === 'map'}
              >
                <Icon name="pin" size={13} />
                Map
              </button>
              <button
                data-on={view === 'list' || undefined}
                onClick={() => setView('list')}
                aria-pressed={view === 'list'}
              >
                <Icon name="list" size={13} />
                List
              </button>
            </span>
          )}
        </div>

        <div className="nearby-chips">
          {/*
            "All" is a chip rather than the absence of one. Deselecting the
            active filter by pressing it again is a gesture people have to be
            taught; a row of chips with one obviously-on state is not.
          */}
          <button
            className="chip"
            data-on={kind === null || undefined}
            onClick={() => setKind(null)}
          >
            All
            <span className="chip-count">{payload.places.length}</span>
          </button>
          {CHIP_ORDER.filter((k) => payload.counts[k] > 0).map((k) => (
            <button
              key={k}
              className="chip"
              data-on={kind === k || undefined}
              data-kind={k}
              onClick={() => setKind(kind === k ? null : k)}
            >
              <Icon name={KIND_ICON[k]} size={14} />
              {KIND_LABEL[k]}
              <span className="chip-count">{payload.counts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      {/*
        The heading describes what is actually on the screen. "Within 0.1 mi ·
        40+" over a map of the whole town was a caption for the other half of
        this screen — the map draws every match, so it says so.
      */}
      <div className="nearby-head">
        <h1 className="nearby-reach">
          {view === 'map' ? `Everywhere in ${payload.town.name}` : (reach ?? `Everywhere in ${payload.town.name}`)}
        </h1>
        <span className="nearby-count">
          {view === 'map' ? ranked.length : listed.length}
          {view === 'list' && ranked.length > listed.length ? '+' : ''}
        </span>
      </div>

      {/*
        The prompt is the honest version of the permission dialog it triggers,
        and it is only shown while there is something to gain by pressing it.
        The refusal state below it is a note, not a nag: a resident who said no
        has answered, and asking again on every render is how an app teaches
        people to distrust its buttons.
      */}
      {position === null && (
        <div className="locate">
          <span className="locate-icon">
            <Icon name="target" size={18} />
          </span>
          <div className="locate-text">
            <div className="locate-title">
              {located === false ? 'Location off' : 'Sort by how far away it is'}
            </div>
            <div className="locate-detail">
              {located === false
                ? 'Showing what is on and what is open instead.'
                : 'Your position stays on this device — the town’s directory is downloaded and sorted here.'}
            </div>
          </div>
          {located !== false && (
            <button className="locate-go" onClick={() => void locate()} disabled={locating}>
              {locating ? 'Locating…' : 'Use my location'}
            </button>
          )}
        </div>
      )}

      {view === 'map' && payload.bounds ? (
        <>
          <TownMap
            bounds={payload.bounds}
            streets={payload.streets}
            places={ranked}
            position={position}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            kindIcon={KIND_ICON}
          />
          {/*
            One card, for the pin that was tapped. The hi-fi's sheet lists the
            nearest few underneath the map as well; that is the List half, one
            press away, and two scrolling lists of the same rows on one screen is
            a screen arguing with itself.
          */}
          {selected && (
            <ul className="place-list map-selected">
              <PlaceRow
                place={ranked.find((p) => p.id === selected.id) ?? { ...selected, miles: null }}
                saved={savedRefs.has(`business:${selected.id}`)}
                canSave={props.account !== null}
                onToggleSave={() => {
                  const place = ranked.find((p) => p.id === selected.id)
                  if (place) void toggleSave(place)
                }}
              />
            </ul>
          )}
        </>
      ) : listed.length === 0 ? (
        <p className="nearby-empty">
          Nothing in the directory matches that.
        </p>
      ) : (
        <ul className="place-list">
          {listed.map((place) => (
            <PlaceRow
              key={place.id}
              place={place}
              saved={savedRefs.has(`business:${place.id}`)}
              canSave={props.account !== null}
              onToggleSave={() => void toggleSave(place)}
            />
          ))}
        </ul>
      )}

      <TabBar current="nearby" onChange={props.onTab} />
    </div>
  )
}

function PlaceRow({
  place,
  saved,
  canSave,
  onToggleSave,
}: {
  place: RankedPlace
  saved: boolean
  canSave: boolean
  onToggleSave: () => void
}) {
  /*
    The row goes to directions, because that is what "nearby" is for. Call and
    the website are separate targets underneath it, the same split the directory
    cards on Today make: burying "start driving" and "open the website" in one
    tap gets one of them wrong every time.
  */
  const directions = place.address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.address)}`
    : null
  const href = directions ?? place.url

  const body = (
    <>
      <span className="place-icon" data-kind={place.kind}>
        <Icon name={KIND_ICON[place.kind]} size={20} />
      </span>
      <span className="place-text">
        <span className="place-name">{place.name}</span>
        <span className="place-detail" data-open={place.openNow ?? undefined}>
          {place.openNow !== null && <span className="open-dot" />}
          {place.detail}
        </span>
      </span>
      {place.miles !== null && (
        <span className="place-far">{formatDistance(place.miles)}</span>
      )}
    </>
  )

  return (
    <li className="place-row">
      {href ? (
        <a className="place-main" href={href} target="_blank" rel="noopener noreferrer">
          {body}
        </a>
      ) : (
        <div className="place-main">{body}</div>
      )}

      {/*
        The bookmark appears only for someone who can actually use it. A button
        that bounces a signed-out reader into a sign-in form the first time they
        press it is a worse introduction than not offering it yet.
      */}
      {canSave && (
        <button
          className="place-save"
          data-saved={saved || undefined}
          onClick={onToggleSave}
          aria-label={saved ? `Remove ${place.name} from your saved things` : `Save ${place.name}`}
          aria-pressed={saved}
        >
          <Icon name="bookmark" size={18} />
        </button>
      )}
    </li>
  )
}
