/**
 * A whole working MCP context, in memory.
 *
 * Real implementations throughout — the memory identity store, the real draft
 * store, the real publisher writing into a real `MemoryBundleStore`. Nothing
 * here is a mock that agrees with whatever the code does, which is the only way
 * a test of "can resident A read resident B's draft" is worth anything.
 */

import { MemoryBundleStore } from '@townsquare/sandbox'
import { MemoryIdentityStore } from '@townsquare/identity'
import { MANIFEST_VERSION, SDK_MAJOR } from '@townsquare/manifest'
import type { McpContext, Principal } from './context.js'
import { MemoryDraftStore } from './drafts.js'
import { MemoryMcpTokenStore } from './tokens.js'
import {
  BundleStoreCatalogue,
  MemoryReviewQueue,
  SandboxPublisher,
  StaticRecordTypeRegistry,
  StaticTownReader,
} from './memory.js'

export interface Fixture {
  ctx: McpContext
  clock: { now: number }
  identity: MemoryIdentityStore
  tokens: MemoryMcpTokenStore
  drafts: MemoryDraftStore
  review: MemoryReviewQueue
  recordTypes: StaticRecordTypeRegistry
  bundles: MemoryBundleStore
}

export function makeFixture(): Fixture {
  const clock = { now: 1_700_000_000_000 }
  const identity = new MemoryIdentityStore()
  const tokens = new MemoryMcpTokenStore()
  const drafts = new MemoryDraftStore()
  const review = new MemoryReviewQueue()
  const recordTypes = new StaticRecordTypeRegistry()
  const bundles = new MemoryBundleStore()

  const ctx: McpContext = {
    now: () => clock.now,
    tokens,
    users: identity,
    drafts,
    town: new StaticTownReader({
      info: { id: 'russellville-ar', name: 'Russellville', timezone: 'America/Chicago' },
      items: [{ id: 'e1', type: 'event', title: 'Farmers market' }],
      businesses: [{ id: 'b1', name: 'Taqueria', category: 'restaurant' }],
    }),
    creations: new BundleStoreCatalogue(bundles),
    recordTypes,
    publisher: new SandboxPublisher({
      store: bundles,
      origin: { appsDomain: 'tsq-apps.localhost', scheme: 'http', port: 3031 },
      shellOrigins: ['http://townsquare.localhost:5173'],
      now: () => clock.now,
    }),
    review,
    publicUrl: 'http://localhost:8770',
    shellOrigin: 'http://townsquare.localhost:5173',
  }

  return { ctx, clock, identity, tokens, drafts, review, recordTypes, bundles }
}

export async function makeResident(
  fixture: Fixture,
  handle: string,
  opts: { verified?: boolean } = {},
): Promise<Principal> {
  const user = await fixture.identity.createUser(
    { handle, email: `${handle}@example.com`, emailConfirmed: true },
    fixture.clock.now,
  )
  if (opts.verified) {
    await fixture.identity.updateUser(
      user.id,
      { verifiedResident: true, verifiedMethod: 'manual', verifiedAt: fixture.clock.now },
      fixture.clock.now,
    )
  }
  return {
    userId: user.id,
    handle: user.handle,
    verified: opts.verified ?? false,
    role: 'user',
    tokenId: 'test',
  }
}

/** A minimal creation that passes the real validator. */
export function helloBundle(
  overrides: Partial<Record<string, unknown>> = {},
): Array<{ path: string; text: string }> {
  const manifest = {
    manifest_version: MANIFEST_VERSION,
    sdk: SDK_MAJOR,
    name: 'Hello',
    tagline: 'A very small creation',
    description: 'Exists so the tests exercise the real publish path end to end.',
    version: '1.0.0',
    tags: [],
    entry: 'index.html',
    icon: 'icon.svg',
    display: { surface: 'full', height: 'auto' },
    permissions: { identity: 'none', read: [], write: [], network: [], storage: false, device: [] },
    ...overrides,
  }
  return [
    { path: 'townsquare.json', text: JSON.stringify(manifest, null, 2) },
    {
      path: 'index.html',
      text:
        '<!doctype html>\n<html lang="en">\n  <head><title>Hello</title></head>\n' +
        '  <body>\n    <h1>Hello</h1>\n' +
        "    <script type=\"module\">\n      import { app } from '@townsquare/sdk'\n      app.ready()\n    </script>\n" +
        '  </body>\n</html>\n',
    },
    {
      path: 'icon.svg',
      text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64"/></svg>\n',
    },
  ]
}
