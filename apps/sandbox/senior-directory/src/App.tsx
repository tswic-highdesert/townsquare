/**
 * The Senior Directory's view, written for older residents and the people who
 * care for them.
 *
 * Two screens, one decision at a time:
 *
 * - **Home**: a search box and a big picture card for each need. Nothing on
 *   this screen changes in place; every control takes you somewhere.
 * - **List**: the places for one need (or one search), with the need's name at
 *   the top and a large "All services" button above and below the list.
 *
 * Seniors do better with steady screens than with controls that reshape the
 * page around them, and a list that changes below the fold is easy to miss.
 * The browser's Back button is not relied on: inside Town Square the creation
 * is a frame, so we draw our own.
 *
 * Data comes from `./data/directory.ts` (bundled chamber listings merged with
 * `town.businesses()`); the groups come from `./data/needs.ts`.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { app, town } from '@townsquare/sdk'
import { chamberEntries, loadDirectory, type DirectoryEntry } from './data/directory.js'
import { NEEDS, needLabel, type Need, type NeedId } from './data/needs.js'
import { HOME_CITY, isInTown, mapsUrl, matches, telOf } from './data/search.js'
import { Icon, iconForEntry, iconForNeed } from './Icons.js'

const APP_TITLE = 'Senior Resources'

type View = { kind: 'home' } | { kind: 'need'; id: NeedId } | { kind: 'search'; query: string }

export function App() {
  const [townName, setTownName] = useState<string | null>(null)
  // Chamber data is bundled, so it shows at once; town listings merge in after.
  const [entries, setEntries] = useState<DirectoryEntry[]>(chamberEntries)
  const [loading, setLoading] = useState(true)
  const [townError, setTownError] = useState<string | null>(null)

  const [view, setView] = useState<View>({ kind: 'home' })
  const [largeText, setLargeText] = useState(false)
  /** Kept here, not per list, so the choice holds as you move between groups. */
  const [inTownOnly, setInTownOnly] = useState(false)
  /** The need card the resident last opened, so Back can return them to it. */
  const [cameFrom, setCameFrom] = useState<NeedId | null>(null)

  useEffect(() => {
    let cancelled = false
    town
      .info()
      .then((info) => !cancelled && setTownName(info.name))
      .catch(() => !cancelled && setTownName(null))
    loadDirectory().then((result) => {
      if (cancelled) return
      setEntries(result.entries)
      setTownError(result.townError)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Large text scales the whole page through the root font size.
  useEffect(() => {
    document.documentElement.classList.toggle('large-text', largeText)
  }, [largeText])

  // Name the screen in Town Square's title bar, like a page title.
  useEffect(() => {
    const screen =
      view.kind === 'need' ? needLabel(view.id) : view.kind === 'search' ? `Search: ${view.query}` : null
    app.setTitle(screen ? `${screen} · ${APP_TITLE}` : APP_TITLE)
  }, [view])

  const countsByNeed = useMemo(() => {
    const counts = new Map<NeedId, number>()
    for (const e of entries) {
      if (inTownOnly && !isInTown(e)) continue
      counts.set(e.need, (counts.get(e.need) ?? 0) + 1)
    }
    return counts
  }, [entries, inTownOnly])

  return (
    <div className="shell">
      <header className="header">
        <div>
          <p className="eyebrow">For seniors and caregivers{townName ? ` in ${townName}` : ''}</p>
          <p className="title">{APP_TITLE}</p>
        </div>
        <button
          type="button"
          className="text-size"
          aria-pressed={largeText}
          onClick={() => setLargeText((v) => !v)}
        >
          <span aria-hidden="true" className="text-size-glyph">
            A<span>A</span>
          </span>
          {largeText ? 'Normal text' : 'Larger text'}
        </button>
      </header>

      <main>
      {view.kind === 'home' ? (
        <Home
          counts={countsByNeed}
          inTownOnly={inTownOnly}
          returnTo={cameFrom}
          onShowAllTowns={() => setInTownOnly(false)}
          onNeed={(id) => {
            setCameFrom(id)
            setView({ kind: 'need', id })
          }}
          onSearch={(query) => {
            setCameFrom(null)
            setView({ kind: 'search', query })
          }}
        />
      ) : (
        <ListScreen
          // A new screen starts with an empty in-list search.
          key={view.kind === 'need' ? `need:${view.id}` : `search:${view.query}`}
          view={view}
          entries={entries}
          inTownOnly={inTownOnly}
          onInTownOnly={setInTownOnly}
          loading={loading}
          onBack={() => setView({ kind: 'home' })}
          onSearch={(query) => setView({ kind: 'search', query })}
        />
      )}
      </main>

      {townError && (
        <p className="notice">The town directory isn’t answering right now, so you’re seeing the chamber list only.</p>
      )}

      <footer className="footer">
        <p>
          Listings come from the {HOME_CITY} Chamber of Commerce’s senior resources
          {townError ? '' : ', plus matching places in the Town Square directory'}. Details change; please call ahead.
        </p>
      </footer>
    </div>
  )
}

// ── home: search and the need cards ────────────────────────────────────────

function Home({
  counts,
  inTownOnly,
  returnTo,
  onShowAllTowns,
  onNeed,
  onSearch,
}: {
  counts: Map<NeedId, number>
  inTownOnly: boolean
  /** The need card to land on when coming back from its list. */
  returnTo: NeedId | null
  onShowAllTowns: () => void
  onNeed: (id: NeedId) => void
  onSearch: (query: string) => void
}) {
  const returnCard = useRef<HTMLButtonElement>(null)

  // Coming back from a list: put the resident on the card they opened, rather
  // than the top of the page, so they can pick the next one from there.
  useEffect(() => {
    if (!returnCard.current) return
    returnCard.current.focus({ preventScroll: true })
    returnCard.current.scrollIntoView({ block: 'center' })
  }, [])

  return (
    <>
      <h1 className="home-heading">What do you need help with?</h1>
      <p className="lede">Search, or tap a picture to see the places that can help. Each place has a button to call them.</p>

      <SearchForm label="Search all services" onSearch={onSearch} />

      <p className="emergency" role="note">
        <strong>In an emergency, call 911.</strong> This directory is for planning and everyday help.
      </p>

      {/* The counts below follow the saved choice, so say so where they are. */}
      {inTownOnly && (
        <p className="town-filter">
          Showing only places in {HOME_CITY}.{' '}
          <button type="button" className="link-button" onClick={onShowAllTowns}>
            Include nearby towns
          </button>
        </p>
      )}

      <ul className="needs">
        {NEEDS.map((n) => {
          const count = counts.get(n.id) ?? 0
          if (count === 0) return null
          return (
            <li key={n.id}>
              <button
                type="button"
                ref={n.id === returnTo ? returnCard : undefined}
                className={`need need-${n.id}`}
                onClick={() => onNeed(n.id)}
              >
                <span className="need-icon">
                  <Icon name={iconForNeed(n.id)} />
                </span>
                <span className="need-text">
                  <span className="need-label">{n.label}</span>
                  <span className="need-hint">{n.hint}</span>
                  <span className="need-count">
                    {count} {count === 1 ? 'place' : 'places'}
                  </span>
                </span>
                <span className="need-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** Search across every service: type, then press Search (or Enter). */
function SearchForm({
  label,
  initial = '',
  onSearch,
}: {
  label: string
  initial?: string
  onSearch: (query: string) => void
}) {
  const [draft, setDraft] = useState(initial)
  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    if (draft.trim()) onSearch(draft.trim())
  }

  return (
    <form className="search" role="search" onSubmit={submit}>
      <label htmlFor="q">{label}</label>
      <div className="search-row">
        <input
          id="q"
          type="search"
          placeholder="For example “hospice” or “Rose Drug”"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" className="button button-primary search-button" disabled={!draft.trim()}>
          Search
        </button>
      </div>
    </form>
  )
}

// ── list: one need, or one search ──────────────────────────────────────────

function ListScreen({
  view,
  entries,
  inTownOnly,
  onInTownOnly,
  loading,
  onBack,
  onSearch,
}: {
  view: Exclude<View, { kind: 'home' }>
  entries: DirectoryEntry[]
  inTownOnly: boolean
  onInTownOnly: (value: boolean) => void
  loading: boolean
  onBack: () => void
  onSearch: (query: string) => void
}) {
  /** Narrows one need's list as you type. The list is right below, so the change is in view. */
  const [within, setWithin] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const need: Need | null = view.kind === 'need' ? NEEDS.find((n) => n.id === view.id) ?? null : null

  // Arriving on a new screen: start at its top, and tell screen readers where
  // they are. The creation is a frame sized to its content, so the scroll that
  // matters is the host page's; scrollIntoView reaches it where focus alone
  // would not.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView({ block: 'start' })
  }, [view])

  const items = useMemo(() => {
    let list = entries
    if (view.kind === 'need') {
      list = list.filter((e) => e.need === view.id)
      if (within.trim()) list = list.filter((e) => matches(e, within))
    } else {
      list = list.filter((e) => matches(e, view.query))
    }
    if (inTownOnly) list = list.filter(isInTown)
    return list
  }, [entries, view, inTownOnly, within])

  const total = view.kind === 'need' ? entries.filter((e) => e.need === view.id).length : null
  const someOutOfTown =
    view.kind === 'need' && entries.some((e) => e.need === view.id && !isInTown(e))

  return (
    <>
      <BackButton onBack={onBack} />

      <div className={`list-head ${need ? `need-${need.id}` : ''}`}>
        {need && (
          <span className="list-icon">
            <Icon name={iconForNeed(need.id)} />
          </span>
        )}
        <div>
          <h1 ref={heading} tabIndex={-1}>
            {need ? need.label : `Results for “${view.kind === 'search' ? view.query : ''}”`}
          </h1>
          <p className="list-sub">
            {items.length} {items.length === 1 ? 'place' : 'places'}
            {need && <> · {need.hint}</>}
            {loading && <span className="muted"> · checking the town directory…</span>}
          </p>
        </div>
      </div>

      {need ? (
        <div className="search">
          <label htmlFor="within">Search in {need.label.toLowerCase()}</label>
          <div className="search-row">
            <input
              id="within"
              type="search"
              placeholder="Type a name or street"
              value={within}
              onChange={(e) => setWithin(e.target.value)}
              autoComplete="off"
            />
            {within && (
              <button type="button" className="button search-button" onClick={() => setWithin('')}>
                Clear
              </button>
            )}
          </div>
        </div>
      ) : (
        <SearchForm label="Search again" initial={view.kind === 'search' ? view.query : ''} onSearch={onSearch} />
      )}

      <div className="list-tools">
        {(someOutOfTown || inTownOnly) && (
          <label className="check">
            <input type="checkbox" checked={inTownOnly} onChange={(e) => onInTownOnly(e.target.checked)} />
            Only show places in {HOME_CITY}
          </label>
        )}
        {items.length > 0 && (
          // Caregivers often want this on paper, for the fridge or a visit.
          // The print stylesheet drops the buttons and spells out each
          // phone number and email instead.
          <button type="button" className="button print-button" onClick={() => window.print()}>
            <PrintIcon /> Print this list
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <p>
            {view.kind === 'search'
              ? 'Nothing matched that search. Try a shorter word, or go back and pick a picture.'
              : within.trim()
                ? `Nothing in ${need?.label.toLowerCase() ?? 'this list'} matches “${within.trim()}”.`
                : `Nothing in ${HOME_CITY} yet${total ? '; untick the box to see nearby towns' : ''}.`}
          </p>
          {within.trim() && (
            <button type="button" className="button" onClick={() => setWithin('')}>
              Show all {total} places
            </button>
          )}
        </div>
      ) : (
        <ul className="cards">
          {items.map((e) => (
            <Card key={e.id} entry={e} showNeed={view.kind === 'search'} />
          ))}
        </ul>
      )}

      {items.length > 2 && <BackButton onBack={onBack} />}
    </>
  )
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="back" onClick={onBack}>
      <span aria-hidden="true">←</span> All services
    </button>
  )
}

function Card({ entry: e, showNeed }: { entry: DirectoryEntry; showNeed: boolean }) {
  const outOfTown = !isInTown(e) && e.city
  const hasContact = Boolean(e.phone || e.email || e.website)

  return (
    <li className={`card need-${e.need}`}>
      <div className="card-head">
        <span className="card-icon">
          <Icon name={iconForEntry(e)} size={32} />
        </span>
        <div className="card-title">
          <h2>{e.name}</h2>
          {outOfTown && <span className="tag">{e.city}</span>}
          {showNeed && <span className="card-need">{needLabel(e.need)}</span>}
        </div>
      </div>

      {e.address && <p className="address">{e.address}</p>}

      <div className="actions">
        {e.phone && (
          <a className="button button-primary button-call" href={`tel:${telOf(e.phone)}`}>
            <PhoneIcon />
            <span>
              Call <span className="number">{e.phone}</span>
            </span>
          </a>
        )}
        {e.email && (
          <a className="button" href={`mailto:${e.email}`}>
            Email
          </a>
        )}
        {e.address && (
          <a className="button" href={mapsUrl(e)} target="_blank" rel="noreferrer">
            Directions
          </a>
        )}
        {/* Website last: an unconfirmed one carries a label, and it wraps best at the end. */}
        {e.website &&
          (e.websiteAssumed ? (
            // Found by searching the web, not given by the business or the
            // town directory. Say so next to the button, in words.
            <span className="website-assumed">
              <a
                className="button"
                href={e.website}
                target="_blank"
                rel="noreferrer"
                aria-describedby={`assumed-${e.id}`}
              >
                Website
              </a>
              <span className="assumed-tag" id={`assumed-${e.id}`}>
                Unconfirmed link
              </span>
            </span>
          ) : (
            <a className="button" href={e.website} target="_blank" rel="noreferrer">
              Website
            </a>
          ))}
      </div>
      {!(e.phone || e.email) && <p className="muted small">No phone or email listed yet.</p>}

      {/* Paper has no buttons: spell the contact details out when printing. */}
      {hasContact && (
        <p className="print-only">
          {[e.phone, e.email, e.website && (e.websiteAssumed ? `${e.website} (unconfirmed)` : e.website)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      <p className="meta">
        {e.memberSince && <>Chamber member since {e.memberSince}</>}
        {e.memberSince && e.sources.includes('town') && ' · '}
        {e.sources.includes('town') && <>In the Town Square directory</>}
      </p>
    </li>
  )
}

function PrintIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 9V3.5h10V9M7 17H4.5V9h15v8H17" />
      <path d="M7 13.5h10v7H7Z" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z"
      />
    </svg>
  )
}
