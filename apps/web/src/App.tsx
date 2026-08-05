/**
 * The shell: a gallery, a trust page, and a running creation.
 *
 * Three screens, matching `design/hifi` sections 6a, 6b and 6d. The trust page
 * is not a formality — it is the moment a resident decides, and it is generated
 * entirely from the frozen manifest by `describeManifest`, so a creation cannot
 * write its own.
 */

import { useEffect, useMemo, useState } from 'react'
import { describeManifest } from '@townsquare/host'
import { AccountScreen } from './Account.js'
import { ReportPanel } from './ReportPanel.js'
import { ReviewScreen } from './Review.js'
import { resolveInitialAccount, type AccountView } from './session.js'
import { CreationFrame } from './CreationFrame.js'
import { fetchCreations, fetchTown, type CreationSummary } from './townData.js'

type Screen =
  | { name: 'gallery' }
  | { name: 'account' }
  | { name: 'review' }
  | { name: 'trust'; creation: CreationSummary }
  | { name: 'running'; creation: CreationSummary }

export function App() {
  const [creations, setCreations] = useState<CreationSummary[] | null>(null)
  const [town, setTown] = useState({ id: '', name: 'Town Square', timezone: 'America/Chicago' })
  const [screen, setScreen] = useState<Screen>({ name: 'gallery' })
  const [liveTitle, setLiveTitle] = useState<string | null>(null)
  const [account, setAccount] = useState<AccountView | null>(null)
  const [reporting, setReporting] = useState(false)

  useEffect(() => {
    void fetchCreations().then(setCreations)
    void fetchTown().then(setTown)

    // A confirmation link lands on the gallery with the token in the query.
    // It is redeemed on the way in and the resident carries on where they were
    // going: an interstitial "you are signed in" page would be a click that
    // tells them what the header already says.
    void resolveInitialAccount().then(setAccount)
  }, [])

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

  if (screen.name === 'review') {
    return <ReviewScreen onBack={() => setScreen({ name: 'gallery' })} />
  }

  if (screen.name === 'account') {
    return (
      <AccountScreen
        account={account}
        onAccountChange={setAccount}
        onBack={() => setScreen({ name: 'gallery' })}
      />
    )
  }

  if (screen.name === 'gallery') {
    return (
      <div className="shell">
        {header}
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
                <button className="card" onClick={() => setScreen({ name: 'trust', creation })}>
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
    const { creation } = screen
    const lines = describeManifest(creation.manifest)

    return (
      <div className="shell">
        <button className="back" onClick={() => setScreen({ name: 'gallery' })}>
          ← Back
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

        <button className="primary" onClick={() => setScreen({ name: 'running', creation })}>
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
            setScreen({ name: 'trust', creation })
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
