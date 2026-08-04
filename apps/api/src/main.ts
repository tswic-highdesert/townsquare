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
import { businesses } from '../../../packages/feed/src/data/businesses.js'
import { loadExampleCreations } from '../../sandbox/src/examples.js'
import { createIdentityRoutes } from './identityRoutes.js'

const PORT = Number(process.env['API_PORT'] ?? 3030)
const APPS_DOMAIN = process.env['APPS_DOMAIN'] ?? 'tsq-apps.localhost'
const SANDBOX_PORT = Number(process.env['SANDBOX_PORT'] ?? 3031)
const SHELL_ORIGIN = process.env['SHELL_ORIGIN'] ?? 'http://townsquare.localhost:5173'

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

  const identityRoutes = createIdentityRoutes({
    identity,
    store: identityStore,
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
    void identityRoutes(req, res, url).then((handled) => {
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
