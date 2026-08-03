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

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { businesses } from '../../../packages/feed/src/data/businesses.js'
import { loadExampleCreations } from '../../sandbox/src/examples.js'

const PORT = Number(process.env['API_PORT'] ?? 3030)
const APPS_DOMAIN = process.env['APPS_DOMAIN'] ?? 'tsq-apps.localhost'
const SANDBOX_PORT = Number(process.env['SANDBOX_PORT'] ?? 3031)
const SHELL_ORIGIN = process.env['SHELL_ORIGIN'] ?? 'http://townsquare.localhost:5173'

const TOWN = { id: 'russellville-ar', name: 'Russellville', timezone: 'America/Chicago' }

async function main(): Promise<void> {
  const store = await loadExampleCreations()

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // CORS admits the shell only. Never `*`, and never a bundle origin: a
    // creation reaching this service directly is exactly what the bridge
    // exists to prevent.
    res.setHeader('Access-Control-Allow-Origin', SHELL_ORIGIN)
    res.setHeader('Vary', 'Origin')

    const url = new URL(req.url ?? '/', 'http://localhost')
    const json = (body: unknown, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(body))
    }

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
  })

  server.listen(PORT, () => {
    console.log(`read api listening on http://localhost:${PORT}/api`)
  })
}

void main()
