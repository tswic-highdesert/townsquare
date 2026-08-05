/**
 * The MCP service. Its own process, and in production its own Railway service.
 *
 * Separate from the API for the same reason the sandbox is: this is the surface
 * a resident points an autonomous agent at, and an agent is a client that will
 * call every tool it can see as fast as it can see them. Giving it its own
 * process means its load, its restarts and its blast radius are its own.
 *
 * **On development state.** Like `apps/api` and `apps/sandbox`, this process
 * runs on memory stores until the stack is pointed at Postgres, and memory does
 * not cross a process boundary. So in development this process seeds its own
 * residents from `TOWNSQUARE_SEED_COHORT` and prints a ready-to-paste token at
 * boot, exactly the way `pnpm dev:api` prints sign-in links. In production all
 * three processes read the same database and the token comes from
 * `/settings/connect` in the shell, which is the only place that mints one.
 */

import { MemoryIdentityStore, parseSeedList, seedCohort } from '@townsquare/identity'
import {
  BundleStoreCatalogue,
  MemoryDraftStore,
  MemoryMcpTokenStore,
  MemoryReviewQueue,
  SandboxPublisher,
  StaticRecordTypeRegistry,
  StaticTownReader,
  mintToken,
  startMcpServer,
  type McpContext,
} from '@townsquare/mcp'
import { businesses } from '../../../packages/feed/src/data/businesses.js'
import { loadExampleCreations } from '../../sandbox/src/examples.js'

const PORT = Number(process.env['TOWNSQUARE_MCP_PORT'] ?? 8770)
const APPS_DOMAIN = process.env['APPS_DOMAIN'] ?? 'tsq-apps.localhost'
const SANDBOX_PORT = Number(process.env['SANDBOX_PORT'] ?? 3031)
const SHELL_ORIGIN = process.env['SHELL_ORIGIN'] ?? 'http://townsquare.localhost:5173'

/** A plain-http shell is development, by definition. Nothing else may assume it. */
const IS_DEV = !SHELL_ORIGIN.startsWith('https://')

/**
 * The URL residents' agents reach this service on.
 *
 * Load-bearing rather than cosmetic: it is baked into every upload ticket, so a
 * wrong value produces tickets that point at a host the agent cannot reach, and
 * the failure shows up as a curl error in someone else's terminal. Required in
 * production for exactly that reason.
 */
const PUBLIC_URL = process.env['MCP_PUBLIC_URL'] ?? `http://localhost:${PORT}`
if (!process.env['MCP_PUBLIC_URL'] && !IS_DEV) {
  throw new Error('MCP_PUBLIC_URL is required: upload tickets are built from it')
}

const TOWN = { id: 'russellville-ar', name: 'Russellville', timezone: 'America/Chicago' }

async function main(): Promise<void> {
  const store = await loadExampleCreations()

  const identityStore = new MemoryIdentityStore()
  const seeded = await seedCohort(
    identityStore,
    parseSeedList(process.env['TOWNSQUARE_SEED_COHORT']),
    Date.now(),
  )
  for (const s of seeded) console.log(`seed cohort: ${s.handle} ${s.action}`)

  const tokens = new MemoryMcpTokenStore()

  const ctx: McpContext = {
    now: () => Date.now(),
    tokens,
    users: identityStore,
    drafts: new MemoryDraftStore(),
    town: new StaticTownReader({ info: TOWN, items: [], businesses: [...businesses] }),
    creations: new BundleStoreCatalogue(store),
    recordTypes: new StaticRecordTypeRegistry(),
    publisher: new SandboxPublisher({
      store,
      origin: { appsDomain: APPS_DOMAIN, scheme: IS_DEV ? 'http' : 'https', ...(IS_DEV ? { port: SANDBOX_PORT } : {}) },
      shellOrigins: (process.env['SHELL_ORIGINS'] ?? SHELL_ORIGIN).split(',').map((o) => o.trim()),
    }),
    review: new MemoryReviewQueue(),
    publicUrl: PUBLIC_URL,
    shellOrigin: SHELL_ORIGIN,
  }

  const started = await startMcpServer({ ctx, port: PORT })

  // Development only, and gated on the same plain-http check as the API's
  // echoed sign-in links. Printing a working credential to a terminal is a
  // convenience exactly as long as nobody else can read the terminal.
  if (IS_DEV) {
    const first = seeded[0]
    if (first) {
      const user = await identityStore.userByHandle(first.handle)
      if (user) {
        const minted = await mintToken(tokens, { userId: user.id, label: 'dev' }, Date.now())
        console.log(
          `\ndevelopment token for @${user.handle}:\n\n` +
            `  claude mcp add --transport http townsquare ${PUBLIC_URL}${started.path} \\\n` +
            `    --header "Authorization: Bearer ${minted.token}"\n`,
        )
      }
    } else {
      console.log(
        '\nno seeded residents, so no development token was minted.\n' +
          "  TOWNSQUARE_SEED_COHORT='tswic:tal@example.com:admin' pnpm dev:mcp\n",
      )
    }
  }
}

void main()
