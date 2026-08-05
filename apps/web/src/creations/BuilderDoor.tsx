/**
 * The builder door. `design/hifi-v2/sections/07-builder`, specimens 1 to 3.
 *
 * Two audiences, one app, and this is the screen that keeps them apart: the
 * whole build layer sits behind one link, nothing in the tab bar points here,
 * and a resident who reads the paper and checks the weekend never meets a
 * token, a manifest, or the word MCP.
 *
 * What is on this page is the part that belongs in the *shell*. Minting a
 * connection token needs a session, and the MCP service has no cookie parser
 * and no session-reading route by design, so the mint lives on the API and its
 * only door is here. Everything else in section 07 — the code surfaces, the
 * validation results, the preview, the submission ladder, the SDK reference —
 * happens inside the builder's own AI tool over MCP, and drawing a picture of
 * it in the shell would be drawing a screen nobody uses.
 *
 * The tone is flat on purpose. The sentence this page wants to write is
 * "anyone in town can make an app", and it is not true today. What is true is
 * "anyone with an AI subscription and a computer", and a builder who finds out
 * about the gap after signing up is a builder who does not come back.
 */

import { useEffect, useState } from 'react'
import { Icon } from '../Icon.js'
import { Button, Card, TextInput } from '../ui/index.js'
import {
  fetchTokens,
  isError,
  mintConnectToken,
  revokeConnectToken,
  whenUsed,
  type ConnectToken,
  type MintedToken,
} from './connectApi.js'
import './creations.css'

/** The connect panel's anchor, so the hero can jump a long page to it. */
const CONNECT_ID = 'cr-connect'

export interface BuilderDoorProps {
  /** Null when signed out. Minting needs a session, so the page says so early. */
  account: { handle: string; verified: boolean } | null
  onBack: () => void
  onSignIn: () => void
  /** How many creations the town actually has. Omitted rather than guessed. */
  creationCount?: number
}

export function BuilderDoor(props: BuilderDoorProps) {
  return (
    <div className="shell cr-screen">
      <button className="cr-back" onClick={props.onBack}>
        <Icon name="arrow-left" size={16} /> Back
      </button>

      {/*
        The one dark surface in the build layer.

        Section 06 puts it on the featured creation and section 12's
        interstitial inverts for the same reason: dark means *this is the build
        layer*. There is no featured creation to carry it — nothing counts usage
        — so the weight lands here, on the screen that is genuinely the
        interruption, and it is reached by asking rather than sprung.
      */}
      <Card dark elevation="raised" className="cr-bd-hero">
        <div className="cr-eyebrow">Build on Town Square</div>
        <h1 className="cr-bd-hero-h">This town square runs on things somebody made.</h1>
        <p className="cr-bd-hero-lede">
          If you can describe an app, the AI tool you already use can build it, and Town Square can
          host it. A trail conditions board. A map of every camera anyone has spotted. A list of who
          still has a generator after an ice storm.
        </p>
        <Button
          variant="on-navy"
          icon="plug"
          onClick={() => document.getElementById(CONNECT_ID)?.scrollIntoView({ block: 'start' })}
        >
          Connect your AI tool
        </Button>
        {props.creationCount !== undefined && props.creationCount > 0 && (
          <p className="cr-bd-count">
            {props.creationCount} {props.creationCount === 1 ? 'creation is' : 'creations are'} live
            right now.
          </p>
        )}
      </Card>

      <Steps />
      <Prerequisite />
      <Connect account={props.account} onSignIn={props.onSignIn} />
    </div>
  )
}

/**
 * Three steps, and the third one is a person reading your code.
 *
 * No estimated durations. The design puts a time on each step, and every one of
 * them would be a promise about a committee that has not reviewed anything yet.
 * A build funnel that invents its own turnaround gets one enthusiastic resident
 * and never sees them again.
 */
function Steps() {
  return (
    <ol className="cr-bd-steps">
      <li>
        <span className="cr-step-n" aria-hidden="true">
          1
        </span>
        <div>
          <b>Connect</b>
          <span>
            Mint a token below and paste one line into your tool. It then knows the SDK, the
            manifest format, and this town's real data.
          </span>
        </div>
      </li>
      <li>
        <span className="cr-step-n" aria-hidden="true">
          2
        </span>
        <div>
          <b>Build and preview</b>
          <span>
            Describe what you want. Your tool writes it, checks it against the same validator the
            review queue runs, and puts it on a real sandbox address you can open on your phone.
          </span>
        </div>
      </li>
      <li>
        <span className="cr-step-n" aria-hidden="true">
          3
        </span>
        <div>
          <b>Submit for review</b>
          <span>
            A neighbour on the committee reads your source and your permissions, then approves it or
            tells you what to change. It takes as long as a person reading it takes. Updates get
            read too.
          </span>
        </div>
      </li>
    </ol>
  )
}

/** The one card on this page that is allowed to talk somebody out of it. */
function Prerequisite() {
  return (
    <div className="cr-bd-prereq">
      <div className="cr-bd-prereq-head">
        <Icon name="info" size={20} />
        <b>You will need an AI tool of your own</b>
      </div>
      <p>
        Town Square does not write apps for you. There is no chat box here. You bring a tool you
        already have, it does the writing, and the cost of that writing is yours rather than the
        town's. That is why this is free to host.
      </p>
      <ul className="cr-bd-prereq-list">
        <li>
          <Icon name="check" size={15} />
          <span>
            <b>Claude Code</b>, in a terminal. What this is built against, and the smoothest path.
          </span>
        </li>
        <li>
          <Icon name="check" size={15} />
          <span>
            <b>Anything else that speaks MCP.</b> Works, with a little more setup.
          </span>
        </li>
        <li>
          <Icon name="x-circle" size={15} />
          <span>
            <b>A phone alone</b> is not enough yet. You need a computer you can run a command on.
          </span>
        </li>
      </ul>
      <p className="cr-bd-prereq-tail">
        You do not need to know JavaScript. You do need to be willing to read what your tool wrote,
        because you are the one submitting it and your name goes on it.
      </p>
    </div>
  )
}

/* ── connect ────────────────────────────────────────────────────────────── */

function Connect({
  account,
  onSignIn,
}: {
  account: { handle: string; verified: boolean } | null
  onSignIn: () => void
}) {
  const [tokens, setTokens] = useState<ConnectToken[] | null>(null)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [minted, setMinted] = useState<MintedToken | null>(null)

  useEffect(() => {
    if (!account) {
      setTokens(null)
      return
    }
    void fetchTokens().then((list) => setTokens(list?.tokens ?? []), () => setTokens([]))
  }, [account?.handle])

  if (!account) {
    return (
      <div className="cr-bd-gate" id={CONNECT_ID}>
        <div className="cr-detail-h">Connect your AI tool</div>
        <p>
          A connection token is minted against your account, so this part needs you signed in. It is
          the same sign-in as the rest of Town Square.
        </p>
        <Button variant="primary" onClick={onSignIn}>
          Sign in
        </Button>
      </div>
    )
  }

  const active = (tokens ?? []).filter((t) => !t.revoked)

  async function mint() {
    setBusy(true)
    setProblem(null)
    const result = await mintConnectToken(label.trim() || 'my laptop')
    setBusy(false)
    if (isError(result)) {
      setProblem(result.message)
      return
    }
    setMinted(result)
    setLabel('')
    setTokens((prev) => [result.record, ...(prev ?? [])])
  }

  async function revoke(id: string) {
    const result = await revokeConnectToken(id)
    if (isError(result)) {
      setProblem(result.message)
      return
    }
    setTokens((prev) => (prev ?? []).map((t) => (t.id === id ? { ...t, revoked: true } : t)))
  }

  return (
    <>
      <div className="cr-detail-h" id={CONNECT_ID}>
        Connect your AI tool
      </div>

      {minted ? (
        <Minted minted={minted} onDone={() => setMinted(null)} />
      ) : (
        <div className="cr-bd-panel">
          <div className="cr-bd-panel-head">
            <Icon name="key" size={16} />
            <b>New connection</b>
          </div>

          {/*
            A label is the only field, because the scopes below are not yours to
            choose. `TextInput` carries the label/help/`aria-describedby` wiring
            that a hand-rolled version gets wrong about a third of the time.
          */}
          <TextInput
            label="What is this for"
            help="So you can tell two machines apart later. Only you see it."
            type="text"
            value={label}
            placeholder="MacBook, Claude Code"
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
          />

          {/*
            The scopes are stated and not chosen. A token that could do less
            would not be useful, and a token that could do more does not exist —
            in particular there is no token that publishes, only one that
            submits. The builder door is structurally incapable of approving its
            own work.
          */}
          <div className="cr-bd-scopes">
            <div className="cr-bd-scopes-head">What this token can do</div>
            <ul>
              <li>
                <Icon name="book" size={15} />
                <span>
                  <b>Read the SDK and templates.</b> Docs, examples, starting shapes.
                </span>
              </li>
              <li>
                <Icon name="database" size={15} />
                <span>
                  <b>Read the town's public data.</b> Events, notices, businesses. The same things
                  the website shows anyone.
                </span>
              </li>
              <li>
                <Icon name="package" size={15} />
                <span>
                  <b>Create and preview drafts you own.</b> Nobody else's drafts, ever.
                </span>
              </li>
              <li>
                <Icon name="send" size={15} />
                <span>
                  <b>Submit for review.</b> Submit, not publish. There is no token that skips the
                  committee.
                </span>
              </li>
            </ul>
            <p>
              These are fixed. They are not scopes you pick, because a builder choosing their own
              permissions is the thing the review queue exists to check.
            </p>
          </div>

          <Button variant="primary" full loading={busy} onClick={() => void mint()}>
            Mint token
          </Button>
        </div>
      )}

      {problem && (
        <p className="cr-report-problem" role="alert">
          <Icon name="alert-circle" size={14} /> {problem}
        </p>
      )}

      {tokens === null ? null : tokens.length === 0 ? (
        <p className="cr-footnote">No connections yet. Minting one is how this starts.</p>
      ) : (
        <>
          <div className="cr-detail-h">Your connections</div>
          <ul className="cr-bd-tokens">
            {tokens.map((token) => (
              <TokenRow key={token.id} token={token} onRevoke={() => void revoke(token.id)} />
            ))}
          </ul>
          <p className="cr-footnote">
            {active.length} of 10 active. A resident with ten tokens is a resident who has lost
            track of one.
          </p>
        </>
      )}
    </>
  )
}

/**
 * Shown once, and the page says why rather than only warning.
 *
 * "We keep a one-way hash" is a sentence a non-technical resident can follow to
 * the conclusion that matters: nobody at Town Square can read this, including
 * whoever answers when you lose it. The recovery path is deliberately cheap,
 * because a scary irreversible action with an expensive recovery is how people
 * end up pasting credentials into a notes app.
 */
function Minted({ minted, onDone }: { minted: MintedToken; onDone: () => void }) {
  return (
    <div className="cr-bd-panel" data-state="warn">
      <div className="cr-bd-panel-head" data-state="warn">
        <Icon name="eye" size={16} />
        <b>Copy this now</b>
      </div>

      <p className="cr-bd-once">
        <Icon name="warning" size={15} />
        <span>{minted.warning} Town Square keeps a one-way hash of it, so we genuinely cannot
        recover it, not even for you. Lose it and you mint another.</span>
      </p>

      <Copyable value={minted.token} label="the token" mono />
      <p className="cr-bd-note">
        The prefix on it is deliberate. Secret scanners know it, and so does the bundle checker, so
        if this ever lands in a file you publish, something catches it.
      </p>

      <div className="cr-bd-field-label">Paste this in your terminal</div>
      <Copyable value={minted.claude_code_command} label="the command" mono block />

      <Button variant="secondary" full onClick={onDone}>
        Done, I have copied it
      </Button>
    </div>
  )
}

/**
 * The confirmation is a state on the button, not a toast that floats away.
 *
 * A resident who looks back at the button two seconds later should still be
 * able to tell whether the copy worked, because the consequence of guessing
 * wrong is pasting nothing into a terminal and minting a second token.
 */
function Copyable({
  value,
  label,
  mono,
  block,
}: {
  value: string
  label: string
  mono?: boolean
  block?: boolean
}) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="cr-bd-copyable" data-block={block || undefined}>
      <code className={mono ? 'cr-bd-secret' : undefined}>{value}</code>
      <Button
        variant="secondary"
        size="sm"
        icon={copied ? 'check' : 'copy'}
        className="cr-bd-copy"
        data-copied={copied || undefined}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => setCopied(true),
            // Clipboard access can be refused. Saying so beats a button that
            // claims success and put nothing anywhere.
            () => setCopied(false),
          )
        }}
        aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

function TokenRow({ token, onRevoke }: { token: ConnectToken; onRevoke: () => void }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <li className="cr-bd-tok" data-state={token.revoked ? 'dead' : undefined}>
      <div className="cr-bd-tok-main">
        <div className="cr-bd-tok-label">{token.label}</div>
        {token.revoked ? (
          <div className="cr-bd-tok-when">
            <Icon name="x-circle" size={14} />
            {/* Kept on the list so you know it is dead, not missing. */}
            Revoked
          </div>
        ) : (
          <div className="cr-bd-tok-when">
            <span className="cr-bd-dot" data-live={token.last_used_at ? '' : undefined} aria-hidden="true" />
            {whenUsed(token.last_used_at)}
          </div>
        )}
      </div>

      {token.revoked ? null : confirming ? (
        <div className="cr-bd-tok-confirm">
          <p>
            <b>Revoke "{token.label}"?</b> Whatever is using it stops working on its very next call.
            Your drafts and anything you have published stay exactly where they are.
          </p>
          <div className="cr-bd-tok-confirm-acts">
            <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            {/*
              Destructive is an outlined terracotta, never brick: revoking a
              token is reversible in ten seconds by minting another, and
              spending the alarm register on it is how the alarm stops meaning
              anything.
            */}
            <Button variant="destructive" size="sm" onClick={onRevoke}>
              Yes, revoke it
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
          Revoke
        </Button>
      )}
    </li>
  )
}
