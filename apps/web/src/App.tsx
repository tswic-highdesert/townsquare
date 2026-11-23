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
import { AppBar, SKIP_TARGET } from './AppBar.js'
import { ReviewScreen } from './Review.js'
import { resolveInitialAccount, type AccountView } from './session.js'
import { ContributeScreen } from './contribute/Contribute.js'
import {
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
import { Weekend } from './Weekend.js'
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
import { msg, syncDocument, t, useLocale } from './i18n/index.js'

type Screen =
  | { name: 'today' }
  | { name: 'nearby'; id?: string; map?: boolean }
  | { name: 'weekend' }
  | { name: 'yours' }
  | { name: 'gallery' }
  | { name: 'account'; returnTo?: string }
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
  // The one subscriber. A language change re-renders the whole shell from here.
  const locale = useLocale()
  useEffect(syncDocument, [locale])
  const [creations, setCreations] = useState<CreationSummary[] | null>(null)
  const [town, setTown] = useState({ id: '', name: 'Town Square', timezone: 'America/Chicago' })
  const [screen, setScreenState] = useState<Screen>(() => readScreen([]))
  const setScreen = (next: Screen) => {
    if (next.name === 'account' && !next.returnTo && screen.name !== 'account') {
      next = { ...next, returnTo: screenPath(screen) }
    }
    const path = screenPath(next)
    if (path !== window.location.pathname + window.location.search) {
      window.history.pushState(null, '', path)
    }
    setScreenState(next)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  /*
    WCAG 2.4.2: every screen has its own page title, in the resident's language.
    And when a navigation unmounts the control that had focus, focus would fall
    back to <body> and a screen reader would be left at the top of nothing. It
    goes to the new screen's main content instead, the same place the skip link
    lands. Focus that is still somewhere real is left alone.
  */
  useEffect(() => {
    const part = 'creation' in screen ? screen.creation.name : t(SCREEN_TITLE[screen.name])
    document.title = screen.name === 'today' ? `Town Square · ${town.name}` : `${part} · Town Square`
  }, [screen, town.name, locale])
  useEffect(() => {
    if (document.activeElement && document.activeElement !== document.body) return
    const target = document.getElementById(SKIP_TARGET) ?? document.querySelector('h1')
    if (target instanceof HTMLElement) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
    }
  }, [screen])
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
  const [allSearchDocs, setAllSearchDocs] = useState<SearchDoc[]>([])

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
    const restore = () => {
      setSearchOpen(false)
      setScreenState(readScreen(creations ?? []))
    }
    // Creation metadata arriving must not close a search the resident just opened.
    // Only a direct creation URL needs rehydration when its manifest arrives.
    if (creations && window.location.pathname.startsWith('/creations/')) setScreenState(readScreen(creations))
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [creations])

  useEffect(() => {
    void fetchCreations().then(setCreations, () => setCreations([]))
    void fetchTown().then(setTown, () => undefined)

    // A cold API assembles the whole town on first request, so this can take a
    // few seconds. It is the only fetch on the critical path for the home
    // screen, which is why Today is one endpoint rather than six.
    void fetchToday().then(setToday, () => setTodayFailed(true))

    // A confirmation link lands on the gallery with the token in the query.
    // It is redeemed on the way in and the resident carries on where they were
    // going: an interstitial "you are signed in" page would be a click that
    // tells them what the header already says.
    void resolveInitialAccount().then(setAccount, () => setAccount(null))
  }, [])

  // The directory arrives on first search and never again. A failure leaves the
  // field working over everything else rather than breaking it.
  useEffect(() => {
    if (!searchOpen || places || placesLoading) return
    setPlacesLoading(true)
    void fetch('/api/search-index').then((response) => response.ok ? response.json() : []).then(setAllSearchDocs, () => undefined)
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
    let current = true
    void fetchYours().then((yours) => {
      if (!current) return
      setSaved(yours?.saves ?? [])
      setBuilt(yours?.built ?? [])
    }, () => undefined)
    return () => { current = false }
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
        allSearchDocs,
        places ? docsFromNearby(places) : [],
        today ? docsFromToday(today) : [],
        creations ? docsFromCreations(creations) : [],
      ),
    // `locale`: the docs carry translated words, so a language change rebuilds them.
    [places, today, creations, allSearchDocs, locale],
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
          onOpenItem={(doc) => {
            setSearchOpen(false)
            if (doc.kind === 'story') setScreen({ name: 'story', id: doc.id })
            if (doc.kind === 'event') setScreen({ name: 'event', id: doc.id })
            if (doc.kind === 'place') setScreen({ name: 'nearby', id: doc.id })
          }}
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
          onContribute={() => setScreen({ name: 'contribute', startOpen: true })}
          selectedId={screen.id}
          initialMap={screen.map}
          onMapChange={(map) => setScreen({ name: 'nearby', ...(map !== undefined ? { map } : {}) })}
          onSelectPlace={(id) => setScreen({ name: 'nearby', ...(id ? { id } : {}), ...(screen.map !== undefined ? { map: screen.map } : {}) })}
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
          onContribute={() => setScreen({ name: 'contribute', startOpen: false })}
          onOpenSaved={(save) => {
            if (save.kind === 'business') setScreen({ name: 'nearby', id: save.refId })
            else if (save.kind === 'story') setScreen({ name: 'story', id: save.refId })
            else if (save.kind === 'event') setScreen({ name: 'event', id: save.refId })
            else openBySlug(save.refId, 'yours')
          }}
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
            <p className="problem">{t('Today could not be loaded.')}</p>
            <button className="secondary" onClick={() => window.location.reload()}>
              {t('Try again')}
            </button>
          </div>
        )
      }
      if (!today) return <div className="today-state">{t('Loading today…')}</div>

      return (
        <Today
          today={today}
          account={account}
          canReview={canReview}
          onOpenCreation={openBySlug}
          onBrowseCreations={() => setScreen({ name: 'gallery' })}
          onOpenNews={() => setScreen({ name: 'news' })}
          onOpenEvents={() => setScreen({ name: 'events' })}
          onOpenStory={(id) => setScreen({ name: 'story', id })}
          onOpenEvent={(id) => setScreen({ name: 'event', id })}
          onOpenPlace={(id) => setScreen({ name: 'nearby', id })}
          onOpenMap={() => setScreen({ name: 'nearby', map: true })}
          onOpenPlan={() => setScreen({ name: 'weekend' })}
          onContribute={() => setScreen({ name: 'contribute', startOpen: true })}
          onTab={goToTab}
          onAccount={() => setScreen({ name: 'account' })}
          onReview={() => setScreen({ name: 'review' })}
        />
      )
    }

    if (screen.name === 'weekend') {
      return <Weekend account={account} saved={saved} onSavedChange={setSaved}
        onBack={() => setScreen({ name: 'today' })} onAccount={() => setScreen({ name: 'account' })}
        onEvent={(id) => setScreen({ name: 'event', id })} onPlace={(id) => setScreen({ name: 'nearby', id })} />
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
          onDayChange={(day) => setScreen({ name: 'events', day })}
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
          onSignIn={() => setScreen({ name: 'account' })}
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
          onAccountChange={(next) => {
            setAccount(next)
            if (next && screen.returnTo) setScreen(readScreen(creations ?? [], screen.returnTo))
          }}
          onBack={() => setScreen(readScreen(creations ?? [], screen.returnTo ?? '/'))}
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
            label={t('Creations')}
            place={town.name}
            account={account}
            canReview={canReview}
            onAccount={() => setScreen({ name: 'account' })}
            onReview={() => setScreen({ name: 'review' })}
          />

          <Gallery
            onOpenPlan={() => setScreen({ name: 'weekend' })}
            onOpenMap={() => setScreen({ name: 'nearby', map: true })}
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
        <main className="shell cr-screen">
          <button className="secondary" onClick={() => setScreen({ name: 'gallery' })}>{t('Back to creations')}</button>
          <h1>{t('What would make town better?')}</h1>
          <p className="cr-lede">{t('A guide to your favorite trail. A way to find a local table. A little tool that helps a neighbor.')}</p>
          <p>{t('The starter example shows how a small app can use the public directory while keeping resident information private.')}</p>
          <p>{t('Publishing new creations is not open in this preview yet. You can contribute now by helping correct a place listing.')}</p>
          <button className="primary" onClick={() => setScreen({ name: 'contribute', startOpen: true })}>{t('Suggest a correction')}</button>
        </main>
      )
    }

    if (screen.name === 'trust') {
      const { creation, from } = screen
      return (
        <TrustScreen
          creation={creation}
          /* The label names where the control goes, not the word "Back". */
          backLabel={t(BACK_LABEL[from])}
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

/** The first half of each screen's page title. */
const SCREEN_TITLE: Record<Screen['name'], string> = {
  today: msg('Today'),
  nearby: msg('Directory'),
  weekend: msg('Make a day of it'),
  yours: msg('Yours'),
  gallery: msg('Creations'),
  account: msg('Account'),
  review: msg('Review queue'),
  news: msg('News'),
  story: msg('News'),
  contribute: msg('Add to the town'),
  events: msg('Events'),
  event: msg('Events'),
  trust: msg('Creations'),
  detail: msg('Creations'),
  running: msg('Creations'),
  builder: msg('Build on Town Square'),
}

/** Where each back control lands, said in the words on the nav. */
const BACK_LABEL: Record<BackDestination, string> = {
  today: msg('Today'),
  nearby: msg('Nearby'),
  creations: msg('Creations'),
  yours: msg('Yours'),
}

/** Every resident destination has a shareable URL and survives refresh. */
function screenPath(screen: Screen): string {
  switch (screen.name) {
    case 'today': return '/'
    case 'nearby': return `/places${screen.id ? `/${encodeURIComponent(screen.id)}` : ''}${screen.map === true ? '?view=map' : screen.map === false ? '?view=list' : ''}`
    case 'yours': return '/saved'
    case 'gallery': return '/creations'
    case 'story': return `/news/${encodeURIComponent(screen.id)}`
    case 'event': return `/events/${encodeURIComponent(screen.id)}${screen.from ? `?from=${encodeURIComponent(screen.from)}` : ''}`
    case 'events': return `/events${screen.day ? `?day=${encodeURIComponent(screen.day)}` : ''}`
    case 'contribute': return `/contribute${screen.startOpen ? '?new=1' : ''}`
    case 'account': return `/account${screen.returnTo ? `?next=${encodeURIComponent(screen.returnTo)}` : ''}`
    case 'trust': return `/creations/${encodeURIComponent(screen.creation.slug)}`
    case 'detail': return `/creations/${encodeURIComponent(screen.creation.slug)}/about`
    case 'running': return `/creations/${encodeURIComponent(screen.creation.slug)}/open`
    default: return `/${screen.name}`
  }
}

function readScreen(creations: CreationSummary[], path = window.location.href): Screen {
  const url = new URL(path, window.location.origin)
  let segments: string[]
  try { segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent) }
  catch { return { name: 'today' } }
  const [section, id, action] = segments
  if (section === 'places') return { name: 'nearby', ...(id ? { id } : {}), ...(url.searchParams.get('view') === 'map' ? { map: true } : url.searchParams.get('view') === 'list' ? { map: false } : {}) }
  if (section === 'weekend') return { name: 'weekend' }
  if (section === 'saved') return { name: 'yours' }
  if (section === 'news') return id ? { name: 'story', id } : { name: 'news' }
  if (section === 'events') {
    if (id) return { name: 'event', id, ...(url.searchParams.get('from') ? { from: url.searchParams.get('from')! } : {}) }
    const day = url.searchParams.get('day')
    return { name: 'events', ...(day ? { day } : {}) }
  }
  if (section === 'contribute') return { name: 'contribute', startOpen: url.searchParams.has('new') }
  if (section === 'account') {
    const next = url.searchParams.get('next')
    return { name: 'account', ...(next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/account') ? { returnTo: next } : {}) }
  }
  if (section === 'review' || section === 'builder') return { name: section }
  if (section === 'creations') {
    const creation = creations.find((item) => item.slug === id)
    if (!creation) return { name: 'gallery' }
    return { name: action === 'open' ? 'running' : action === 'about' ? 'detail' : 'trust', creation, from: 'creations' }
  }
  return { name: 'today' }
}
