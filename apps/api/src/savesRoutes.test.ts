/**
 * The saves routes over a real socket.
 *
 * Same reason as `identityRoutes.test.ts`: the properties worth proving here
 * are HTTP properties. That a signed-out request is refused, that the scope
 * comes from the cookie and not from the body, and that a cross-origin write is
 * rejected are all things a handler called directly cannot be wrong about.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  Identity,
  MemoryIdentityStore,
  seedCohort,
  type ChallengeDelivery,
} from '@townsquare/identity'
import { MemorySaveStore, Saves } from '@townsquare/saves'
import { createSavesRoutes, type BuiltCreation } from './savesRoutes.js'

const SHELL_ORIGIN = 'http://townsquare.localhost:5173'
const TOWN = 'russellville-ar'

class Captured implements ChallengeDelivery {
  last = ''
  async deliver(input: { token: string }): Promise<void> {
    this.last = input.token
  }
}

let server: Server
let base: string
let identity: Identity
let identityStore: MemoryIdentityStore
let saves: Saves
let built: BuiltCreation[]
let cookies: Record<string, string>

/** A signed-in session for a seeded resident, as a cookie header. */
async function sessionFor(handle: string): Promise<string> {
  const cookie = cookies[handle]
  if (!cookie) throw new Error(`no session for ${handle}`)
  return cookie
}

beforeAll(async () => {
  identityStore = new MemoryIdentityStore()
  const delivery = new Captured()
  identity = new Identity({ store: identityStore, delivery })

  const routes = createSavesRoutes({
    identity,
    get saves() {
      return saves
    },
    listBuilt: async () => built,
    shellOrigin: SHELL_ORIGIN,
    townId: TOWN,
  })

  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    void routes(req, res, url).then((handled) => {
      if (!handled) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end('{"error":"not_found"}')
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  await seedCohort(
    identityStore,
    [
      { handle: 'maya', email: 'maya@example.com' },
      { handle: 'luis', email: 'luis@example.com' },
    ],
    Date.now(),
  )

  cookies = {}
  for (const [handle, email] of [
    ['maya', 'maya@example.com'],
    ['luis', 'luis@example.com'],
  ] as const) {
    const started = await identity.requestSignIn({ email })
    if (!started.ok) throw new Error('sign-in did not start')
    const confirmed = await identity.confirmChallenge(delivery.last)
    if (!confirmed.ok) throw new Error('confirm failed')
    // Plain http, so no `__Host-` prefix. See `cookieName`.
    cookies[handle] = `tsq_session=${encodeURIComponent(confirmed.session)}`
  }
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(() => {
  saves = new Saves({ store: new MemorySaveStore() })
  built = []
})

const HARDWARE = {
  kind: 'business',
  refId: 'biz-hickory-ash',
  title: 'Hickory & Ash',
  detail: 'Woodshop',
}

async function post(body: unknown, cookie?: string, origin = SHELL_ORIGIN) {
  return fetch(`${base}/api/saves`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('saves routes', () => {
  it('refuses a signed-out read and a signed-out write', async () => {
    expect((await fetch(`${base}/api/yours`)).status).toBe(401)
    expect((await post(HARDWARE)).status).toBe(401)
  })

  it('saves and reads back what was saved', async () => {
    const cookie = await sessionFor('maya')
    const saved = await post(HARDWARE, cookie)
    expect(saved.status).toBe(200)

    const yours = (await (await fetch(`${base}/api/yours`, { headers: { Cookie: cookie } })).json()) as {
      saves: Array<Record<string, unknown>>
    }
    expect(yours.saves).toHaveLength(1)
    expect(yours.saves[0]?.['title']).toBe('Hickory & Ash')
  })

  /** The one property that matters most: the list is the cookie's, not the body's. */
  it('will not let a body redirect the write at another resident', async () => {
    const maya = await sessionFor('maya')
    const luis = await sessionFor('luis')

    const mayaId = (await identityStore.userByHandle('maya'))?.id
    await post({ ...HARDWARE, userId: mayaId, townId: TOWN }, luis)

    const hers = (await (await fetch(`${base}/api/yours`, { headers: { Cookie: maya } })).json()) as {
      saves: unknown[]
    }
    expect(hers.saves).toEqual([])
  })

  it('never returns the internal ids the row carries', async () => {
    const cookie = await sessionFor('maya')
    await post(HARDWARE, cookie)
    const body = await (await fetch(`${base}/api/yours`, { headers: { Cookie: cookie } })).text()
    expect(body).not.toContain('userId')
    expect(body).not.toContain('townId')
  })

  it('rejects a write from an origin that is not the shell', async () => {
    const cookie = await sessionFor('maya')
    expect((await post(HARDWARE, cookie, 'https://evil.example')).status).toBe(403)
  })

  it('answers a duplicate 200, not a conflict', async () => {
    const cookie = await sessionFor('maya')
    await post(HARDWARE, cookie)
    const again = await post(HARDWARE, cookie)
    expect(again.status).toBe(200)
    expect(((await again.json()) as { duplicate: boolean }).duplicate).toBe(true)
  })

  it('unsaves through the same POST', async () => {
    const cookie = await sessionFor('maya')
    await post(HARDWARE, cookie)
    const gone = await post({ remove: true, kind: 'business', refId: HARDWARE.refId }, cookie)
    expect(((await gone.json()) as { removed: boolean }).removed).toBe(true)

    const yours = (await (await fetch(`${base}/api/yours`, { headers: { Cookie: cookie } })).json()) as {
      saves: unknown[]
    }
    expect(yours.saves).toEqual([])
  })

  it('maps a service refusal to a status rather than a 500', async () => {
    const cookie = await sessionFor('maya')
    const bad = await post({ ...HARDWARE, kind: 'person' }, cookie)
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as { error: string }).error).toBe('invalid')
  })

  it('carries what the resident built, which is usually nothing', async () => {
    const cookie = await sessionFor('maya')
    const empty = (await (await fetch(`${base}/api/yours`, { headers: { Cookie: cookie } })).json()) as {
      built: unknown[]
    }
    expect(empty.built).toEqual([])

    built = [
      {
        slug: 'pothole-watch',
        name: 'Pothole Watch',
        tagline: 'Where the holes are',
        status: 'active',
        updatedAt: 1_770_000_000_000,
      },
    ]
    const some = (await (await fetch(`${base}/api/yours`, { headers: { Cookie: cookie } })).json()) as {
      built: Array<{ name: string }>
    }
    expect(some.built[0]?.name).toBe('Pothole Watch')
  })
})
