/**
 * The read API. Development shape of what becomes `api.townsquare.org`.
 *
 * Separate from the sandbox process on purpose, and the separation is the
 * point rather than an organisational preference. This service is where a
 * credential will eventually live: sessions, act tokens, the database. The
 * sandbox process, which serves untrusted code from origins we do not control
 * the contents of, must never be the same thing.
 *
 * A creation cannot call this directly — its CSP has no `connect-src` entry for
 * it. Everything a creation reads comes through the shell's bridge, which is
 * the only door and one we hold.
 */

import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import {
  ConsoleDelivery,
  Identity,
  MemoryIdentityStore,
  parseSeedList,
  seedCohort,
} from '@townsquare/identity'
import { CreationStorage, MemoryStorageStore } from '@townsquare/storage'
import { MemorySaveStore, Saves } from '@townsquare/saves'
import { businesses } from '../../../packages/feed/src/data/businesses.js'
import { createNearbyRoutes } from './nearbyRoutes.js'
import { createSavesRoutes } from './savesRoutes.js'
import { createTodayRoutes } from './todayRoutes.js'
import type { TownSquareItem } from './today.js'

/**
 * The scrapers, loaded at runtime and invisible to `tsc`.
 *
 * `packages/feed`'s scrapers are checked under `tsconfig.ported.json`, which
 * turns off `noUncheckedIndexedAccess` for ~149 sites of unguarded regex-match
 * indexing. A static import here would pull all of that into this app's strict
 * graph and the typecheck would fail on code nobody in this change touched.
 *
 * The specifier is a variable rather than a literal so TypeScript does not
 * follow it. That is the whole trick, and it is deliberate: the boundary is the
 * point, and it disappears the day the scrapers are fixed per the debt note in
 * `tsconfig.ported.json`.
 */
const FEED_MODULE = '../../../packages/feed/src/data/index.js'

async function loadItems(): Promise<readonly TownSquareItem[]> {
  const mod = (await import(FEED_MODULE)) as {
    getAllItemsAsync: () => Promise<TownSquareItem[]>
  }
  return mod.getAllItemsAsync()
}
import { loadExampleCreations } from '../../sandbox/src/examples.js'
import { MemoryMcpTokenStore } from '@townsquare/mcp'
import {
  MemoryCreationStore,
  MemoryModerationLogStore,
  MemoryRecordTypeStore,
  MemoryReportStore,
  MemorySubmissionStore,
  Moderation,
  Reports,
  Review,
} from '@townsquare/review'
import { BundleStorePublisher } from '@townsquare/sandbox'
import {
  Contributions,
  Drafts,
  MemoryAttemptLog,
  MemoryContributionStore,
  MemoryDraftStore,
  MemoryRecordStore,
  NoListingOwners,
  NoOrganisations,
  type CorrectionField,
} from '@townsquare/contributions'
import {
  Alerts,
  MemoryAlertPreferenceStore,
  MemoryNoticeStateStore,
  type AuthoredNotice,
} from '@townsquare/civic'
import { sources } from '../../../packages/feed/src/data/sources.js'
import { createConnectRoutes } from './connectRoutes.js'
import { createContributionRoutes } from './contributionRoutes.js'
import { createCivicRoutes } from './civicRoutes.js'
import { createReportRoutes } from './reportRoutes.js'
import { createReviewRoutes } from './reviewRoutes.js'
import { createIdentityRoutes } from './identityRoutes.js'

const PORT = Number(process.env['API_PORT'] ?? 3030)
const APPS_DOMAIN = process.env['APPS_DOMAIN'] ?? 'tsq-apps.localhost'
const SANDBOX_PORT = Number(process.env['SANDBOX_PORT'] ?? 3031)
const SHELL_ORIGIN = process.env['SHELL_ORIGIN'] ?? 'http://townsquare.localhost:5173'
const MCP_URL = process.env['MCP_PUBLIC_URL'] ?? 'http://localhost:8770/mcp'

const TOWN = { id: 'russellville-ar', name: 'Russellville', timezone: 'America/Chicago' }

/** A plain-http shell is development, by definition. Nothing else may assume it. */
const IS_DEV = !SHELL_ORIGIN.startsWith('https://')

/**
 * The act token signing key.
 *
 * Generated per process in development, so restarting invalidates outstanding
 * tokens and the host's refresh path gets exercised constantly rather than
 * only in production. A deployment must supply `ACT_TOKEN_SECRET`; a rotating
 * key across replicas would sign tokens the next replica rejects.
 */
const ACT_SECRET = process.env['ACT_TOKEN_SECRET'] ?? randomBytes(32).toString('base64url')

if (!process.env['ACT_TOKEN_SECRET'] && !IS_DEV) {
  throw new Error('ACT_TOKEN_SECRET is required when the shell origin is https')
}

async function main(): Promise<void> {
  const store = await loadExampleCreations()

  // Identity runs on the memory store until the API is pointed at Postgres.
  // The interface is the same one the Drizzle implementation lands on, so the
  // rules above it do not change when the storage does.
  const identityStore = new MemoryIdentityStore()
  const delivery = new ConsoleDelivery({ shellOrigin: SHELL_ORIGIN })
  const identity = new Identity({ store: identityStore, delivery })

  const seeded = await seedCohort(
    identityStore,
    parseSeedList(process.env['TOWNSQUARE_SEED_COHORT']),
    Date.now(),
  )
  for (const s of seeded) {
    console.log(`seed cohort: ${s.handle} ${s.action}${s.reason ? ` (${s.reason})` : ''}`)
  }

  // Same story as identity: the memory store implements the interface the
  // Drizzle one will, so nothing above it changes when storage moves to
  // Postgres. Restarting the API empties every creation's scratch space.
  const storage = new CreationStorage({ store: new MemoryStorageStore() })

  // Minting an MCP token needs a session, and the MCP service deliberately has
  // no way to read one. So the mint lives here and the MCP service only ever
  // verifies. In development the two processes hold separate memory stores, so
  // a token minted here is not the one `pnpm dev:mcp` prints — see apps/mcp.
  const connectRoutes = createConnectRoutes({
    identity,
    tokens: new MemoryMcpTokenStore(),
    shellOrigin: SHELL_ORIGIN,
    mcpUrl: MCP_URL,
  })

  // The review queue. In development this process holds its own memory copy,
  // so a submission made through `pnpm dev:mcp` is not in this one — in
  // production all three services read the same database.
  const creations = new MemoryCreationStore()
  const publisher = new BundleStorePublisher({
    store,
    origin: {
      appsDomain: APPS_DOMAIN,
      scheme: IS_DEV ? 'http' : 'https',
      ...(IS_DEV ? { port: SANDBOX_PORT } : {}),
    },
    shellOrigins: (process.env['SHELL_ORIGINS'] ?? SHELL_ORIGIN).split(',').map((o) => o.trim()),
  })

  const review = new Review({
    submissions: new MemorySubmissionStore(),
    creations,
    recordTypes: new MemoryRecordTypeStore(),
    publisher,
  })

  const reportStore = new MemoryReportStore()

  const reports = new Reports({
    reports: reportStore,
    targets: {
      /**
       * A creation is reportable if it is in the gallery, which in development
       * means the approved ones *and* the examples loaded at boot. The examples
       * never went through the queue, so they have no row in the creation store
       * — the same seam as the queue itself, and it closes when all three
       * processes read one database. Without the fallback the Report button is a
       * demo of an error message.
       */
      async creationBySlug(_townId, slug) {
        const approved = await creations.bySlug(TOWN.id, slug)
        if (approved) return { id: approved.id, name: approved.name }
        const example = store.get(slug)
        return example ? { id: example.creationId, name: example.name } : null
      },
    },
  })

  const moderation = new Moderation({
    creations,
    publisher,
    reports: reportStore,
    log: new MemoryModerationLogStore(),
  })

  /**
   * Contributing: the other direction, from a resident into the town's record.
   *
   * Memory stores, same as identity, storage, saving and the queue — they land
   * on the interfaces the Drizzle implementations will, so restarting the API
   * empties every proposal and every draft and nothing above them changes when
   * that stops being true.
   *
   * Three of the ports are wired to honest emptiness rather than to a stub with
   * plausible data in it. Nobody is attached to an organisation, because Town
   * Square has no organisation model, so every resident meets the notice gate.
   * Nobody has claimed a listing, so every correction routes to a moderator.
   * Both are the real state of the world, and both change in one line the day
   * they stop being.
   */
  const contributions = new Contributions({
    contributions: new MemoryContributionStore(),
    records: new MemoryRecordStore(),
    attempts: new MemoryAttemptLog(),
    orgs: new NoOrganisations(),
    ownership: new NoListingOwners(),
    listings: {
      /**
       * The value a correction is arguing with, read out of the directory the
       * screen is actually showing.
       *
       * `businesses` is imported by its deep path rather than through
       * `@townsquare/feed`'s barrel, which re-exports the scrapers — see the
       * note on `FEED_MODULE` above. A correction to a listing that has left
       * the directory is refused rather than applied to nothing.
       */
      async current(_townId: string, listingId: string, field: CorrectionField) {
        const listing = businesses.find((b) => b.id === listingId)
        if (!listing) return null
        const label = listing.name ?? listing.title ?? listingId
        // "Closed for good" has no column in the scrape, so the value it is
        // correcting is the absence of one. Empty rather than null, because
        // null here means "no such listing" and that is a different answer.
        if (field === 'closed') return { label, value: '' }
        const value = listing[field]
        return { label, value: typeof value === 'string' ? value : '' }
      },
    },
    alerts: {
      // "A moderator is told" means whatever is wired here, and with no
      // notification system in Town Square yet the honest version is a line in
      // this service's log. Naming it out loud beats a silent no-op that reads
      // like a feature.
      raise: ({ handle, message }) => console.warn(`contribution ladder: ${handle}: ${message}`),
    },
  })

  const drafts = new Drafts({ store: new MemoryDraftStore() })

  const contributionRoutes = createContributionRoutes({
    identity,
    contributions,
    drafts,
    shellOrigin: SHELL_ORIGIN,
    townId: TOWN.id,
    timezone: TOWN.timezone,
  })

  /**
   * Civic: the read side of notices, city hall, and the alert threshold.
   *
   * `sources` comes in by its deep path for the same reason `businesses` does:
   * `@townsquare/feed`'s barrel re-exports the scrapers, and importing it here
   * would drag them into this app's strict typecheck. The registry itself is a
   * plain data file with one type import.
   */
  const civicRoutes = createCivicRoutes({
    identity,
    alerts: new Alerts({ store: new MemoryAlertPreferenceStore() }),
    noticeStates: new MemoryNoticeStateStore(),
    loadItems,
    sourceNames: Object.fromEntries(sources.map((s) => [s.id, s.name])),
    /**
     * The sources that actually produce notices, named for the quiet state.
     *
     * Listed explicitly rather than derived from `sources`, which is every
     * scraper in town including the library's event calendar. On a day with no
     * alerts the screen says what we checked, and that sentence must name the
     * things we genuinely poll for alerts and nothing else.
     */
    noticeSources: ['NWS Little Rock', 'City of Russellville'],
    townName: TOWN.name,
    /**
     * Notices an organisation published through the composer.
     *
     * Empty in development and honestly so: posting one needs an organisation
     * affiliation, and Town Square has no organisation model yet, so every
     * resident meets the gate. The seam closes the day something grants one,
     * and the civic screen inherits those notices without changing here.
     */
    authoredNotices: async (): Promise<readonly AuthoredNotice[]> => [],
    shellOrigin: SHELL_ORIGIN,
    townId: TOWN.id,
  })

  const reviewRoutes = createReviewRoutes({
    identity,
    review,
    reports,
    moderation,
    contributions,
    shellOrigin: SHELL_ORIGIN,
    townId: TOWN.id,
  })

  const reportRoutes = createReportRoutes({
    identity,
    reports,
    shellOrigin: SHELL_ORIGIN,
    townId: TOWN.id,
  })

  const identityRoutes = createIdentityRoutes({
    identity,
    store: identityStore,
    storage,
    creations: () => store.list(),
    shellOrigin: SHELL_ORIGIN,
    townId: TOWN.id,
    actSecret: ACT_SECRET,
    // Handing the sign-in link straight back is a total account takeover, so
    // it exists only where there is no account worth taking.
    ...(IS_DEV
      ? {
          echoChallenge: (email: string) => {
            const echoed = delivery.latestFor(email)
            return echoed ? { url: echoed.url } : null
          },
        }
      : {}),
  })

  // Today reads no cookie and is the same for every resident, so it is the one
  // route in this process that is cacheable and the one that may be warmed
  // before anybody asks for it.
  const todayRoutes = createTodayRoutes({
    town: TOWN,
    loadItems,
    listCreations: () =>
      store.list().map((c) => ({
        slug: c.slug,
        name: c.name,
        tagline: c.manifest.tagline,
        description: c.manifest.description,
        icon: `http://${c.originKey}.${APPS_DOMAIN}:${SANDBOX_PORT}/${c.manifest.icon}`,
        // No author. A manifest may not claim one — see the `author` refusal in
        // `packages/manifest` — and nothing has been through the review queue
        // here to be attributed by the platform. The screen says "a neighbor".
        author: null,
      })),
  })
  todayRoutes.warm()

  // Nearby reads no cookie either, for a reason that is the screen's whole
  // design rather than an optimisation: it hands over the town and the browser
  // ranks it, so a resident's position is never sent anywhere. See `nearby.ts`.
  const nearbyRoutes = createNearbyRoutes({ town: TOWN, loadItems })

  // Saving is the one thing on Yours with a real source. Memory store, same as
  // identity and storage — the interface is the one the Drizzle implementation
  // lands on, so restarting the API empties every resident's list and nothing
  // above it changes when that stops being true.
  const savesRoutes = createSavesRoutes({
    identity,
    saves: new Saves({ store: new MemorySaveStore() }),
    // Ownership is real — `Creation.ownerId` is set at approval — so this is a
    // query rather than a placeholder. It is empty in development because
    // nothing here has been through the review queue, which is the same seam
    // the queue and the moderation list already have.
    listBuilt: async (userId) =>
      (await creations.listForOwner(userId)).map((c) => ({
        slug: c.slug,
        name: c.name,
        tagline: c.tagline,
        status: c.status,
        updatedAt: c.updatedAt,
      })),
    shellOrigin: SHELL_ORIGIN,
    townId: TOWN.id,
  })

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // CORS admits the shell only. Never `*`, and never a bundle origin: a
    // creation reaching this service directly is exactly what the bridge
    // exists to prevent.
    res.setHeader('Access-Control-Allow-Origin', SHELL_ORIGIN)
    res.setHeader('Vary', 'Origin')

    const url = new URL(req.url ?? '/', 'http://localhost')

    // Cookies are for the shell's own routes. A bridge call carries an act
    // token and nothing else, so it is never granted credentialed CORS — a
    // bridge route that somehow read a cookie would be blocked here too.
    if (!url.pathname.startsWith('/api/bridge/')) {
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      res.setHeader('Access-Control-Max-Age', '600')
      res.writeHead(204)
      return res.end()
    }

    const json = (body: unknown, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(body))
    }

    // Anything holding a credential is decided first, and owns its own 404s.
    void identityRoutes(req, res, url)
      .then((handled) => (handled ? true : connectRoutes(req, res, url)))
      .then((handled) => (handled ? true : reviewRoutes(req, res, url)))
      .then((handled) => (handled ? true : reportRoutes(req, res, url)))
      .then((handled) => (handled ? true : contributionRoutes(req, res, url)))
      .then((handled) => (handled ? true : civicRoutes(req, res, url)))
      .then((handled) => (handled ? true : savesRoutes(req, res, url)))
      .then((handled) => (handled ? true : todayRoutes(req, res, url)))
      .then((handled) => (handled ? true : nearbyRoutes(req, res, url)))
      .then((handled) => {
        if (!handled) readRoutes(url, store, json)
      })
  })

  server.listen(PORT, () => {
    console.log(`read api listening on http://localhost:${PORT}/api`)
    if (IS_DEV) console.log('development: sign-in links are printed here and echoed to the shell')
  })
}

function readRoutes(
  url: URL,
  store: Awaited<ReturnType<typeof loadExampleCreations>>,
  json: (body: unknown, status?: number) => void,
): void {
  if (url.pathname === '/api/town') return json(TOWN)

  if (url.pathname === '/api/creations') {
    return json(
      store.list().map((c) => ({
        slug: c.slug,
        name: c.name,
        originKey: c.originKey,
        tagline: c.manifest.tagline,
        description: c.manifest.description,
        tags: c.manifest.tags,
        manifest: c.manifest,
        origin: `http://${c.originKey}.${APPS_DOMAIN}:${SANDBOX_PORT}`,
      })),
    )
  }

  if (url.pathname === '/api/businesses') {
    const limit = Math.min(200, Number(url.searchParams.get('limit') ?? 50) || 50)
    const tag = url.searchParams.get('tag')?.toLowerCase()
    const items = businesses
      .filter(
        (b) =>
          !tag ||
          b.tags?.some((t) => t.toLowerCase().includes(tag)) ||
          b.category?.toLowerCase().includes(tag),
      )
      .slice(0, limit)
      .map((b) => ({
        id: b.id,
        name: b.name,
        category: b.category,
        address: b.address,
        phone: b.phone,
        website: b.website,
        geo: b.geo,
      }))
    return json({ items, nextCursor: null })
  }

  json({ error: 'not_found' }, 404)
}

void main()
