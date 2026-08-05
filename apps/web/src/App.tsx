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
import { AccountScreen } from './Account.js'
import { AppBar } from './AppBar.js'
import { ReviewScreen } from './Review.js'
import { resolveInitialAccount, type AccountView } from './session.js'
import { ContributeScreen } from './contribute/Contribute.js'
import {
  BuilderDoor,
  CreationDetail,
  Gallery,
  RunningCreation,
  TrustScreen,
} from './creations/index.js'
import { Directory } from './directory/Directory.js'
import { EventDetailScreen } from './events/EventDetail.js'
import { EventsScreen } from './events/Events.js'
import { News, Reader } from './news/index.js'
import { Today } from './Today.js'
import { Yours } from './Yours.js'
import { TabBar, type TabName } from './TabBar.js'
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
   * News, and one story. Reached from the head of "More from town" on Today,
   * and deliberately not from the nav: four destinations is the resident path,
   * and a fifth for a thing Today already summarises would be a navigation
   * that describes our filing system rather than the town.
   */
  | { name: 'news' }
  | { name: 'story'; id: string }
  /**
   * Adding something to the town. `startOpen` lands on the chooser rather than
   * on the list of what you have already filed, which is what the resident who
   * arrived from an empty search result is asking for.
   */
  | { name: 'contribute'; startOpen: boolean }
  /**
   * The calendar, and one event. Reached from the head of "Happening today",
   * the same way news is reached from "More from town": the door to more of a
   * thing is in the section that already showed you some of it.
   *
   * `day` survives a round trip into an event and back out, so a resident who
   * opened Saturday, read one thing and pressed back lands on Saturday rather
   * than on today.
   */
  | { name: 'events'; day?: string }
  | { name: 'event'; id: string; from?: string }
  /**
   * `from` is carried rather than assumed. A trust page is reachable from Today
   * and from the gallery, and a back button that always lands on the gallery
   * silently moves a resident somewhere they were not.
   */
  | { name: 'trust'; creation: CreationSummary; from: BackDestination }
  /** The fuller page about one creation, behind the trust page rather than in front of it. */
  | { name: 'detail'; creation: CreationSummary; from: BackDestination }
  | { name: 'running'; creation: CreationSummary; from: BackDestination }
  /**
   * The build layer's front door. Reached by asking, never sprung: there is no
   * route to it from anywhere a resident lands by accident.
   */
  | { name: 'builder' }

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
          /*
            The dead end becomes an invitation. The person who just searched
            for the missing thing is the best-qualified person in town to add
            it, and this is the one moment they are demonstrably thinking
            about it.
          */
          onAddSomething={() => {
            setSearchOpen(false)
            setScreen({ name: 'contribute', startOpen: true })
          }}
        />
      </div>
    </ShellContext.Provider>
  )

  function renderScreen() {
    if (screen.name === 'nearby') {
      /*
        The Nearby tab lands on the directory. `Directory` renders
        `TabBar current="nearby"` itself and takes exactly the prop set Nearby
        took, which is a component telling you which slot it belongs in — it is
        a discovery surface for the same 741 places, ordered from "show me
        something" down to "I know what I want" rather than from a map.
      */
      return (
        <Directory
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
          onOpenNews={() => setScreen({ name: 'news' })}
          onOpenEvents={() => setScreen({ name: 'events' })}
          onTab={goToTab}
          onAccount={() => setScreen({ name: 'account' })}
          onReview={() => setScreen({ name: 'review' })}
        />
      )
    }

    if (screen.name === 'news') {
      return (
        <News
          account={account}
          canReview={canReview}
          onBack={() => setScreen({ name: 'today' })}
          onOpenStory={(id) => setScreen({ name: 'story', id })}
          onAccount={() => setScreen({ name: 'account' })}
          onReview={() => setScreen({ name: 'review' })}
        />
      )
    }

    if (screen.name === 'story') {
      return (
        <Reader
          storyId={screen.id}
          /*
            The reader and Yours read the same list, so they cannot disagree
            about what is saved. `App` already held it for Nearby and Yours;
            this is a third door onto the same state, not a fourth copy.
          */
          account={account}
          onSignIn={() => setScreen({ name: 'account' })}
          saved={saved}
          onSavedChange={setSaved}
          /*
            Back to the news screen, not to Today. A resident who opened this
            from a list is going back to that list; sending them to the home
            screen is the app deciding it knows better than their own history.
          */
          onBack={() => setScreen({ name: 'news' })}
          onOpenStory={(id) => setScreen({ name: 'story', id })}
        />
      )
    }

    if (screen.name === 'events') {
      return (
        <EventsScreen
          account={account}
          canReview={canReview}
          {...(screen.day ? { day: screen.day } : {})}
          onOpenEvent={(id) => setScreen({ name: 'event', id, ...(screen.day ? { from: screen.day } : {}) })}
          onBack={() => setScreen({ name: 'today' })}
          onAccount={() => setScreen({ name: 'account' })}
          onReview={() => setScreen({ name: 'review' })}
        />
      )
    }

    if (screen.name === 'event') {
      return (
        <EventDetailScreen
          id={screen.id}
          account={account}
          saved={saved}
          onSavedChange={setSaved}
          /* Back to the day you came from, not to today. */
          onBack={() => setScreen({ name: 'events', ...(screen.from ? { day: screen.from } : {}) })}
          onOpenEvent={(id) => setScreen({ name: 'event', id, ...(screen.from ? { from: screen.from } : {}) })}
          onOpenDay={(day) => setScreen({ name: 'events', day })}
        />
      )
    }

    if (screen.name === 'contribute') {
      return (
        <ContributeScreen
          onBack={() => setScreen({ name: 'today' })}
          startOpen={screen.startOpen}
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
        A destination, so it wears what the other destinations wear: the same
        bar, the same nav, and no back control. `onBack` is deliberately not
        passed: the nav underneath already highlights Creations and every other
        destination is one tap away, so a "back to Today" here would offer a
        way out of a place nobody travelled into.
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

          <Gallery
            creations={creations}
            townName={town.name}
            onOpen={(creation) => setScreen({ name: 'trust', creation, from: 'creations' })}
            onHowItWorks={() => setScreen({ name: 'builder' })}
          />

          <TabBar current="creations" onChange={goToTab} />
        </div>
      )
    }

    if (screen.name === 'builder') {
      return (
        <BuilderDoor
          account={actingUser}
          onBack={() => setScreen({ name: 'gallery' })}
          onSignIn={() => setScreen({ name: 'account' })}
          /*
            Omitted rather than guessed while the catalogue is in flight. A
            count that starts at zero and jumps is a number the page was not
            entitled to yet.
          */
          {...(creations ? { creationCount: creations.length } : {})}
        />
      )
    }

    if (screen.name === 'trust') {
      const { creation, from } = screen
      return (
        <TrustScreen
          creation={creation}
          /* The label names where the control goes, not the word "Back". */
          backLabel={BACK_LABEL[from]}
          onBack={() => setScreen(SCREENS[from])}
          onOpen={() => setScreen({ name: 'running', creation, from })}
          onDetail={() => setScreen({ name: 'detail', creation, from })}
        />
      )
    }

    if (screen.name === 'detail') {
      const { creation, from } = screen
      return (
        <CreationDetail
          creation={creation}
          /*
            Back to the trust page, not to the gallery. Detail sits behind the
            decision screen, so leaving it returns the resident to the decision
            they were in the middle of making.
          */
          onBack={() => setScreen({ name: 'trust', creation, from })}
          onOpen={() => setScreen({ name: 'running', creation, from })}
        />
      )
    }

    const { creation, from } = screen
    return (
      <RunningCreation
        creation={creation}
        town={town}
        user={actingUser}
        /* Back to the trust page they came through. */
        onBack={() => setScreen({ name: 'trust', creation, from })}
        /* All the way out, offered when the creation misbehaved. */
        onLeave={() => setScreen(SCREENS[from])}
      />
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
