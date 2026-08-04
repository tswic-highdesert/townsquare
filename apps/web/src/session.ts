/**
 * The shell's side of identity.
 *
 * Every call here is same-origin and cookie-carrying, and none of it ever
 * touches a frame. The account view the API returns has no email in it by
 * construction, so there is nothing here that would be dangerous to hold.
 */

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

async function post<T>(path: string, body: unknown): Promise<T | ApiError> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const parsed: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    return (parsed as ApiError | null) ?? { error: 'unavailable', message: 'Something went wrong.' }
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

export function signUp(email: string, handle: string): Promise<SentResult> {
  return post<SentResult>('/api/auth/signup', { email, handle })
}

export function signIn(email: string): Promise<SentResult> {
  return post<SentResult>('/api/auth/signin', { email })
}

export function confirm(token: string): Promise<AccountView | ApiError> {
  return post<AccountView>('/api/auth/confirm', { token })
}

export function signOut(everywhere = false): Promise<null | ApiError> {
  return post<null>('/api/auth/signout', { everywhere })
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

export function resolveInitialAccount(): Promise<AccountView | null> {
  initial ??= (async () => {
    const token = takeConfirmTokenFromUrl()
    if (!token) return fetchAccount()

    const result = await confirm(token)
    // A dead link is not a reason to show a signed-out shell to someone who
    // may already have a perfectly good session from another tab.
    return isError(result) ? fetchAccount() : result
  })()
  return initial
}
