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
 * with. It expires in fifteen minutes and is refreshed at thirteen.
 *
 * The token itself is never passed into the frame. What crosses the port is
 * only ever an answer: `{ handle, verified }` as the *server* projected it, or
 * a value out of the creation's own storage scope.
 */

import { BridgeCallError, type IdentitySource, type StorageSource } from '@townsquare/host'
import { isErrorCode, wireError, type WireError } from '@townsquare/shared'

export interface ActTokenHolder {
  identity: IdentitySource
  storage: StorageSource
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

  /**
   * One authenticated call to the bridge API.
   *
   * A 401 drops the token and reports itself rather than retrying here: an
   * invisible retry loop against an API that is refusing us is much worse to
   * debug than one clear failure the guest can see.
   */
  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    const bearer = await token()
    if (!bearer) throw new BridgeCallError(wireError('unavailable', 'Town Square could not sign this request.'))

    const res = await fetch(path, {
      // No cookie, ever. The bridge answers to the act token alone.
      credentials: 'omit',
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${bearer}` },
    })

    if (res.status === 401) current = null
    if (!res.ok) throw new BridgeCallError(await toWireError(res))
    return res.status === 204 ? null : res.json()
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
      if (!res.ok) throw new BridgeCallError(await toWireError(res))
      return (await res.json()) as { handle: string; verified: boolean } | null
    },
  }

  const storage: StorageSource = {
    async get(key) {
      const body = (await call(`/api/bridge/storage?key=${encodeURIComponent(key)}`)) as {
        found: boolean
        value: unknown
      }
      // JSON cannot carry `undefined`, so absence arrives as a flag and is
      // turned back into `undefined` here — the guest never has to tell an
      // unset key apart from a stored null by inspecting a wrapper.
      return body.found ? body.value : undefined
    },

    async set(key, value) {
      await call('/api/bridge/storage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // A `set(key, undefined)` is a removal, and `JSON.stringify` dropping
        // the property is exactly how that reaches the server.
        body: JSON.stringify({ key, value }),
      })
    },
  }

  return {
    identity,
    storage,
    dispose() {
      disposed = true
      current = null
    },
  }
}

/**
 * Turn an API failure into the wire error the guest should see.
 *
 * Only codes that are already part of the SDK's documented vocabulary pass
 * through; anything else becomes `unavailable`, so a new server-side code
 * cannot leak an undocumented string into generated code that branches on it.
 */
async function toWireError(res: Response): Promise<WireError> {
  const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null
  const code = body?.error

  if (isErrorCode(code)) {
    return wireError(code, body?.message ?? 'Town Square refused that request.')
  }
  return wireError('unavailable', 'Town Square could not complete that request.')
}
