/**
 * The directory, as a discovery surface. `design/hifi-v2` section 05.
 *
 * ## The screen is ordered, and the order is the product
 *
 * From "I have no idea what I want" down to "I know exactly what I want":
 *
 * 1. **Show me something** — a random draw, first, because it is the only
 *    control on the screen that requires no vocabulary at all.
 * 2. **Open right now** — the one thing here with a deadline attached, and
 *    therefore the most likely to turn into a trip.
 * 3. **Browse by what it is** — fifteen doors, deliberate rather than idle.
 * 4. **Search** — last, quietest, under a heading that names it as the
 *    exception.
 *
 * A search box in the header would tell every arriving resident that the
 * correct way to use this is to already know the answer, which is exactly the
 * behaviour a town directory is supposed to replace. There are 741 places in
 * here and nobody has been inside more than a few dozen of them.
 *
 * ## Nothing leaves the device
 *
 * `GET /api/directory` takes no parameters. Filtering, searching, ranking and
 * the random draw all happen in `directoryData.ts`, in this browser, against a
 * payload that is identical for everybody in town. There is no request in this
 * file that carries a position or a query — which is why refusing the location
 * prompt costs a resident the distances and nothing else, and why the town
 * cannot answer "what did my neighbour look up" even if it wanted to.
 *
 * ## What the design shows that is not here, and why
 *
 * | Missing | Needs |
 * |---|---|
 * | Photographs on every card | a photo, of which the directory has none |
 * | Resident collections | a collections table; nothing stores one |
 * | "Not confirmed since March" | a per-listing verification date; the scrape has one date for all 741 |
 * | Claimed by the owner | listing ownership, which `NoListingOwners` says nobody has |
 * | Articles and podcasts in the mix | the feed has stories, but no podcast source and no per-listing link between them |
 * | A map view | `TownMap` belongs to Nearby, and two maps of one town is one too many. See the note at the end of this file. |
 *
 * All of it omitted rather than mocked. Inventing a photograph of a neighbour's
 * shop is the single failure a town directory does not come back from.
 */

import { useEffect, useMemo, useState } from 'react'
import { AppBar } from '../AppBar.js'
import { Icon } from '../Icon.js'
import { TabBar, type TabName } from '../TabBar.js'
import { Button, EmptyState, SearchInput, BottomSheet, Skeleton } from '../ui/index.js'
import { formatDistance, positionAlreadyAllowed, requestPosition, type Position } from '../nearbyData.js'
import { saveThing, unsaveThing, type SavedThing } from '../savesData.js'
import type { AccountView } from '../session.js'
import {
  DEFAULT_RANK,
  fetchDirectory,
  filterSummary,
  rankDirectory,
  shortAddress,
  type DirectoryPayload,
  type GroupId,
  type RankedPlace,
  type SortKey,
} from './directoryData.js'
import { BrowseCard, GROUP_ICON, GROUP_TONE, ListRow, MiniCard, OpenPill, PinCard, directionsUrl } from './parts.js'
import { Stumble } from './Stumble.js'
import './directory.css'

export interface DirectoryProps {
  account: AccountView | null
  canReview: boolean
  saved: SavedThing[]
  onSavedChange: (saves: SavedThing[]) => void
  onTab: (tab: TabName) => void
  onAccount: () => void
  onReview: () => void
}

/**
 * Six doors on the home screen, fifteen behind "all".
 *
 * The grid is ordered biggest first by the assembler, so six covers roughly
 * three quarters of the directory. Showing all fifteen above the fold would
 * make the browse block the whole screen and push the thing with a deadline on
 * it — what is open right now — below the fold.
 */
const TILES_ON_HOME = 6

/** The rail is a glance, not a list. Eight is as far as a thumb goes sideways. */
const RAIL = 8

/** Long-tail chips shown before the rest collapse into one count. */
const TAIL_CHIPS = 16

type View =
  | { name: 'home' }
  | { name: 'group'; id: GroupId }
  | { name: 'category'; category: string }
  | { name: 'search' }
  | { name: 'stumble' }

export function Directory(props: DirectoryProps) {
  const [payload, setPayload] = useState<DirectoryPayload | null>(null)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<View>({ name: 'home' })
  const [position, setPosition] = useState<Position | null>(null)
  /** Null before we have asked. False once a refusal or a timeout came back. */
  const [located, setLocated] = useState<boolean | null>(null)
  const [locating, setLocating] = useState(false)
  const [query, setQuery] = useState('')
  const [openOnly, setOpenOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>('near')
  const [selected, setSelected] = useState<RankedPlace | null>(null)

  useEffect(() => {
    void fetchDirectory().then(setPayload, () => setFailed(true))

    // Only ask outright if the browser will answer without a dialog. Throwing a
    // permission prompt at somebody for opening a tab is how a resident learns
    // to dismiss them, and every surface here works without it.
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

  const scope = useMemo(
    () => ({
      ...DEFAULT_RANK,
      position,
      group: view.name === 'group' ? view.id : null,
      category: view.name === 'category' ? view.category : null,
      query: view.name === 'search' ? query : '',
      openOnly,
      sort,
    }),
    [position, view, query, openOnly, sort],
  )

  const listed = useMemo(
    () => (payload ? rankDirectory(payload.places, scope) : []),
    [payload, scope],
  )

  const bar = (
    <AppBar
      label="Directory"
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
          <p className="problem">The directory could not be loaded.</p>
          <button className="secondary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
        <TabBar current="nearby" onChange={props.onTab} />
      </div>
    )
  }

  if (!payload) {
    // The skeleton holds the geometry of the intro and the rail, so nothing
    // jumps when the real directory lands.
    return (
      <div className="today">
        {bar}
        <div className="dir-loading" aria-busy="true" aria-label="Loading the directory">
          <Skeleton shape="line" width="86%" height={26} />
          <Skeleton shape="line" width="64%" height={26} />
          <Skeleton shape="block" width="100%" height={68} />
          <Skeleton shape="block" width="100%" height={148} />
        </div>
        <TabBar current="nearby" onChange={props.onTab} />
      </div>
    )
  }

  if (view.name === 'stumble') {
    return (
      <Stumble
        places={payload.places}
        position={position}
        total={payload.intro.total}
        saved={savedRefs}
        canSave={props.account !== null}
        onToggleSave={(p) => void toggleSave(p)}
        onOpen={setSelected}
        onClose={() => setView({ name: 'home' })}
      />
    )
  }

  const openRail = rankDirectory(payload.places, {
    ...DEFAULT_RANK,
    position,
    // `openNow === true` only. A place whose hours we could not read is not
    // put in a rail titled "open right now", because that would be a claim.
    openOnly: true,
    sort: position ? 'near' : 'open',
  }).slice(0, RAIL)

  return (
    <div className="today dir">
      {bar}

      {view.name === 'home' ? (
        <Home
          payload={payload}
          openRail={openRail}
          position={position}
          located={located}
          locating={locating}
          onLocate={() => void locate()}
          onGroup={(id) => setView({ name: 'group', id })}
          onCategory={(category) => setView({ name: 'category', category })}
          onSearch={() => setView({ name: 'search' })}
          onStumble={() => setView({ name: 'stumble' })}
          onOpen={setSelected}
        />
      ) : view.name === 'search' ? (
        <section className="dir-block">
          <BackLink onBack={() => setView({ name: 'home' })} label="The directory" />
          <div className="dir-searchwrap">
            <SearchInput
              label={`Search ${payload.intro.total} places`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => setQuery('')}
              placeholder="A name, a street, or what it is"
              // No recent searches and no suggested terms, deliberately. Both
              // are small surveillance surfaces, and the answer to "I do not
              // know what to type" is the stumble button, not a list of what
              // other people typed.
              autoFocus
            />
          </div>
          <Results
            places={listed}
            empty={
              query.trim() === ''
                ? 'Type a few letters, or go back and let the directory pick something.'
                : `Nothing in the directory matches "${query.trim()}".`
            }
            savedRefs={savedRefs}
            canSave={props.account !== null}
            onToggleSave={(p) => void toggleSave(p)}
            onOpen={setSelected}
          />
        </section>
      ) : (
        <GroupLanding
          payload={payload}
          view={view}
          places={listed}
          summary={filterSummary(payload.places, scope)}
          position={position}
          openOnly={openOnly}
          sort={sort}
          onOpenOnly={setOpenOnly}
          onSort={setSort}
          onBack={() => setView({ name: 'home' })}
          onCategory={(category) => setView({ name: 'category', category })}
          savedRefs={savedRefs}
          canSave={props.account !== null}
          onToggleSave={(p) => void toggleSave(p)}
          onOpen={setSelected}
        />
      )}

      <PlaceSheet
        place={selected}
        scrapedLabel={payload.scrapedLabel}
        onClose={() => setSelected(null)}
      />

      <TabBar current="nearby" onChange={props.onTab} />
    </div>
  )
}

/* ── the discovery home ──────────────────────────────────────────────────── */

function Home({
  payload,
  openRail,
  position,
  located,
  locating,
  onLocate,
  onGroup,
  onCategory,
  onSearch,
  onStumble,
  onOpen,
}: {
  payload: DirectoryPayload
  openRail: RankedPlace[]
  position: Position | null
  located: boolean | null
  locating: boolean
  onLocate: () => void
  onGroup: (id: GroupId) => void
  onCategory: (category: string) => void
  onSearch: () => void
  onStumble: () => void
  onOpen: (place: RankedPlace) => void
}) {
  const [allTiles, setAllTiles] = useState(false)
  const [allChips, setAllChips] = useState(false)
  const { intro } = payload
  const tiles = allTiles ? payload.groups : payload.groups.slice(0, TILES_ON_HOME)
  const chips = allChips ? payload.tail : payload.tail.slice(0, TAIL_CHIPS)

  return (
    <>
      {/*
        The intro is the only place on this screen where the product speaks in
        its own voice, and every number in it is counted rather than written.
        It is doing a job: the size of the directory reframes it as a place with
        a lot left in it rather than a lookup table already exhausted, and the
        second line states the gap in the data before a resident finds it.
      */}
      <div className="dir-intro">
        <p>
          There are {intro.total} places in this directory, and this screen is built for finding
          the ones you did not know to look for.
        </p>
        <p className="dir-intro-sub">
          {intro.withHours} told us their hours. The other {intro.unknownHours} did not, and we do
          not guess.
          {payload.scrapedLabel ? ` Read on ${payload.scrapedLabel}.` : ''}
        </p>
      </div>

      <button className="dir-serendipity" onClick={onStumble}>
        <span className="dir-serendipity-icon">
          <Icon name="sparkle" size={22} />
        </span>
        <span className="dir-serendipity-text">
          <span className="dir-serendipity-title">Show me something</span>
          <span className="dir-serendipity-sub">One place at a time, drawn at random</span>
        </span>
        <Icon name="arrow-right" size={16} className="dir-serendipity-go" />
      </button>

      {openRail.length > 0 && (
        <section className="dir-block">
          <div className="dir-block-head">
            <h2 className="dir-block-title">Open right now</h2>
            <span className="dir-block-count">{intro.openNow} places</span>
          </div>
          <p className="dir-block-note">
            {position
              ? 'Distance is worked out on your phone. We never receive your location.'
              : 'Computed from the hours we could read, against the town clock.'}
          </p>
          <div className="dir-rail">
            {openRail.map((place) => (
              <MiniCard key={place.id} place={place} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}

      {/*
        Offered once, and it is the honest version of the dialog it triggers.
        The refusal state is a note rather than a nag: a resident who said no
        has answered, and asking again on every render teaches people to
        distrust the buttons on a screen.
      */}
      {position === null && (
        <div className="dir-locate">
          <Icon name="target" size={18} />
          <div className="dir-locate-text">
            <span className="dir-locate-title">
              {located === false ? 'Location off' : 'Sort by how far away it is'}
            </span>
            <span className="dir-locate-detail">
              {located === false
                ? 'Showing what is open instead.'
                : 'Your position stays on this device. The directory is downloaded and sorted here.'}
            </span>
          </div>
          {located !== false && (
            <Button size="sm" onClick={onLocate} loading={locating}>
              Use my location
            </Button>
          )}
        </div>
      )}

      <section className="dir-block">
        <div className="dir-block-head">
          <h2 className="dir-block-title">Browse by what it is</h2>
          {payload.groups.length > TILES_ON_HOME && (
            <button className="dir-block-link" onClick={() => setAllTiles((on) => !on)}>
              {allTiles ? 'Fewer' : `All ${payload.groups.length}`}
              <Icon name={allTiles ? 'chevron-up' : 'chevron-down'} size={14} />
            </button>
          )}
        </div>
        <div className="dir-tiles">
          {tiles.map((group) => (
            <button
              key={group.id}
              className="dir-tile"
              data-tone={GROUP_TONE[group.id]}
              onClick={() => onGroup(group.id)}
            >
              <span className="dir-tile-art" aria-hidden="true" />
              <Icon name={GROUP_ICON[group.id]} size={22} className="dir-tile-icon" />
              <span className="dir-tile-name">{group.label}</span>
              <span className="dir-tile-count">{group.count}</span>
            </button>
          ))}
        </div>
      </section>

      {/*
        The long tail as it actually is. 304 categories with 140 of them
        appearing once is a faithful record and a useless grid, so the fifteen
        doors above are the browse and this is the shortcut for somebody who
        knows the exact words. The last chip states the size of what is not
        shown rather than hiding it.
      */}
      <section className="dir-block">
        <div className="dir-block-head">
          <h2 className="dir-block-title">Or by the exact words</h2>
          <span className="dir-block-count">{intro.categories} in the scrape</span>
        </div>
        <div className="dir-chips">
          {chips.map((entry) => (
            <button
              key={entry.category}
              className="dir-chip"
              onClick={() => onCategory(entry.category)}
            >
              {entry.category}
              <span>{entry.count}</span>
            </button>
          ))}
          {payload.tail.length > TAIL_CHIPS && (
            <button className="dir-chip" data-tail onClick={() => setAllChips((on) => !on)}>
              {allChips ? 'Show fewer' : `${payload.tail.length - TAIL_CHIPS} more`}
              <Icon name={allChips ? 'chevron-up' : 'chevron-right'} size={14} />
            </button>
          )}
        </div>
      </section>

      <section className="dir-block dir-block-last">
        <div className="dir-block-head">
          <h2 className="dir-block-title">Looking for something specific?</h2>
        </div>
        <button className="dir-searchfield" onClick={onSearch}>
          <Icon name="search" size={16} />
          <span>Search {intro.total} places</span>
        </button>
      </section>
    </>
  )
}

/* ── a group, or one exact category ──────────────────────────────────────── */

function GroupLanding({
  payload,
  view,
  places,
  summary,
  position,
  openOnly,
  sort,
  onOpenOnly,
  onSort,
  onBack,
  onCategory,
  savedRefs,
  canSave,
  onToggleSave,
  onOpen,
}: {
  payload: DirectoryPayload
  view: { name: 'group'; id: GroupId } | { name: 'category'; category: string }
  places: RankedPlace[]
  summary: { shown: number; total: number; hiddenUnknown: number }
  position: Position | null
  openOnly: boolean
  sort: SortKey
  onOpenOnly: (on: boolean) => void
  onSort: (key: SortKey) => void
  onBack: () => void
  onCategory: (category: string) => void
  savedRefs: Set<string>
  canSave: boolean
  onToggleSave: (place: RankedPlace) => void
  onOpen: (place: RankedPlace) => void
}) {
  const group =
    view.name === 'group'
      ? payload.groups.find((g) => g.id === view.id)
      : payload.groups.find((g) => g.id === payload.tail.find((t) => t.category === view.category)?.group)

  const title = view.name === 'group' ? (group?.label ?? 'Browse') : view.category
  const icon = group ? GROUP_ICON[group.id] : 'storefront'
  const openHere = places.filter((p) => p.openNow === true).length

  return (
    <>
      <header className="dir-cathead">
        <BackLink onBack={onBack} label="The directory" />
        <div className="dir-cathead-main">
          <span className="dir-cathead-icon">
            <Icon name={icon} size={22} />
          </span>
          <div>
            <h2 className="dir-cathead-title">{title}</h2>
            <p className="dir-cathead-sub">
              {summary.total} in {payload.town.name}. {openHere} open right now.
            </p>
          </div>
        </div>

        {/*
          What the group is made of, named. "Eat and drink" is a label somebody
          wrote; the categories under it are what the scrape actually says, and
          a resident who disagrees with the rollup can see exactly what went
          into it rather than guessing at our taxonomy.
        */}
        {view.name === 'group' && group && group.categories.length > 1 && (
          <p className="dir-cathead-blurb">
            Rolled up from {group.categories.length} categories, including{' '}
            {group.categories.slice(0, 4).map((c) => c.toLowerCase()).join(', ')}.
          </p>
        )}

        <div className="dir-tools">
          <button className="dir-tool" data-on={openOnly || undefined} onClick={() => onOpenOnly(!openOnly)} aria-pressed={openOnly}>
            <Icon name="filter" size={14} />
            Open now
          </button>
          <button className="dir-tool" data-on={sort === 'near' || undefined} onClick={() => onSort('near')} aria-pressed={sort === 'near'}>
            <Icon name="sort" size={14} />
            {position ? 'Nearest' : 'What is open'}
          </button>
          <button className="dir-tool" data-on={sort === 'az' || undefined} onClick={() => onSort('az')} aria-pressed={sort === 'az'}>
            <Icon name="sort" size={14} />
            A to Z
          </button>
        </div>

        {/*
          The count, and what it cost. "18 of 127" with no explanation is
          indistinguishable from a broken directory, and the open-now filter is
          the one that has to say what it took out: it hides the places whose
          hours we could not read, and they may well be open.
        */}
        {openOnly && (
          <p className="dir-filter-warn">
            <Icon name="info" size={14} />
            <span>
              Showing <b>{summary.shown} of {summary.total}</b>. Open now also hides{' '}
              {summary.hiddenUnknown} whose hours we could not read. They may well be open.
            </span>
          </p>
        )}
      </header>

      {/*
        The chips under a group are its own categories, so narrowing 127 shops
        to 11 clothing shops never goes back through the home screen.
      */}
      {view.name === 'group' && group && group.categories.length > 1 && (
        <div className="dir-chips dir-chips-inset">
          {group.categories.slice(0, 10).map((category) => (
            <button key={category} className="dir-chip" onClick={() => onCategory(category)}>
              {category}
            </button>
          ))}
        </div>
      )}

      <Results
        places={places}
        empty={
          openOnly
            ? 'Nothing in here is open at this minute.'
            : 'Nothing in the directory matches that.'
        }
        savedRefs={savedRefs}
        canSave={canSave}
        onToggleSave={onToggleSave}
        onOpen={onOpen}
      />
    </>
  )
}

/**
 * The results, as cards on a wide screen and rows on a narrow one.
 *
 * Both are drawn, and CSS decides which is visible. The row exists because 127
 * cards is thirty screens and 127 rows is nine; the card exists because a grid
 * with room in it is what makes browsing feel like looking rather than
 * scanning. They carry the same five facts, which is what makes swapping them
 * a layout decision rather than a content one.
 */
function Results({
  places,
  empty,
  savedRefs,
  canSave,
  onToggleSave,
  onOpen,
}: {
  places: RankedPlace[]
  empty: string
  savedRefs: Set<string>
  canSave: boolean
  onToggleSave: (place: RankedPlace) => void
  onOpen: (place: RankedPlace) => void
}) {
  if (places.length === 0) {
    return <EmptyState mark="lens" line={empty} align="center" />
  }

  return (
    <>
      <div className="dir-grid">
        {places.map((place) => (
          <BrowseCard
            key={place.id}
            place={place}
            saved={savedRefs.has(`business:${place.id}`)}
            canSave={canSave}
            onToggleSave={() => onToggleSave(place)}
            onOpen={onOpen}
          />
        ))}
      </div>
      <ul className="dir-rows">
        {places.map((place) => (
          <ListRow
            key={place.id}
            place={place}
            saved={savedRefs.has(`business:${place.id}`)}
            canSave={canSave}
            onToggleSave={() => onToggleSave(place)}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </>
  )
}

/* ── one listing ─────────────────────────────────────────────────────────── */

/**
 * A sheet, not a screen.
 *
 * The design's full business profile — the hours table, the description, the
 * edit history, the claim flow — needs things Town Square does not hold: a
 * resident-written description, a per-listing verification date, and listing
 * ownership. What it does hold is a name, a category, an address, a phone, a
 * website and a week of hours, and that is exactly enough to decide whether to
 * go. So this is that, plus the one line that makes a scraped directory
 * trustworthy rather than merely populated: where the facts came from and when.
 */
function PlaceSheet({
  place,
  scrapedLabel,
  onClose,
}: {
  place: RankedPlace | null
  scrapedLabel: string | null
  onClose: () => void
}) {
  if (!place) return null
  const directions = directionsUrl(place.address)

  return (
    <BottomSheet open onClose={onClose} title={place.name} description={place.category}>
      <div className="dir-sheet">
        <PinCard place={place} />

        <div className="dir-sheet-acts">
          {place.phone && (
            <a className="dir-act" href={`tel:${place.phone.replace(/[^\d+]/g, '')}`}>
              <Icon name="phone" size={20} />
              <span className="dir-act-label">Call</span>
              <span className="dir-act-sub">{place.phone}</span>
            </a>
          )}
          {directions && (
            <a className="dir-act" href={directions} target="_blank" rel="noopener noreferrer">
              <Icon name="directions" size={20} />
              <span className="dir-act-label">Directions</span>
              <span className="dir-act-sub">{place.address ? shortAddress(place.address) : 'Opens Maps'}</span>
            </a>
          )}
          {place.url && (
            <a className="dir-act" href={place.url} target="_blank" rel="noopener noreferrer">
              <Icon name="globe" size={20} />
              <span className="dir-act-label">Website</span>
              <span className="dir-act-sub">{hostOf(place.url)}</span>
            </a>
          )}
        </div>

        <div className="dir-prov">
          <p className="dir-prov-h">What we know, and where it came from</p>
          <ul>
            <li>
              <Icon name="map-pin" size={14} />
              <span>
                <b>Name, address and phone</b> from the public listing
                {scrapedLabel ? `, read on ${scrapedLabel}` : ''}.
              </span>
            </li>
            <li>
              <Icon name="clock" size={14} />
              <span>
                {place.phase === 'unknown' ? (
                  <>
                    <b>Hours</b> were not published in a form we could read, so we will not say
                    whether it is open.
                  </>
                ) : (
                  <>
                    <b>Hours</b> from the same listing. A full week was published, so we compute{' '}
                    {place.detail.toLowerCase()} rather than printing a range.
                  </>
                )}
              </span>
            </li>
            <li>
              <Icon name="image" size={14} />
              <span>
                <b>Photographs</b> are not ours. Nobody has added one yet, so the card draws a
                plate instead of somebody else's picture.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </BottomSheet>
  )
}

/** `https://www.crackerbarrel.com/Locations/…` → `crackerbarrel.com`. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Opens in a new tab'
  }
}

function BackLink({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button className="dir-back" onClick={onBack}>
      <Icon name="chevron-left" size={14} />
      {label}
    </button>
  )
}

/**
 * Two things this screen deliberately does not do, and one open question.
 *
 * **It does not draw a map.** `TownMap` is Nearby's, drawn from the same 741
 * addresses, and a second one here would be the same town twice with two sets
 * of pin behaviour. `PinCard` is shared instead, which is the half of the map
 * that this screen actually needs — the card that appears when you pick a
 * place. If discovery and Nearby merge, the map comes with it.
 *
 * **It does not show articles or podcasts.** The design mixes them into the
 * directory, and the feed genuinely carries stories. It carries no podcasts at
 * all, and nothing links a story to a listing, so "Cooper Music, and the
 * episode about it" is a relationship no source in this repo holds.
 *
 * **Whether Nearby should still exist is a real question**, and the answer this
 * file leans toward is no. See the note in the report: the two screens read the
 * same 741 listings, compute the same open state through the same function,
 * rank against the same client-held position, and differ only in that Nearby
 * leads with distance and this leads with discovery. That is one screen with a
 * sort control, not two tabs.
 */
export { OpenPill }
