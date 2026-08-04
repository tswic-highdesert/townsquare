/**
 * The act token, held in a closure and nowhere else.
 *
 * Not React state, not a module-level global, not `localStorage`. State trees
 * get serialized into debug tools and error reports, globals are reachable
 * from any code running on this page, and storage survives the tab. A closure
 * variable is reachable only by the functions defined beside it, which is the
 * smallest surface this value can have while still being usable.
 *
 * The token is minted per mounted creation, so it names one creation, one
 * approved version, one user, and the exact grants that version was approved
 * with. It expires in fifteen minutes and is refreshed at thirteen. Nothing
 * here is ever passed into the frame: the guest never sees a token, and the
 * only thing that crosses the port is `{ handle, verified }` as the *server*
 * projected it.
 */

import type { IdentitySource } from '@townsquare/host'

export interface ActTokenHolder {
  identity: IdentitySource
  /** Called on teardown. In-flight refreshes stop mattering after this. */
  dispose(): void
}

interface MintedToken {
  token: string
  expiresAt: number
}

/** Refreshed this long before it lapses, so a call never races the expiry. */
const REFRESH_MARGIN_MS = 2 * 60 * 1000

export function createActTokenHolder(creationSlug: string): ActTokenHolder {
  let current: MintedToken | null = null
  let inFlight: Promise<MintedToken | null> | null = null
  let disposed = false

  async function mint(): Promise<MintedToken | null> {
    const res = await fetch(`/api/creations/${encodeURIComponent(creationSlug)}/act`, {
      method: 'POST',
      // The session cookie goes to the mint endpoint and only to the mint
      // endpoint. This is the exchange: an account credential in, a
      // creation-scoped grant out.
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) return null
    const body = (await res.json()) as { token: string; expiresAt: number }
    return { token: body.token, expiresAt: body.expiresAt }
  }

  async function token(): Promise<string | null> {
    if (disposed) return null
    if (current && Date.now() < current.expiresAt - REFRESH_MARGIN_MS) return current.token

    // One mint in flight at a time. A creation that calls `user.current()` in
    // a render loop would otherwise mint a token per call.
    inFlight ??= mint().finally(() => {
      inFlight = null
    })
    current = await inFlight
    return current?.token ?? null
  }

  const identity: IdentitySource = {
    async current() {
      const bearer = await token()
      if (!bearer) return null

      const res = await fetch('/api/bridge/me', {
        // No cookie, ever. The bridge answers to the act token alone, and a
        // bridge route that accepted a session would have quietly turned a
        // fifteen-minute creation-scoped grant back into an account session.
        credentials: 'omit',
        headers: { Authorization: `Bearer ${bearer}` },
      })

      if (res.status === 401) {
        // The token was rejected — expired against a restarted API, most
        // often. Drop it and let the next call mint a fresh one rather than
        // retrying here, where a loop would be invisible.
        current = null
        return null
      }
      if (!res.ok) throw new Error(`bridge/me ${res.status}`)
      return (await res.json()) as { handle: string; verified: boolean } | null
    },
  }

  return {
    identity,
    dispose() {
      disposed = true
      current = null
    },
  }
}
