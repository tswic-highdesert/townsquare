/**
 * The MCP service, as an HTTP request listener.
 *
 * Stateless per request: a fresh `McpServer` and transport each time, no session
 * store, nothing held between calls. That is not asceticism, it is what lets
 * this run as its own Railway service with more than one replica and no sticky
 * routing.
 *
 * The pipeline order is fixed and the first step is the important one:
 *
 *     authenticate → gate → execute
 *
 * Authentication happens **before an `McpServer` or a transport is
 * constructed**, so an unauthenticated caller cannot reach a tool, cannot
 * enumerate the tool list, and cannot even complete `initialize`. A tool list is
 * a map of a platform's capabilities; handing one to an anonymous caller is a
 * small leak that costs nothing to avoid.
 *
 * Two routes and no more:
 *
 *   `POST /mcp`             the protocol. Bearer `ts_live_…`.
 *   `POST /upload/:draftId` raw bytes for one declared file. Bearer is the
 *                           one-time upload ticket, *not* the resident's
 *                           credential — a ticket that leaks buys an attacker
 *                           the ability to write a file into one draft that the
 *                           inventory already pinned by hash, which is nothing.
 *
 * Plus `/health`, which is honest about what it means: this service holds no
 * database of its own in the memory-store configuration, so its health check
 * says "the process is up and the docs artifact matched at boot" and does not
 * pretend to know more.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'

import { BUNDLE_LIMITS } from '@townsquare/bundle'
import type { McpContext, Principal } from './context.js'
import { acceptFile, missingPaths } from './drafts.js'
import { TOOL_DEFS, ToolError, runTool } from './tools.js'
import { authenticateToken, shouldTouch, type AuthFailure } from './tokens.js'

export const DEFAULT_MCP_PORT = 8770
export const DEFAULT_MCP_PATH = '/mcp'

export const SERVER_INFO = { name: 'townsquare', version: '1.0.0' } as const

export function mcpPort(): number {
  return Number(process.env['TOWNSQUARE_MCP_PORT'] ?? DEFAULT_MCP_PORT)
}

export function mcpPath(): string {
  return process.env['TOWNSQUARE_MCP_PATH'] ?? DEFAULT_MCP_PATH
}

export const SERVER_INSTRUCTIONS = `You are helping a resident build a Town Square creation: a
sandboxed static mini-app that runs inside their town's Town Square.

Start with \`whoami\`, then \`get_sdk_docs\`. Before defining any record type, call
\`list_record_types\` and reuse an existing one if it fits.

There is no build step, no npm and no CDN. Everything the app loads must be a file in the bundle.
Never paste file contents into a tool call: declare them with \`begin_upload\` and POST the bytes
with the shell command it returns.

The loop is: scaffold → write files → begin_upload → upload → validate → preview → submit.
Preview runs in the real sandbox, so what works there works after approval. Submitting requires
being a verified resident and every version is reviewed by a human.`

/**
 * What an authentication failure is allowed to say.
 *
 * A resident who pasted a token wrong needs to know that; an attacker probing
 * for valid ids must learn nothing. So `unknown` (no such token, or a wrong
 * secret) is deliberately one message covering both, while the states a
 * legitimate holder can actually be in — expired, revoked — are named, because
 * "your token expired" is not a secret and "your credential is invalid" wastes
 * an afternoon.
 */
const AUTH_MESSAGES: Record<AuthFailure, string> = {
  missing: 'This endpoint needs a Town Square token. Add `Authorization: Bearer ts_live_...`.',
  malformed: 'That does not look like a Town Square token. They start with `ts_live_`.',
  unknown: 'That token is not valid.',
  revoked: 'That token was revoked. Mint a new one at /settings/connect.',
  expired: 'That token has expired. Mint a new one at /settings/connect.',
  no_such_user: 'The account behind that token no longer exists.',
}

export interface HandlerOptions {
  ctx: McpContext
  path?: string
}

function applyCors(res: ServerResponse): void {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET, HEAD, POST, OPTIONS')
  res.setHeader(
    'access-control-allow-headers',
    'content-type, authorization, mcp-protocol-version, mcp-session-id, last-event-id',
  )
  res.setHeader('access-control-expose-headers', 'mcp-session-id, www-authenticate')
  res.setHeader('access-control-max-age', '86400')
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/**
 * Make a sentence safe to put in a header value.
 *
 * Header values are latin-1 and node throws outright on anything else, so a
 * single typographic ellipsis in a message turns a clean 401 into an uncaught
 * `ERR_INVALID_CHAR` and a hung socket. Quotes go too, since the value is
 * already inside a quoted `error_description`.
 */
function headerSafe(message: string): string {
  return message.replace(/[^\x20-\x7e]/g, '').replace(/"/g, "'")
}

function bearer(req: IncomingMessage): string | undefined {
  const raw = req.headers['authorization']
  if (typeof raw !== 'string') return undefined
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim())
  return match?.[1]
}

/**
 * Resolve a credential all the way to a person.
 *
 * The token names a user id; the user's *current* handle, role and verification
 * are read fresh every request. A token minted before someone was verified must
 * work the moment they are, and a token minted while they were verified must
 * stop granting submission the moment a vouch is revoked. Baking either into the
 * credential would make revocation a lie.
 */
async function authenticate(
  ctx: McpContext,
  req: IncomingMessage,
): Promise<{ ok: true; principal: Principal } | { ok: false; reason: AuthFailure }> {
  const now = ctx.now()
  const result = await authenticateToken(ctx.tokens, bearer(req), now)
  if (!result.ok) return result

  const user = await ctx.users.userById(result.token.userId)
  if (!user) return { ok: false, reason: 'no_such_user' }

  if (shouldTouch(result.token, now)) {
    // Best effort. A failed bookkeeping write must not fail a build.
    void ctx.tokens.touchToken(result.token.id, now).catch(() => {})
  }

  return {
    ok: true,
    principal: {
      userId: user.id,
      handle: user.handle,
      verified: user.verifiedResident,
      role: user.role,
      tokenId: result.token.id,
    },
  }
}

/** Read a request body with a hard ceiling, enforced while streaming. */
async function readBody(req: IncomingMessage, limit: number): Promise<Uint8Array | null> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    total += buf.byteLength
    // Checked per chunk, not after: a ceiling applied to an already-buffered
    // body is a ceiling that has already been exceeded.
    if (total > limit) return null
    chunks.push(buf)
  }
  return new Uint8Array(Buffer.concat(chunks))
}

/**
 * `POST /upload/:draftId?path=…`
 *
 * One file, raw bytes. Everything that decides whether it may be stored lives in
 * `acceptFile`, which is pure — this function's whole job is turning HTTP into
 * arguments and a verdict back into a status code.
 */
async function handleUpload(
  ctx: McpContext,
  req: IncomingMessage,
  res: ServerResponse,
  draftId: string,
  url: URL,
): Promise<void> {
  const draft = await ctx.drafts.draftById(draftId)
  // Same answer for "no such draft" and "wrong ticket": whoever is holding a
  // bad ticket does not get to learn which drafts exist.
  if (!draft) {
    return sendJson(res, 401, { error: 'upload ticket is missing or wrong' })
  }

  const path = url.searchParams.get('path')
  if (!path) {
    return sendJson(res, 400, { error: 'the `path` query parameter is required' })
  }

  const bytes = await readBody(req, BUNDLE_LIMITS.fileBytes + 1)
  if (bytes === null) {
    return sendJson(res, 413, {
      error: `a single file may not exceed ${BUNDLE_LIMITS.fileBytes} bytes`,
    })
  }

  const verdict = acceptFile(draft, bearer(req), path, bytes, ctx.now())
  if (!verdict.ok) return sendJson(res, verdict.status, { error: verdict.reason })

  await ctx.drafts.putFile(draft.id, path, bytes, ctx.now())

  const fresh = await ctx.drafts.draftById(draft.id)
  const missing = fresh ? missingPaths(fresh) : []
  if (fresh && missing.length === 0 && fresh.status === 'collecting') {
    await ctx.drafts.updateDraft(fresh.id, { status: 'complete' }, ctx.now())
  }
  return sendJson(res, 200, {
    stored: path,
    bytes: bytes.byteLength,
    remaining: missing.length,
  })
}

/**
 * Build the per-request MCP server.
 *
 * The gate is applied here, once, around every handler — a tool cannot forget to
 * check because a tool never checks. `verified` is the only requirement any tool
 * declares, and the failure message names the remedy rather than the rule, since
 * "you are not verified" without "here is how vouching works" is a dead end.
 */
function buildServer(ctx: McpContext, principal: Principal): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS })

  for (const tool of TOOL_DEFS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { readOnlyHint: tool.readOnly },
      },
      async (args: Record<string, unknown>) => {
        try {
          // Through `runTool`, never `tool.handler`: the requirement gate lives
          // there, and calling the handler directly here would route around it.
          const result = await runTool(ctx, principal, tool.name, args ?? {})
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          }
        } catch (err) {
          // A ToolError is an answer: the caller asked for something that cannot
          // happen and the text says why. Anything else is ours, and its message
          // is not shown, because an internal error message is where stack
          // traces and connection strings escape.
          if (err instanceof ToolError) {
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: err.hint ? `${err.message}\n\n${err.hint}` : err.message,
                },
              ],
            }
          }
          console.error(`[townsquare-mcp] ${tool.name} failed:`, err)
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'Town Square hit an internal error running that. Nothing was changed.',
              },
            ],
          }
        }
      },
    )
  }

  return server
}

export function createMcpHandler(options: HandlerOptions) {
  const { ctx } = options
  const path = options.path ?? DEFAULT_MCP_PATH

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    applyCors(res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', 'http://localhost')

    if (url.pathname === '/health') {
      return sendJson(res, 200, { status: 'ok', service: SERVER_INFO.name, tools: TOOL_DEFS.length })
    }

    const upload = /^\/upload\/([A-Za-z0-9_-]{1,64})$/.exec(url.pathname)
    if (upload) {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST')
        return sendJson(res, 405, { error: 'use POST' })
      }
      try {
        return await handleUpload(ctx, req, res, upload[1]!, url)
      } catch (err) {
        console.error('[townsquare-mcp] upload failed:', err)
        return sendJson(res, 500, { error: 'upload failed' })
      }
    }

    if (url.pathname !== path) {
      return sendJson(res, 404, { error: 'not found' })
    }
    if (req.method !== 'POST') {
      // No SSE endpoint: this server is stateless and has nothing to push.
      res.setHeader('allow', 'POST')
      return sendJson(res, 405, { error: 'this MCP endpoint is POST only' })
    }

    const auth = await authenticate(ctx, req)
    if (!auth.ok) {
      res.setHeader(
        'www-authenticate',
        `Bearer realm="townsquare", error="invalid_token", error_description="${headerSafe(AUTH_MESSAGES[auth.reason])}"`,
      )
      // A JSON-RPC shaped error, because the caller is an MCP client and a bare
      // HTTP body is something it will show as "unknown error".
      return sendJson(res, 401, {
        jsonrpc: '2.0',
        error: { code: -32001, message: AUTH_MESSAGES[auth.reason] },
        id: null,
      })
    }

    const server = buildServer(ctx, auth.principal)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

    res.on('close', () => {
      void transport.close()
      void server.close()
    })

    try {
      await server.connect(transport)
      await transport.handleRequest(req, res)
    } catch (err) {
      console.error('[townsquare-mcp] transport error:', err)
      if (!res.headersSent) {
        sendJson(res, 500, {
          jsonrpc: '2.0',
          error: { code: -32603, message: 'internal error' },
          id: null,
        })
      }
    }
  }
}

/** Re-exported so a caller building a context does not need a second import. */
export { z }
