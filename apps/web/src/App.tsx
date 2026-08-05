/**
 * The shell: four destinations, a trust page, and a running creation.
 *
 * Today (`design/hifi` 4a) is home. Nearby, Creations and Yours sit beside it
 * in the nav — which on a phone is the bar under a thumb and at 1040px is the
 * rail down the left, from one component. The trust page is not a formality —
 * it is the moment a resident decides, and it is generated entirely from the
 * frozen manifest by `describeManifest`, so a creation cannot write its own.
 *
 * ## Creations is a destination now, not a button
 *
 * It used to be a link at the foot of Today. `design/hifi-v2` section 02 argues
 * it belongs in the nav as a peer, and the argument is the product: value
 * compounds with builders, and a platform that hides what residents made has
 * already decided it is a news app. Today's own "Browse" still works and lands
 * in the same place.
 *
 * ## What the shell holds and the screens do not
 *
 * The search index. Today's payload, the creation list and Nearby's listings
 * are three fetches that already happen for three different screens, and
 * searching across all of them is the one job no single screen can do. It is
 * assembled here and nothing about it leaves the browser.
 */

import { useEffect, useMemo, useState } from 'react'
import { describeManifest } from '@townsquare/host'
import { AccountScreen } from './Account.js'
import { AppBar } from './AppBar.js'
import { ReportPanel } from './ReportPanel.js'
import { ReviewScreen } from './Review.js'
import { resolveInitialAccount, type AccountView } from './session.js'
import { CreationFrame } from './CreationFrame.js'
import { Nearby } from './Nearby.js'
import { Today } from './Today.js'
import { Yours } from './Yours.js'
import { TabBar, type TabName } from './TabBar.js'
import { BackTo, PageHeader } from './nav/PageHeader.js'
import { SearchOverlay } from './nav/Search.js'
import { ShellContext } from './nav/shellContext.js'
import {
  docsFromCreations,
  docsFromNearby,
  docsFromToday,
  mergeDocs,
  type SearchDoc,
} from './nav/searchIndex.js'
import { fetchYours, type BuiltCreation, type SavedThing } from './savesData.js'
import { fetchToday, type TodayPayload } from './todayData.js'
import { fetchNearby, type NearbyPayload } from './nearbyData.js'
import { fetchCreations, fetchTown, type CreationSummary } from './townData.js'

type Screen =
  | { name: 'today' }
  | { name: 'nearby' }
  | { name: 'yours' }
  | { name: 'gallery' }
  | { name: 'account' }
  | { name: 'review' }
  /**
   * `from` is carried rather than assumed. A trust page is reachable from Today
   * and from the gallery, and a back button that always lands on the gallery
   * silently moves a resident somewhere they were not.
   */
  | { name: 'trust'; creation: CreationSummary; from: BackDestination }
  | { name: 'running'; creation: CreationSummary; from: BackDestination }

/**
 * Where the back button lands: the tab you came from, whichever it was.
 *
 * It is the full set of tabs rather than the three that list creations,
 * because search can open a neighbour's app from any of them, and landing on
 * Creations after searching from Nearby is the shell quietly moving somebody.
 */
type BackDestination = TabName

/**
 * The screens that are only a name, keyed by the tab that reaches them.
 *
 * A table rather than a cast. `setScreen({ name: someUnion })` does not
 * typecheck against a union of single-member objects, and the two ways past
 * that are a lookup or an assertion — one of which stays correct if a screen
 * later grows a field. It also holds the one place a tab's name and its
 * screen's name differ: the Creations tab lands on the gallery.
 */
const SCREENS = {
  today: { name: 'today' },
  nearby: { name: 'nearby' },
  creations: { name: 'gallery' },
  yours: { name: 'yours' },
} as const satisfies Record<TabName, Screen>

/** Which tab a screen belongs to, for the nav and for the desktop layout. */
const TAB_OF: Partial<Record<Screen['name'], TabName>> = {
  today: 'today',
  nearby: 'nearby',
  gallery: 'creations',
  yours: 'yours',
}

export function App() {
  const [creations, setCreations] = useState<CreationSummary[] | null>(null)
  const [town, setTown] = useState({ id: '', name: 'Town Square', timezone: 'America/Chicago' })
  const [screen, setScreen] = useState<Screen>({ name: 'today' })
  const [liveTitle, setLiveTitle] = useState<string | null>(null)
  const [account, setAccount] = useState<AccountView | null>(null)
  const [reporting, setReporting] = useState(false)
  const [today, setToday] = useState<TodayPayload | null>(null)
  const [todayFailed, setTodayFailed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  /**
   * Nearby's listings, held for search rather than for the Nearby screen.
   *
   * 54 KB over the wire, and worth fetching only when somebody actually
   * searches: 700 businesses is most of what is worth finding in this town,
   * and a search that quietly could not see them is a search that lies about
   * what the town has. Nearby still fetches its own copy — two fetches of a
   * cached response is cheaper than lifting that screen's whole state up here.
   */
  const [places, setPlaces] = useState<NearbyPayload | null>(null)
  const [placesLoading, setPlacesLoading] = useState(false)

  /**
   * Saved things, held here rather than in Yours.
   *
   * The bookmark on a Nearby row and the list on Yours are the same set, and a
   * copy in each is a copy that disagrees the moment somebody presses one. It is
   * lifted no higher than it has to be: nothing outside those two tabs reads it.
   */
  const [saved, setSaved] = useState<SavedThing[]>([])
  const [built, setBuilt] = useState<BuiltCreation[]>([])

  useEffect(() => {
    void fetchCreations().then(setCreations)
    void fetchTown().then(setTown)

    // A cold API assembles the whole town on first request, so this can take a
    // few seconds. It is the only fetch on the critical path for the home
    // screen, which is why Today is one endpoint rather than six.
    void fetchToday().then(setToday, () => setTodayFailed(true))

    // A confirmation link lands on the gallery with the token in the query.
    // It is redeemed on the way in and the resident carries on where they were
    // going: an interstitial "you are signed in" page would be a click that
    // tells them what the header already says.
    void resolveInitialAccount().then(setAccount)
  }, [])

  // The directory arrives on first search and never again. A failure leaves the
  // field working over everything else rather than breaking it.
  useEffect(() => {
    if (!searchOpen || places || placesLoading) return
    setPlacesLoading(true)
    void fetchNearby().then(
      (payload) => {
        setPlaces(payload)
        setPlacesLoading(false)
      },
      () => setPlacesLoading(false),
    )
  }, [searchOpen])

  /**
   * Re-read what is yours whenever who you are changes.
   *
   * Keyed on the handle rather than run once, because signing in and signing
   * out both have to move this: a fresh session must pick up its own saves, and
   * signing out must drop the previous resident's off the screen rather than
   * leaving them visible until a reload.
   */
  useEffect(() => {
    if (!account) {
      setSaved([])
      setBuilt([])
      return
    }
    void fetchYours().then((yours) => {
      setSaved(yours?.saves ?? [])
      setBuilt(yours?.built ?? [])
    }, () => undefined)
  }, [account?.handle])

  /**
   * The permission view handed down to a running creation.
   *
   * Rebuilt only when the handle or the verification changes, so a frame is
   * not torn down and re-mounted every time the account view is refetched.
   */
  const actingUser = useMemo(
    () => (account ? { handle: account.handle, verified: account.verified } : null),
    [account?.handle, account?.verified],
  )

  /**
   * Everything searchable, from payloads already on the client.
   *
   * Nearby first, because its record of a business carries the street address
   * and Today's rotating handful does not. `mergeDocs` keeps the first of any
   * duplicate, so the richer one wins.
   */
  const searchDocs: SearchDoc[] = useMemo(
    () =>
      mergeDocs(
        places ? docsFromNearby(places) : [],
        today ? docsFromToday(today) : [],
        creations ? docsFromCreations(creations) : [],
      ),
    [places, today, creations],
  )

  // Moderation is a role held by a committee, so the entry point is gated on
  // the role rather than on being anyone in particular. The API answers 404 to
  // everyone else, so this is a convenience, not the control.
  const canReview = account?.role === 'moderator' || account?.role === 'admin'

  /** Opening from a tab, which knows a slug and nothing else. */
  const openBySlug = (slug: string, from: BackDestination = 'today') => {
    const creation = creations?.find((c) => c.slug === slug)
    // The trust page, never straight into the creation. Today is a list of
    // things neighbours built; it is not a shortcut past the screen where a
    // resident reads what one of them is allowed to touch.
    if (creation) setScreen({ name: 'trust', creation, from })
  }

  const goToTab = (tab: TabName) => {
    setSearchOpen(false)
    setScreen(SCREENS[tab])
  }

  const chrome = { onSearch: () => setSearchOpen(true), searchOpen }

  const body = renderScreen()

  return (
    <ShellContext.Provider value={chrome}>
      {/*
        The wrapper is what turns three phone screens into a desktop shell.
        `data-view` is the only thing that differs between Today's capped
        reading column and Nearby's wide one, and it is read in `nav.css` — the
        screens themselves know nothing about either.
      */}
      <div className="ts-shell" data-view={TAB_OF[screen.name] ?? screen.name}>
        {body}
        <SearchOverlay
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          docs={searchDocs}
          loading={placesLoading}
          townName={town.name}
          onOpenCreation={(slug) => openBySlug(slug, TAB_OF[screen.name] ?? 'today')}
        />
      </div>
    </ShellContext.Provider>
  )

  function renderScreen() {
    if (screen.name === 'nearby') {
      return (
        <Nearby
          account={account}
          canReview={canReview}
          saved={saved}
          onSavedChange={setSaved}
          onTab={goToTab}
          onAccount={() => setScreen({ name: 'account' })}
          onReview={() => setScreen({ name: 'review' })}
        />
      )
    }

    if (screen.name === 'yours') {
      return (
        <Yours
          account={account}
          canReview={canReview}
          town={town}
          saved={saved}
          built={built}
          onSavedChange={setSaved}
          onOpenCreation={(slug) => openBySlug(slug, 'yours')}
          onTab={goToTab}
          onAccount={() => setScreen({ name: 'account' })}
          onReview={() => setScreen({ name: 'review' })}
        />
      )
    }

    if (screen.name === 'today') {
      if (todayFailed) {
        return (
          <div className="today-state">
            <p className="problem">Today could not be loaded.</p>
            <button className="secondary" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        )
      }
      if (!today) return <div className="today-state">Loading today…</div>

      return (
        <Today
          today={today}
          account={account}
          canReview={canReview}
          onOpenCreation={openBySlug}
          onBrowseCreations={() => setScreen({ name: 'gallery' })}
          onTab={goToTab}
          onAccount={() => setScreen({ name: 'account' })}
          onReview={() => setScreen({ name: 'review' })}
        />
      )
    }

    if (screen.name === 'review') {
      return <ReviewScreen onBack={() => setScreen({ name: 'today' })} />
    }

    if (screen.name === 'account') {
      return (
        <AccountScreen
          account={account}
          onAccountChange={setAccount}
          onBack={() => setScreen({ name: 'today' })}
        />
      )
    }

    if (screen.name === 'gallery') {
      /*
        A destination now, so it wears the shell the other destinations wear:
        the same bar, the same nav, and an editorial header rather than a back
        button. A tab you can reach from the nav and leave only by pressing
        back is a tab that is really still a sub-page.
      */
      return (
        <div className="today">
          <AppBar
            label="Creations"
            place={town.name}
            account={account}
            canReview={canReview}
            onAccount={() => setScreen({ name: 'account' })}
            onReview={() => setScreen({ name: 'review' })}
          />

          <div className="gallery-body">
            <PageHeader
              register="editorial"
              eyebrow={town.name}
              title="Built by neighbors"
              subtitle="Everything here was made by someone who lives in town, runs sandboxed on Town Square, and can only reach what it says it can."
            />

            {creations === null ? (
              <p className="eyebrow" style={{ marginTop: 32 }}>
                Loading…
              </p>
            ) : creations.length === 0 ? (
              <p className="lede" style={{ marginTop: 32 }}>
                Nobody has built anything yet. You could be first.
              </p>
            ) : (
              <ul className="gallery">
                {creations.map((creation) => (
                  <li key={creation.slug}>
                    <button
                      className="card"
                      onClick={() => setScreen({ name: 'trust', creation, from: 'creations' })}
                    >
                      <img
                        className="card-icon"
                        src={`${creation.origin}/${creation.manifest.icon}`}
                        alt=""
                      />
                      <span>
                        <span className="card-name">{creation.name}</span>
                        <span className="card-tagline" style={{ display: 'block' }}>
                          {creation.tagline}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <TabBar current="creations" onChange={goToTab} />
        </div>
      )
    }

    if (screen.name === 'trust') {
      const { creation, from } = screen
      const lines = describeManifest(creation.manifest)

      return (
        <div className="shell">
          {/* The label names where the control goes, not the word "Back". */}
          <BackTo label={BACK_LABEL[from]} onClick={() => setScreen(SCREENS[from])} />

          <h1 style={{ marginBottom: 4 }}>{creation.name}</h1>
          <p className="lede" style={{ marginTop: 0 }}>{creation.tagline}</p>
          <p>{creation.description}</p>

          <div className="eyebrow" style={{ marginTop: 28 }}>
            What it can touch
          </div>
          <ul className="trust">
            {lines.map((line) => (
              <li key={line.kind} data-weight={line.weight}>
                <div className="trust-title">{line.title}</div>
                <div className="trust-detail">{line.detail}</div>
              </li>
            ))}
          </ul>

          <button
            className="primary"
            onClick={() => setScreen({ name: 'running', creation, from })}
          >
            Open
          </button>
        </div>
      )
    }

    const { creation } = screen
    return (
      <div className="shell">
        {/*
          The chrome above a creation is not decoration. It is the reason a
          creation cannot credibly imitate Town Square: a resident always has a
          frame of reference that the creation cannot draw over, and there is no
          login form anywhere inside a creation for one to imitate.

          It is the one header in the product set on navy, and the close control
          is a cross rather than a chevron, because you are leaving something
          rather than going back up a level.
        */}
        <PageHeader
          register="host"
          title={creation.name}
          /*
            "by a neighbor" and not initials of the creation's own name: a
            creation's author is platform-assigned at approval, and nothing in
            development has been through the queue. "TB" for The Burrito Index
            would be an avatar for a person who does not exist.
          */
          subtitle="by a neighbor · sandboxed"
          back={{
            label: BACK_LABEL[screen.from],
            onClick: () => {
              setLiveTitle(null)
              setReporting(false)
              setScreen({ name: 'trust', creation, from: screen.from })
            },
          }}
          icon={
            <img
              className="card-icon"
              style={{ width: 28, height: 28, flex: 'none' }}
              src={`${creation.origin}/${creation.manifest.icon}`}
              alt=""
            />
          }
          /*
            No action on the right. The hi-fi puts an "about this creation"
            control there, and the screen it would open is the trust page the
            resident pressed Open on a second ago — which the close control
            already goes back to.
          */
        />

        {/* Set by the creation through app.setTitle. Rendered as a text node. */}
        {liveTitle && <div className="live-title">{liveTitle}</div>}

        <CreationFrame
          guestOrigin={creation.origin}
          manifest={creation.manifest}
          slug={creation.slug}
          user={actingUser}
          town={town}
          onTitleChange={setLiveTitle}
          onIncident={(kind, detail) => console.warn('creation incident', kind, detail)}
        />

        <div className="footer-chrome">
          <span>running on Town Square</span>
          <button onClick={() => setReporting((open) => !open)}>Report</button>
        </div>

        {/*
          Rendered under the chrome, outside the frame. A creation cannot draw
          here, so a resident reporting one is always talking to Town Square and
          never to the thing they are reporting.
        */}
        {reporting && (
          <ReportPanel
            slug={creation.slug}
            name={creation.name}
            version={creation.manifest.version}
            account={actingUser}
            onClose={() => setReporting(false)}
          />
        )}
      </div>
    )
  }
}

/** Where each back control lands, said in the words on the nav. */
const BACK_LABEL: Record<BackDestination, string> = {
  today: 'Today',
  nearby: 'Nearby',
  creations: 'Creations',
  yours: 'Yours',
}
