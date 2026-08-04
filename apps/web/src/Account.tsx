/**
 * Signing in, and what a resident sees about themselves.
 *
 * Two things this screen is careful about.
 *
 * **It never claims an email is or is not registered.** One form, one answer:
 * check your email. That is the API's behaviour and the copy has to match it,
 * or the copy becomes the oracle the API refused to be.
 *
 * **It explains what verification is for before asking for it.** Being vouched
 * for is a social favour, and a screen that demands one without saying why
 * reads as a gate rather than an introduction. Reading needs nothing.
 * Building needs an email. Only publishing code that runs in a neighbour's
 * browser needs a neighbour to say they know you.
 */

import { useState } from 'react'
import {
  isError,
  revokeVouch,
  signIn,
  signOut,
  signUp,
  vouchFor,
  type AccountView,
} from './session.js'

export interface AccountScreenProps {
  account: AccountView | null
  onAccountChange(account: AccountView | null): void
  onBack(): void
}

export function AccountScreen(props: AccountScreenProps) {
  return props.account ? <SignedIn {...props} account={props.account} /> : <SignedOut {...props} />
}

function SignedOut(props: AccountScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<{ devLink?: string } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setProblem(null)

    const result = mode === 'signup' ? await signUp(email, handle) : await signIn(email)
    setBusy(false)

    if (isError(result)) {
      setProblem(result.message)
      return
    }
    setSent({ ...(result.devLink === undefined ? {} : { devLink: result.devLink }) })
  }

  if (sent) {
    return (
      <div className="shell">
        <button className="back" onClick={props.onBack}>
          ← Back
        </button>
        <h1>Check your email</h1>
        <p className="lede">
          If there is an account for {email}, a sign-in link is on its way. It works once and
          expires in twenty minutes.
        </p>
        {sent.devLink && (
          <div className="dev-note">
            <div className="eyebrow">Development only</div>
            <a href={sent.devLink}>{sent.devLink}</a>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="shell">
      <button className="back" onClick={props.onBack}>
        ← Back
      </button>

      <h1>{mode === 'signup' ? 'Join the town square' : 'Sign in'}</h1>
      <p className="lede">
        No password. We email you a link. Reading the town square never needs an account at all —
        this is for building something and for being vouched for.
      </p>

      <form className="form" onSubmit={submit}>
        {mode === 'signup' && (
          <label>
            <span>Handle</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="what the town sees"
              autoComplete="username"
              required
            />
            <small>Public and pseudonymous. Your real name is never stored.</small>
          </label>
        )}

        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <small>Private. Used to sign in, and to reach you about a report.</small>
        </label>

        {problem && <p className="problem">{problem}</p>}

        <div className="form-actions">
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Email me a link'}
          </button>
          <button
            className="back"
            type="button"
            onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
          >
            {mode === 'signup' ? 'I already have an account' : 'I need an account'}
          </button>
        </div>
      </form>
    </div>
  )
}

function SignedIn(props: AccountScreenProps & { account: AccountView }) {
  const { account } = props
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  async function vouch(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    setNote(null)

    const result = await vouchFor(handle)
    setBusy(false)

    if (isError(result)) {
      setProblem(result.message)
      return
    }
    props.onAccountChange(result.account)
    setNote(`${result.vouchee?.handle} is a verified resident now.`)
    setHandle('')
  }

  async function withdraw() {
    const target = window.prompt('Withdraw your vouch for which handle?')
    if (!target) return

    const result = await revokeVouch(target)
    if (isError(result)) {
      setProblem(result.message)
      return
    }
    props.onAccountChange(result.account)
    // Said plainly, because the surprising part is what does *not* happen.
    setNote(
      `Vouch for ${result.revoked} withdrawn. They stay verified — a moderator reviews the branch.`,
    )
  }

  return (
    <div className="shell">
      <button className="back" onClick={props.onBack}>
        ← Back
      </button>

      <div className="eyebrow">Signed in as</div>
      <h1 style={{ marginTop: 4 }}>{account.handle}</h1>

      <ul className="trust">
        <li data-weight={account.verified ? 'ordinary' : 'consequential'}>
          <div className="trust-title">
            {account.verified ? 'Verified resident' : 'Not verified yet'}
          </div>
          <div className="trust-detail">
            {account.verified
              ? `Verified by ${account.verifiedMethod === 'vouch' ? 'a neighbour vouching for you' : 'an admin'}. You can publish creations, report things, and vouch for other people.`
              : 'You can build, validate and preview a creation right now. Publishing one — code that runs in every resident’s browser — needs a verified resident to vouch for you first.'}
          </div>
        </li>
        <li>
          <div className="trust-title">Email confirmed</div>
          <div className="trust-detail">
            {account.emailConfirmed
              ? 'Enough to build, preview, and list a link.'
              : 'Confirm your email to start building.'}
          </div>
        </li>
      </ul>

      {account.verified && (
        <>
          <div className="eyebrow" style={{ marginTop: 28 }}>
            Vouching
          </div>
          <p className="lede">
            You have {account.vouches.available} of {account.vouches.budget} vouches left. They come
            back {account.vouches.windowDays} days after you spend them. Vouch for people you
            actually know — a chain is admin-visible, so a bad one is traceable back to you.
          </p>

          <form className="form" onSubmit={vouch}>
            <label>
              <span>Their handle</span>
              <input value={handle} onChange={(e) => setHandle(e.target.value)} required />
            </label>
            <div className="form-actions">
              <button
                className="primary"
                type="submit"
                disabled={busy || account.vouches.available === 0}
              >
                {busy ? 'Vouching…' : 'Vouch for them'}
              </button>
              <button className="back" type="button" onClick={withdraw}>
                Withdraw a vouch
              </button>
            </div>
          </form>
        </>
      )}

      {note && <p className="note">{note}</p>}
      {problem && <p className="problem">{problem}</p>}

      <div className="form-actions" style={{ marginTop: 32 }}>
        <button
          className="secondary"
          onClick={async () => {
            await signOut()
            props.onAccountChange(null)
          }}
        >
          Sign out
        </button>
        <button
          className="back"
          onClick={async () => {
            await signOut(true)
            props.onAccountChange(null)
          }}
        >
          Sign out everywhere
        </button>
      </div>
    </div>
  )
}
