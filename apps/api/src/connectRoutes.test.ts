/**
 * The connect routes over a real socket.
 *
 * The properties here are HTTP properties, same as `identityRoutes.test.ts`:
 * whether minting requires a session cookie, whether the plaintext token
 * appears exactly once, and whether one resident can revoke another's
 * credential. A handler called directly cannot be wrong about the first of
 * those, which is the one that matters most.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Identity, MemoryIdentityStore, type ChallengeDelivery } from '@townsquare/identity'
import { MemoryMcpTokenStore, authenticateToken, parseToken } from '@townsquare/mcp'
import { createConnectRoutes } from './connectRoutes.js'
import { createIdentityRoutes } from './identityRoutes.js'
import { CreationStorage, MemoryStorageStore } from '@townsquare/storage'

const SHELL_ORIGIN = 'http://townsquare.localhost:5173'
const MCP_URL = 'http://localhost:8770/mcp'

class Captured implements ChallengeDelivery {
  tokens: string[] = []
  async deliver(input: { token: string }): Promise<void> {
    this.tokens.push(input.token)
  }
  get last(): string {
    return this.tokens[this.tokens.length - 1]!
  }
}

let server: Server
let base: string
let store: MemoryIdentityStore
let identity: Identity
let delivery: Captured
let tokens: MemoryMcpTokenStore
let auth: ReturnType<typeof createIdentityRoutes>
let connect: ReturnType<typeof createConnectRoutes>

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    void auth(req, res, url)
      .then((handled) => (handled ? true : connect(req, res, url)))
      .then((handled) => {
        if (!handled) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end('{"error":"not_found"}')
        }
      })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
})

beforeEach(() => {
  store = new MemoryIdentityStore()
  delivery = new Captured()
  identity = new Identity({ store, delivery })
  tokens = new MemoryMcpTokenStore()
  auth = createIdentityRoutes({
    identity,
    store,
    storage: new CreationStorage({ store: new MemoryStorageStore() }),
    creations: () => [],
    shellOrigin: SHELL_ORIGIN,
    townId: 'russellville-ar',
    actSecret: 'test-act-secret',
  })
  connect = createConnectRoutes({ identity, tokens, shellOrigin: SHELL_ORIGIN, mcpUrl: MCP_URL })
})

async function post(path: string, body: unknown, cookie?: string) {
  return fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: SHELL_ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

async function signedIn(handle = 'tswic', email = 'tal@example.com'): Promise<string> {
  await post('/api/auth/signup', { handle, email })
  const res = await post('/api/auth/confirm', { token: delivery.last })
  return res.headers.get('set-cookie')!.split(';')[0]!
}

describe('minting a token', () => {
  it('needs a session', async () => {
    const res = await post('/api/connect/tokens', { label: 'laptop' })
    expect(res.status).toBe(401)
  })

  it('returns a working credential exactly once', async () => {
    const cookie = await signedIn()
    const res = await post('/api/connect/tokens', { label: 'laptop' }, cookie)
    expect(res.status).toBe(200)

    const body = (await res.json()) as { token: string; claude_code_command: string }
    expect(body.token.startsWith('ts_live_')).toBe(true)
    expect(body.claude_code_command).toContain(MCP_URL)

    // It authenticates against the store the MCP service reads.
    const result = await authenticateToken(tokens, body.token, Date.now())
    expect(result.ok).toBe(true)

    // And it is never recoverable: the listing has the id and nothing else.
    const listed = await fetch(base + '/api/connect/tokens', { headers: { Cookie: cookie } })
    const list = (await listed.json()) as { tokens: Array<{ id: string }> }
    expect(JSON.stringify(list)).not.toContain(parseToken(body.token)!.secret)
    expect(list.tokens[0]!.id).toBe(parseToken(body.token)!.id)
  })

  it('refuses a cross-origin post even with a valid cookie', async () => {
    const cookie = await signedIn()
    const res = await fetch(base + '/api/connect/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', Cookie: cookie },
      body: '{}',
    })
    expect(res.status).toBe(403)
  })
})

describe('revoking', () => {
  it('stops the credential working', async () => {
    const cookie = await signedIn()
    const minted = (await (
      await post('/api/connect/tokens', { label: 'laptop' }, cookie)
    ).json()) as { token: string; record: { id: string } }

    const res = await post(`/api/connect/tokens/${minted.record.id}/revoke`, {}, cookie)
    expect(res.status).toBe(200)
    expect(await authenticateToken(tokens, minted.token, Date.now())).toEqual({
      ok: false,
      reason: 'revoked',
    })
  })

  it('answers a neighbour’s token id like one that does not exist', async () => {
    const mine = await signedIn('tswic', 'tal@example.com')
    const minted = (await (
      await post('/api/connect/tokens', { label: 'laptop' }, mine)
    ).json()) as { token: string; record: { id: string } }

    const theirs = await signedIn('neighbour', 'neighbour@example.com')
    const attempt = await post(`/api/connect/tokens/${minted.record.id}/revoke`, {}, theirs)
    const invented = await post('/api/connect/tokens/doesnotexist/revoke', {}, theirs)

    expect(attempt.status).toBe(404)
    expect(await attempt.json()).toEqual(await invented.json())
    // And the credential still works, because nothing happened to it.
    expect((await authenticateToken(tokens, minted.token, Date.now())).ok).toBe(true)
  })
})
