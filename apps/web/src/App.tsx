/**
 * The shell: three tabs, a gallery, a trust page, and a running creation.
 *
 * Today (`design/hifi` 4a) is home. Nearby and Yours (5a, 5b) sit beside it in
 * the tab bar, and the gallery sits behind Today as the full list of creations.
 * The other three screens match sections 6a, 6b and 6d. The trust page is not a
 * formality — it is the moment a resident decides, and it is generated entirely
 * from the frozen manifest by `describeManifest`, so a creation cannot write
 * its own.
 */

import { useEffect, useMemo, useState } from 'react'
import { describeManifest } from '@townsquare/host'
import { AccountScreen } from './Account.js'
import { ReportPanel } from './ReportPanel.js'
import { ReviewScreen } from './Review.js'
import { resolveInitialAccount, type AccountView } from './session.js'
import { CreationFrame } from './CreationFrame.js'
import { Nearby } from './Nearby.js'
import { Today } from './Today.js'
import { Yours } from './Yours.js'
import type { TabName } from './TabBar.js'
import { fetchYours, type BuiltCreation, type SavedThing } from './savesData.js'
import { fetchToday, type TodayPayload } from './todayData.js'
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
  | { name: 'trust'; creation: CreationSummary; from: BackTo }
  | { name: 'running'; creation: CreationSummary; from: BackTo }

/** Where the back button lands. Today, the gallery, or the tab you came from. */
type BackTo = 'today' | 'gallery' | 'yours'

/**
 * The screens that are only a name, keyed by that name.
 *
 * A table rather than a cast. `setScreen({ name: someUnion })` does not
 * typecheck against a union of single-member objects, and the two ways past
 * that are a lookup or an assertion — one of which stays correct if a screen
 * later grows a field.
 */
const SCREENS = {
  today: { name: 'today' },
  nearby: { name: 'nearby' },
  yours: { name: 'yours' },
  gallery: { name: 'gallery' },
} as const satisfies Record<TabName | 'gallery', Screen>

export function App() {
  const [creations, setCreations] = useState<CreationSummary[] | null>(null)
  const [town, setTown] = useState({ id: '', name: 'Town Square', timezone: 'America/Chicago' })
  const [screen, setScreen] = useState<Screen>({ name: 'today' })
  const [liveTitle, setLiveTitle] = useState<string | null>(null)
  const [account, setAccount] = useState<AccountView | null>(null)
  const [reporting, setReporting] = useState(false)
  const [today, setToday] = useState<TodayPayload | null>(null)
  const [todayFailed, setTodayFailed] = useState(false)
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

  // Moderation is a role held by a committee, so the entry point is gated on
  // the role rather than on being anyone in particular. The API answers 404 to
  // everyone else, so this is a convenience, not the control.
  const canReview = account?.role === 'moderator' || account?.role === 'admin'

  const header = (
    <div className="account-bar">
      {canReview && (
        <button className="back" onClick={() => setScreen({ name: 'review' })}>
          Review queue
        </button>
      )}
      <button className="back" onClick={() => setScreen({ name: 'account' })}>
        {account ? `${account.handle}${account.verified ? ' · verified' : ''}` : 'Sign in'}
      </button>
    </div>
  )

  /** Opening from a tab, which knows a slug and nothing else. */
  const openBySlug = (slug: string, from: BackTo = 'today') => {
    const creation = creations?.find((c) => c.slug === slug)
    // The trust page, never straight into the creation. Today is a list of
    // things neighbours built; it is not a shortcut past the screen where a
    // resident reads what one of them is allowed to touch.
    if (creation) setScreen({ name: 'trust', creation, from })
  }

  const goToTab = (tab: TabName) => setScreen(SCREENS[tab])

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
    return (
      <div className="shell">
        {header}
        <button className="back" onClick={() => setScreen({ name: 'today' })}>
          ← Today
        </button>
        <div className="eyebrow">{town.name}</div>
        <h1>Built by neighbors</h1>
        <p className="lede">
          Everything here was made by someone who lives in town, runs sandboxed on Town Square,
          and can only reach what it says it can.
        </p>

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
                  onClick={() => setScreen({ name: 'trust', creation, from: 'gallery' })}
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
    )
  }

  if (screen.name === 'trust') {
    const { creation, from } = screen
    const lines = describeManifest(creation.manifest)

    return (
      <div className="shell">
        <button className="back" onClick={() => setScreen(SCREENS[from])}>
          ← {from === 'gallery' ? 'Back' : from === 'today' ? 'Today' : 'Yours'}
        </button>

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

        <button className="primary" onClick={() => setScreen({ name: 'running', creation, from })}>
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
      */}
      <div className="chrome">
        <button
          className="back"
          onClick={() => {
            setLiveTitle(null)
            setReporting(false)
            setScreen({ name: 'trust', creation, from: screen.from })
          }}
        >
          ←
        </button>
        <img className="card-icon" style={{ width: 28, height: 28 }} src={`${creation.origin}/${creation.manifest.icon}`} alt="" />
        <span>
          <h1 className="chrome-title">{creation.name}</h1>
          <span className="chrome-by">by a neighbor</span>
        </span>
        <span className="badge">Sandboxed</span>
      </div>

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
