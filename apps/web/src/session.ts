/**
 * The shell's side of identity.
 *
 * Every call here is same-origin and cookie-carrying, and none of it ever
 * touches a frame. The account view the API returns has no email in it by
 * construction, so there is nothing here that would be dangerous to hold.
 */

import { t } from './i18n/index.js'

export interface AccountView {
  handle: string
  emailConfirmed: boolean
  role: 'user' | 'moderator' | 'admin'
  verified: boolean
  verifiedMethod: 'vouch' | 'manual' | 'postcard' | null
  canSubmit: boolean
  vouches: { available: number; budget: number; used: number; windowDays: number }
}

export interface ApiError {
  error: string
  message: string
}

/**
 * What this device remembers between sessions, and the whole of it.
 *
 * A handle and an address, so a returning resident presses one button instead
 * of recalling which of their addresses they signed up with six months ago.
 *
 * The address is **shown** masked and **stored** whole, and the asymmetry is
 * deliberate. Masking is a defence against the room — a laptop open on a
 * kitchen table, a phone handed to somebody. It is not a defence against
 * whoever already has script access to this origin, and there is nothing to
 * gain by pretending otherwise: there is no route that turns a handle into a
 * sign-in link, so a device that held only the mask could not send one.
 * Signing out everywhere clears it.
 */
export interface RememberedDevice {
  handle: string
  email: string
}

const REMEMBERED = 'tsq.device'
/** Where the typed address waits between asking for a link and redeeming it. */
const PENDING = 'tsq.pending'

/** `ruth@dardanelle.net` → `r•••@dardanelle.net`. Never reversible, never stored whole. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '•••'
  return `${email[0] ?? ''}•••${email.slice(at)}`
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    // Private mode, a disabled store, or something else's malformed value. All
    // three mean the same thing here: this device remembers nothing.
    return null
  }
}

export function rememberedDevice(): RememberedDevice | null {
  return readJson<RememberedDevice>(REMEMBERED)
}

export function forgetDevice(): void {
  try {
    window.localStorage.removeItem(REMEMBERED)
    window.localStorage.removeItem(PENDING)
  } catch {
    /* nothing to forget */
  }
}

function rememberPending(email: string): void {
  try {
    window.localStorage.setItem(PENDING, email)
  } catch {
    /* the sign-in still works, this device simply will not remember it */
  }
}

/**
 * Promoted only once a link is actually redeemed.
 *
 * Writing the address at the moment it was typed would have this device
 * offering to sign in as a typo forever, and would remember an address for
 * somebody who typed a neighbour's in and never had a link to click.
 */
function promotePending(handle: string): void {
  try {
    const email = window.localStorage.getItem(PENDING)
    if (!email) return
    window.localStorage.setItem(REMEMBERED, JSON.stringify({ handle, email }))
    window.localStorage.removeItem(PENDING)
  } catch {
    /* as above */
  }
}

async function post<T>(path: string, body: unknown): Promise<T | ApiError> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const parsed: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    return (parsed as ApiError | null) ?? { error: 'unavailable', message: t('Something went wrong.') }
  }
  return parsed as T
}

export function isError(v: unknown): v is ApiError {
  return typeof v === 'object' && v !== null && 'error' in v
}

export async function fetchAccount(): Promise<AccountView | null> {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
  if (!res.ok) return null
  return (await res.json()) as AccountView | null
}

/** `devLink` is present only in development. See `identityRoutes.ts`. */
export type SentResult = { sent: true; devLink?: string } | ApiError

export async function signUp(email: string, handle: string): Promise<SentResult> {
  const result = await post<SentResult>('/api/auth/signup', { email, handle })
  if (!isError(result)) rememberPending(email)
  return result
}

export async function signIn(email: string): Promise<SentResult> {
  const result = await post<SentResult>('/api/auth/signin', { email })
  if (!isError(result)) rememberPending(email)
  return result
}

/** Passwords are sent only to the same-origin API, never stored by the shell. */
export function passwordAccount(mode: 'signup' | 'signin', handle: string, password: string): Promise<AccountView | ApiError> {
  return post<AccountView>(`/api/auth/${mode}`, { handle, password })
}

export async function confirm(token: string): Promise<AccountView | ApiError> {
  const result = await post<AccountView>('/api/auth/confirm', { token })
  if (!isError(result)) promotePending(result.handle)
  return result
}

export async function signOut(everywhere = false): Promise<null | ApiError> {
  const result = await post<null>('/api/auth/signout', { everywhere })
  // Signing out everywhere is the one control a pseudonymous account has, so it
  // has to clear the local trace too. Signing out of this tab does not: the
  // masked address is how you get back in on your own laptop.
  if (everywhere) forgetDevice()
  return result
}

export interface VouchResult {
  vouchee: { handle: string; verified: boolean } | null
  revoked: string | null
  account: AccountView
}

export function vouchFor(handle: string, note?: string): Promise<VouchResult | ApiError> {
  return post<VouchResult>('/api/auth/vouch', { handle, note })
}

export function revokeVouch(handle: string): Promise<VouchResult | ApiError> {
  return post<VouchResult>('/api/auth/vouch', { handle, revoke: true })
}

/**
 * Pull the confirmation token out of the URL and clear it.
 *
 * Cleared with `replaceState` rather than left in place, because a single-use
 * token sitting in the address bar ends up in a screenshot, a shared link, or
 * a browser's sync history, and it is a session for whoever finds it there.
 */
function takeConfirmTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('confirm')
  if (!token) return null

  params.delete('confirm')
  const query = params.toString()
  window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''))
  return token
}

/**
 * Who is signed in when the page loads — redeeming a confirmation link first
 * if the resident arrived on one.
 *
 * Memoized at module scope, and that is the whole point rather than an
 * optimization. React mounts effects twice in development, and the naive
 * version raced: the first mount redeemed the token, the second found the URL
 * already cleared, asked "who am I" before the cookie had been set, and got
 * `null` — signing the resident straight back out. One promise, resolved once,
 * shared by every caller.
 */
let initial: Promise<AccountView | null> | null = null

/**
 * Whether the link this page was opened on was dead.
 *
 * Read rather than returned, because the sign-in screen is the only thing that
 * needs it and it mounts long after the redemption ran. Widening
 * `resolveInitialAccount` to a pair would make every caller destructure a field
 * one screen uses, and the shell's router is not this module's to reshape.
 */
let linkWasDead = false

export function signInLinkWasDead(): boolean {
  return linkWasDead
}

/** Cleared once the resident has asked for a new one; the notice is not sticky. */
export function clearDeadLink(): void {
  linkWasDead = false
}

export function resolveInitialAccount(): Promise<AccountView | null> {
  initial ??= (async () => {
    const token = takeConfirmTokenFromUrl()
    if (!token) return fetchAccount()

    const result = await confirm(token)
    if (!isError(result)) return result

    // A dead link is not a reason to show a signed-out shell to someone who
    // may already have a perfectly good session from another tab. It is a
    // reason to say so if they end up on the sign-in screen, which is where
    // an unexplained empty form reads as "it forgot me" rather than "that
    // link was twenty minutes old".
    const existing = await fetchAccount()
    linkWasDead = existing === null
    return existing
  })()
  return initial
}
