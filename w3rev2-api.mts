// TEMPORARY audit harness. Stands up the API's review surface with a queue that
// has something in it, because in development the API's queue has no door: the
// only thing that creates a submission is the MCP process, and it holds its own
// separate memory store. Delete after screenshots.
import { createServer } from 'node:http'
import { bundleDigest, hashFiles } from '@townsquare/bundle'
import { ConsoleDelivery, Identity, MemoryIdentityStore, parseSeedList, seedCohort } from '@townsquare/identity'
import { BundleStorePublisher, MemoryBundleStore } from '@townsquare/sandbox'
import {
  MemoryCreationStore, MemoryModerationLogStore, MemoryRecordTypeStore,
  MemoryReportStore, MemorySubmissionStore, Moderation, Reports, Review,
} from '@townsquare/review'
import { createReviewRoutes } from './apps/api/src/reviewRoutes.js'
import { createIdentityRoutes } from './apps/api/src/identityRoutes.js'

const TOWN = { id: 'russellville-ar', name: 'Russellville', timezone: 'America/Chicago' }
const SHELL = 'http://townsquare.localhost:5320'
const enc = new TextEncoder()


const idStore = new MemoryIdentityStore()
const delivery = new ConsoleDelivery({ shellOrigin: SHELL })
const identity = new Identity({ store: idStore, delivery })
await seedCohort(idStore, parseSeedList('modtal:mod@example.com:admin,bea:bea@example.com'), Date.now())
const builder = (await idStore.userByHandle('bea'))!

const creations = new MemoryCreationStore()
const review = new Review({
  submissions: new MemorySubmissionStore(),
  creations,
  recordTypes: new MemoryRecordTypeStore(),
  publisher: new BundleStorePublisher({
    store: new MemoryBundleStore(),
    origin: { appsDomain: 'tsq-apps.localhost', scheme: 'http', port: 3031 },
    shellOrigins: [SHELL],
  }),
})

function bundle(over: Record<string, unknown> = {}, version = '1.0.0') {
  const manifest = {
    manifest_version: 1, sdk: 1, name: 'River Level',
    tagline: 'How high the Arkansas is at Russellville right now',
    description: 'Reads the town feed and shows the latest river reading with the time it was taken.',
    version, tags: [], entry: 'index.html', icon: 'icon.svg',
    display: { surface: 'full', height: 'auto' },
    permissions: { identity: 'none', read: [], write: [], network: [], storage: false, device: [] },
    ...over,
  }
  const files = new Map<string, Uint8Array>([
    ['townsquare.json', enc.encode(JSON.stringify(manifest, null, 2))],
    ['index.html', enc.encode('<!doctype html><title>River Level</title><main><h1>River Level</h1><p>Latest reading from the town feed.</p></main>')],
    ['icon.svg', enc.encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 14h18"/></svg>')],
  ])
  // The canonical tree digest, the same function the queue re-checks at
  // approval. My hand-rolled one was refused, which is that check working.
  const digest = bundleDigest(hashFiles([...files.entries()].map(([path, bytes]) => ({ path, bytes }))))
  return { manifest, files, digest }
}

const base = { townId: TOWN.id, userId: builder.id, handle: builder.handle, proposedSlug: 'river-level', name: 'River Level', entry: 'index.html', warnings: [] }

// v1: asks for nothing at all. Approved, so it is the thing v2 is diffed against.
const one = bundle()
const s1 = await review.submit({ ...base, creationId: null, version: '1.0.0', manifest: one.manifest as never, bundleDigest: one.digest, files: one.files })
const reviewer = { userId: (await idStore.userByHandle('modtal'))!.id, handle: 'modtal', role: 'admin' as const }
await review.decide(reviewer, s1.id, 'approve', 'Reads the feed and nothing else. Fine.')

// v2: the browser-extension play. Same app, now asking for the network.
const two = bundle({ permissions: { identity: 'handle', read: ['stories'], write: [], network: ['collect.example.com'], storage: true, device: [] } }, '1.1.0')
await review.submit({ ...base, creationId: null, version: '1.1.0', manifest: two.manifest as never, bundleDigest: two.digest, files: two.files })

const reportStore = new MemoryReportStore()
const reports = new Reports({ reports: reportStore, targets: { async creationBySlug(t, slug) { const c = await creations.bySlug(t, slug); return c ? { id: c.id, name: c.name } : null } } })
const moderation = new Moderation({ creations, publisher: new BundleStorePublisher({ store: new MemoryBundleStore(), origin: { appsDomain: 'tsq-apps.localhost', scheme: 'http', port: 3031 }, shellOrigins: [SHELL] }), reports: reportStore, log: new MemoryModerationLogStore() })

const reviewRoutes = createReviewRoutes({ identity, review, reports, moderation, contributions: null as never, shellOrigin: SHELL, townId: TOWN.id })
const identityRoutes = createIdentityRoutes({ identity, store: idStore, storage: null as never, creations: () => [], shellOrigin: SHELL, townId: TOWN.id, actSecret: 'dev', echoChallenge: (e: string) => { const x = delivery.latestFor(e); return x ? { url: x.url } : null } })

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', SHELL)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  const url = new URL(req.url ?? '/', 'http://localhost')
  void identityRoutes(req, res, url)
    .then((h) => (h ? true : reviewRoutes(req, res, url)))
    .then((h) => { if (!h) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"not_found"}') } })
}).listen(3080, () => console.log('queue ready: v1 approved, v2 queued asking for network'))
