/**
 * Process lifecycle, and the boot guard.
 *
 * Separated from the handler for the reason StateLeg separated its own: an
 * entrypoint that binds a port on import is a module a test can only run once,
 * and the claim worth testing here is that this service refuses to start when
 * it would teach residents a contract that does not exist.
 *
 * **The docs artifact is a fail-closed boot dependency.** The MCP's whole job is
 * teaching an LLM the SDK. If the docs and the SDK ever disagree, every creation
 * generated in that window is written against a contract nobody implements — and
 * unlike a normal bug it lands in code residents have already forked. Docs skew
 * on this service is as dangerous as an unauthenticated endpoint, so it gets the
 * same treatment: the process does not come up.
 */

import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'

import { METHODS, SDK_DOCS } from '@townsquare/sdk'
import { createMcpHandler, mcpPath, mcpPort, SERVER_INFO } from './handler.js'
import { assertToolTable, TOOL_DEFS } from './tools.js'
import type { McpContext } from './context.js'

export class McpBootError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpBootError'
  }
}

/**
 * Everything that must be true before a port is bound.
 *
 * Thrown, never exited: a library function that calls `process.exit` takes the
 * whole process down with it, which in a vitest worker means the run dies mid
 * file with no assertion output. A boot guard that cannot be tested is a boot
 * guard nobody keeps.
 */
/** The shape the guard needs, structurally, so a test can hand it a fake. */
export interface DocsArtifact {
  sections: Readonly<Record<string, string>>
  contentSha256: string
  symbols: ReadonlyArray<{ method: string }>
}

export function assertBootable(
  // Injectable only so the failure paths are testable. Nothing in the service
  // ever passes anything: the whole point is that it checks what it imports.
  docs: DocsArtifact = SDK_DOCS,
  methods: ReadonlyArray<{ method: string }> = METHODS,
): void {
  assertToolTable()

  // 1. The artifact has not been hand-edited. Recomputed exactly the way
  //    `packages/sdk/scripts/generate.ts` computes it.
  const recomputed = createHash('sha256').update(JSON.stringify(docs.sections)).digest('hex')
  if (recomputed !== docs.contentSha256) {
    throw new McpBootError(
      `The SDK docs artifact has been edited by hand: its content hashes to ${recomputed} but it ` +
        `claims ${docs.contentSha256}. This service teaches that artifact to language models, ` +
        `so it refuses to serve one nobody generated. Run \`pnpm gen\`.`,
    )
  }

  // 2. The artifact describes the SDK that is actually installed. The hash above
  //    cannot catch this: a stale-but-internally-consistent artifact hashes
  //    perfectly and still documents methods this build does not have.
  const documented: string[] = docs.symbols.map((s) => s.method).sort()
  const live: string[] = methods.map((m) => m.method).sort()
  if (documented.join('\n') !== live.join('\n')) {
    const onlyDocs = documented.filter((m) => !live.includes(m))
    const onlySdk = live.filter((m) => !documented.includes(m))
    throw new McpBootError(
      `The SDK docs artifact does not match the installed SDK.` +
        (onlyDocs.length ? ` Documented but missing: ${onlyDocs.join(', ')}.` : '') +
        (onlySdk.length ? ` Present but undocumented: ${onlySdk.join(', ')}.` : '') +
        ` Run \`pnpm gen\`.`,
    )
  }
}

export const MCP_SHUTDOWN_TIMEOUT_MS = 10_000

export interface StartMcpOptions {
  ctx: McpContext
  /** Pass 0 for an ephemeral port, which is what a test wants. */
  port?: number
  path?: string
  /** Off in tests: process-wide signal handlers would tear down the runner. */
  handleSignals?: boolean
}

export interface StartedMcp {
  port: number
  path: string
  server: Server
  shutdown(): Promise<void>
}

export async function startMcpServer(options: StartMcpOptions): Promise<StartedMcp> {
  assertBootable()

  const path = options.path ?? mcpPath()
  const requestedPort = options.port ?? mcpPort()
  const handler = createMcpHandler({ ctx: options.ctx, path })
  const server = createServer((req, res) => {
    void handler(req, res)
  })

  // Registered before listen(), or an immediate EADDRINUSE races the listener
  // and throws as an unhandled 'error' event before anything is watching.
  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error(`[townsquare-mcp] server error on :${requestedPort} (${err.code ?? '?'}):`, err.message)
  })

  await new Promise<void>((resolve, reject) => {
    const onListenError = (err: Error) => reject(err)
    server.once('error', onListenError)
    server.listen(requestedPort, () => {
      server.removeListener('error', onListenError)
      resolve()
    })
  })

  const address = server.address()
  const port = address && typeof address !== 'string' ? address.port : requestedPort

  console.error(
    `[townsquare-mcp] ${SERVER_INFO.name} v${SERVER_INFO.version} on :${port}${path} — ` +
      `${TOOL_DEFS.length} tools, SDK ${SDK_DOCS.sdkMajor}, docs ${SDK_DOCS.contentSha256.slice(0, 12)}`,
  )

  let shuttingDown: Promise<void> | null = null
  const shutdown = (): Promise<void> => {
    if (shuttingDown) return shuttingDown
    shuttingDown = (async () => {
      const closed = new Promise<void>((resolve) => server.close(() => resolve()))
      // Keep-alive sockets hold close() open indefinitely: idle connections are
      // cut, in-flight requests are not.
      server.closeIdleConnections()
      await closed
    })()
    return shuttingDown
  }

  if (options.handleSignals ?? true) {
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, () => {
        console.error(`[townsquare-mcp] ${signal} received — draining.`)
        const forced = setTimeout(() => process.exit(0), MCP_SHUTDOWN_TIMEOUT_MS)
        forced.unref()
        void shutdown().finally(() => {
          clearTimeout(forced)
          process.exit(0)
        })
      })
    }
  }

  return { port, path, server, shutdown }
}
