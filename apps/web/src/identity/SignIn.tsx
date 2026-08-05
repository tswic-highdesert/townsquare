/**
 * Signing in: one form, one answer.
 *
 * The API refuses to say whether an address is registered — `signUp` on a known
 * email quietly becomes a sign-in link, and `requestSignIn` on an unknown one
 * returns `sent: true` and mails nothing. The copy here has to hold that line
 * too, or the screen becomes the oracle the service declined to be. So there is
 * no "no account found", no "already registered", and the confirmation sentence
 * is conditional on purpose: *if* there is an account for this address.
 *
 * Four states, and each of them exists because the alternative is worse:
 *
 *   **request** — the form. Two fields is the whole account, and it says so.
 *   **sent** — what happens next, with a resend that is deliberately slow.
 *   **returning** — a handle and a masked address this device kept, so a person
 *     coming back does not have to remember which of their addresses they used.
 *   **dead link** — said out loud. A link that sat in an inbox overnight
 *     dropping someone on an empty form reads as "it forgot me".
 *
 * Handle availability is the one thing this screen cannot resolve in the field.
 * There is no endpoint to ask, so the server answers on submit and the answer
 * lands on the handle field rather than at the foot of the form, which is the
 * nearest honest thing to the design.
 */

import { useEffect, useState } from 'react'
import { Button, InlineError, TextInput } from '../ui/index.js'
import { Icon } from '../Icon.js'
import {
  clearDeadLink,
  isError,
  maskEmail,
  rememberedDevice,
  signIn,
  signInLinkWasDead,
  signUp,
} from '../session.js'
import './identity.css'

export interface SignInProps {
  onBack(): void
}

/**
 * How long the resend button stays down.
 *
 * A UI pace, not a server rule — the API allows five links an hour per account.
 * The pause is here because the common reason someone presses it is that mail
 * has not arrived yet, and a second link invalidates the first one they are
 * about to receive.
 */
const RESEND_SECONDS = 45

type Mode = 'signin' | 'signup'

export function SignIn(props: SignInProps) {
  const [device] = useState(rememberedDevice)
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<{ email: string; remembered: boolean; devLink?: string } | null>(
    null,
  )
  /** Kept apart so the server's handle message lands on the handle field. */
  const [problem, setProblem] = useState<string | null>(null)
  const [handleProblem, setHandleProblem] = useState<string | null>(null)
  const [deadLink, setDeadLink] = useState(signInLinkWasDead)

  async function send(useEmail: string, remembered = false) {
    setBusy(true)
    setProblem(null)
    setHandleProblem(null)
    setDeadLink(false)
    clearDeadLink()

    const result = mode === 'signup' ? await signUp(useEmail, handle) : await signIn(useEmail)
    setBusy(false)

    if (isError(result)) {
      // `handle_taken` and a malformed handle are both about the field above,
      // and a message under the buttons about a field two rows up is a message
      // people re-read three times.
      if (result.error === 'handle_taken' || /handle/i.test(result.message)) {
        setHandleProblem(result.message)
      } else {
        setProblem(result.message)
      }
      return
    }
    setSent({
      email: useEmail,
      remembered,
      ...(result.devLink === undefined ? {} : { devLink: result.devLink }),
    })
  }

  if (sent) {
    return (
      <Sent
        email={sent.email}
        remembered={sent.remembered}
        {...(sent.devLink === undefined ? {} : { devLink: sent.devLink })}
        onResend={() => void send(sent.email, sent.remembered)}
        onWrongAddress={() => setSent(null)}
      />
    )
  }

  /*
    The returning screen is a shortcut, never a lock. "Not you" is a real
    button and it is next to the primary one: a household sharing a laptop is
    the ordinary case in a town, not an edge case.
  */
  if (device && mode === 'signin') {
    return (
      <div className="id-screen">
        <BackLink onBack={props.onBack} />
        {deadLink && <DeadLinkNote />}
        <p className="id-eyebrow">Welcome back</p>
        <h1 className="id-h1">{device.handle}</h1>
        <p className="id-lede">
          This device remembers your handle and the address you signed in with, and nothing else.
          Same link, same twenty minutes.
        </p>
        {problem && <InlineError>{problem}</InlineError>}
        <div className="id-actions">
          <Button
            variant="primary"
            size="lg"
            icon="mail"
            full
            loading={busy}
            onClick={() => void send(device.email, true)}
          >
            Send the link to {maskEmail(device.email)}
          </Button>
          <Button variant="quiet" full onClick={() => setMode('signup')}>
            Not you? Use another email
          </Button>
        </div>
        <p className="id-fine">
          <Icon name="eye-off" size={14} />
          Signing out everywhere clears both.
        </p>
      </div>
    )
  }

  return (
    <div className="id-screen">
      <BackLink onBack={props.onBack} />
      {deadLink && <DeadLinkNote />}

      <h1 className="id-h1">{mode === 'signup' ? 'Join the town square' : 'Sign in'}</h1>
      <p className="id-lede">
        No password. We email you a link. Reading the town square never needs an account at all,
        this is for building something and for being vouched for.
      </p>

      <form
        className="id-form"
        onSubmit={(e) => {
          e.preventDefault()
          void send(email)
        }}
      >
        {mode === 'signup' && (
          <TextInput
            label="Handle"
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value)
              setHandleProblem(null)
            }}
            placeholder="what the town sees"
            autoComplete="username"
            required
            {...(handleProblem ? { error: handleProblem } : {})}
            help="3 to 24 characters. Letters, numbers, and . _ - only. Not case sensitive."
          />
        )}

        <TextInput
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          help="Private. Used to sign in, and to reach you about a report."
        />

        {problem && <InlineError>{problem}</InlineError>}

        <div className="id-actions">
          <Button variant="primary" size="lg" icon="mail" full loading={busy} type="submit">
            Email me a link
          </Button>
          <Button
            variant="quiet"
            full
            onClick={() => {
              setMode(mode === 'signup' ? 'signin' : 'signup')
              setProblem(null)
              setHandleProblem(null)
            }}
          >
            {mode === 'signup' ? 'I already have an account' : 'I need an account'}
          </Button>
        </div>
      </form>

      <p className="id-fine">
        <Icon name="lock" size={14} />
        {mode === 'signup'
          ? 'Two fields is the whole account. No name, no address, no phone.'
          : 'We never say whether an address is registered. Anyone could type yours in here.'}
      </p>
    </div>
  )
}

/**
 * `remembered` is why this screen does not simply print the address.
 *
 * The returning screen masks what the device remembers, deliberately: a shared
 * household laptop keeps the last resident's address in `localStorage` through
 * a sign out, and only *sign out everywhere* clears it. Echoing it in full one
 * click later undoes the mask for exactly the visitor it was hiding it from.
 *
 * A person who just typed their address already knows it, so masking there
 * would be noise pretending to be caution. The distinction is who supplied the
 * value, not who is looking at the screen.
 */
function Sent(props: {
  email: string
  remembered: boolean
  devLink?: string
  onResend(): void
  onWrongAddress(): void
}) {
  const [left, setLeft] = useState(RESEND_SECONDS)

  useEffect(() => {
    if (left <= 0) return
    const timer = window.setTimeout(() => setLeft(left - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [left])

  return (
    <div className="id-screen">
      <div className="id-mark">
        <Icon name="send" size={22} />
      </div>
      <h1 className="id-h1">Check your email</h1>
      <p className="id-lede">
        If there is an account for{' '}
        {props.email ? (props.remembered ? maskEmail(props.email) : props.email) : 'that address'}, a
        sign-in link is on its way. It
        works once and expires in twenty minutes.
      </p>
      <p className="id-note">
        We do not say whether that address is registered. Anyone could type your email in here, and
        an answer either way would tell them something about you.
      </p>

      {/*
        Only ever rendered against a development API, which refuses to echo the
        link the moment the shell origin is https. It is styled as the
        temporary thing it is rather than as part of the product.
      */}
      {props.devLink && (
        <div className="id-devlink">
          <div className="id-eyebrow">Development only</div>
          <a href={props.devLink}>{props.devLink}</a>
        </div>
      )}

      <div className="id-actions">
        <Button
          variant="secondary"
          icon="refresh"
          full
          disabled={left > 0}
          onClick={() => {
            setLeft(RESEND_SECONDS)
            props.onResend()
          }}
        >
          {left > 0 ? `Send another in 0:${String(left).padStart(2, '0')}` : 'Send another'}
        </Button>
        <Button variant="quiet" full onClick={props.onWrongAddress}>
          Wrong address
        </Button>
      </div>
      <p className="id-fine">
        A new link replaces the old one, so asking twice and then clicking the first email will not
        work.
      </p>
    </div>
  )
}

function DeadLinkNote() {
  return (
    <div className="id-deadlink" role="status">
      <Icon name="clock" size={16} />
      <div>
        <b>That link has expired.</b> Sign-in links last twenty minutes and work once. Nothing went
        wrong and nothing was lost: your handle, your vouches and anything you built are exactly
        where you left them.
      </div>
    </div>
  )
}

function BackLink(props: { onBack(): void }) {
  return (
    <Button variant="quiet" size="sm" icon="arrow-left" className="id-back" onClick={props.onBack}>
      Back
    </Button>
  )
}
