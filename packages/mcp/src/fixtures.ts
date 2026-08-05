/**
 * A whole working MCP context, in memory.
 *
 * Real implementations throughout — the memory identity store, the real draft
 * store, the real publisher writing into a real `MemoryBundleStore`. Nothing
 * here is a mock that agrees with whatever the code does, which is the only way
 * a test of "can resident A read resident B's draft" is worth anything.
 */

import { BundleStorePublisher, MemoryBundleStore } from '@townsquare/sandbox'
import {
  MemoryCreationStore,
  MemoryRecordTypeStore,
  MemorySubmissionStore,
  Review,
} from '@townsquare/review'
import { MemoryIdentityStore } from '@townsquare/identity'
import { MANIFEST_VERSION, SDK_MAJOR } from '@townsquare/manifest'
import type { McpContext, Principal } from './context.js'
import { MemoryDraftStore } from './drafts.js'
import { MemoryMcpTokenStore } from './tokens.js'
import {
  BundleStoreCatalogue,
  RecordTypeStoreRegistry,
  ReviewQueueAdapter,
  SandboxPublisher,
  StaticTownReader,
} from './memory.js'

export interface Fixture {
  ctx: McpContext
  clock: { now: number }
  identity: MemoryIdentityStore
  tokens: MemoryMcpTokenStore
  drafts: MemoryDraftStore
  /** The real queue, shared with the reviewer side. */
  review: Review
  submissions: MemorySubmissionStore
  creations: MemoryCreationStore
  recordTypes: MemoryRecordTypeStore
  bundles: MemoryBundleStore
}

export const TOWN_ID = 'russellville-ar'

export function makeFixture(): Fixture {
  const clock = { now: 1_700_000_000_000 }
  const identity = new MemoryIdentityStore()
  const tokens = new MemoryMcpTokenStore()
  const drafts = new MemoryDraftStore()
  const submissions = new MemorySubmissionStore()
  const creations = new MemoryCreationStore()
  const recordTypes = new MemoryRecordTypeStore()
  const bundles = new MemoryBundleStore()

  const origin = { appsDomain: 'tsq-apps.localhost', scheme: 'http' as const, port: 3031 }
  const shellOrigins = ['http://townsquare.localhost:5173']

  // One `Review`, shared: the builder submits into it and the reviewer decides
  // on it. A test that used two would prove nothing about the real system.
  const review = new Review({
    submissions,
    creations,
    recordTypes,
    publisher: new BundleStorePublisher({ store: bundles, origin, shellOrigins }),
    now: () => clock.now,
  })

  const ctx: McpContext = {
    now: () => clock.now,
    tokens,
    users: identity,
    drafts,
    town: new StaticTownReader({
      info: { id: TOWN_ID, name: 'Russellville', timezone: 'America/Chicago' },
      items: [{ id: 'e1', type: 'event', title: 'Farmers market' }],
      businesses: [{ id: 'b1', name: 'Taqueria', category: 'restaurant' }],
    }),
    creations: new BundleStoreCatalogue(bundles),
    recordTypes: new RecordTypeStoreRegistry(recordTypes, TOWN_ID),
    publisher: new SandboxPublisher({
      store: bundles,
      origin,
      shellOrigins,
      now: () => clock.now,
    }),
    review: new ReviewQueueAdapter(review),
    townId: TOWN_ID,
    publicUrl: 'http://localhost:8770',
    shellOrigin: 'http://townsquare.localhost:5173',
  }

  return { ctx, clock, identity, tokens, drafts, review, submissions, creations, recordTypes, bundles }
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
