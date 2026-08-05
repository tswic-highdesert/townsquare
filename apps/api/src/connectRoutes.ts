/**
 * `/settings/connect` — where a resident mints the credential their AI tool uses.
 *
 * This lives in the API rather than in the MCP service on purpose. Minting a
 * token requires a *session*, and the MCP service has no cookie parser and no
 * session-reading route by design: it authenticates bearer tokens and nothing
 * else. Putting the mint here keeps that true, and keeps the two credentials on
 * opposite sides of a process boundary — a session can create an MCP token, and
 * an MCP token can never create anything that reads a session.
 *
 * Three routes:
 *
 *   GET    /api/connect/tokens          what you have, never the secrets
 *   POST   /api/connect/tokens          mint one. The plaintext is in this
 *                                       response and nowhere else, ever again
 *   POST   /api/connect/tokens/:id/revoke
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Identity } from '@townsquare/identity'
import { mintToken, type McpTokenStore } from '@townsquare/mcp'
import { originAllowed, readCookie, readFields, sendJson, str } from './http.js'
import { cookieName } from './identityRoutes.js'

export interface ConnectRoutesConfig {
  identity: Identity
  tokens: McpTokenStore
  shellOrigin: string
  /** Public URL of the MCP service, so the response can hand over a config. */
  mcpUrl: string
}

/** A resident with many tokens is a resident who lost track of one. */
const MAX_ACTIVE_TOKENS = 10

export function createConnectRoutes(cfg: ConnectRoutesConfig) {
  const SESSION_COOKIE = cookieName(cfg.shellOrigin)

  return async function handle(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<boolean> {
    const path = url.pathname
    if (!path.startsWith('/api/connect/')) return false

    const method = req.method ?? 'GET'
    if (method !== 'GET' && !originAllowed(req, cfg.shellOrigin)) {
      sendJson(res, { error: 'forbidden', message: 'Bad origin.' }, 403)
      return true
    }

    const user = await cfg.identity.resolveSession(readCookie(req, SESSION_COOKIE))
    if (!user) {
      sendJson(res, { error: 'unauthenticated', message: 'Sign in first.' }, 401)
      return true
    }

    if (path === '/api/connect/tokens' && method === 'GET') {
      const tokens = await cfg.tokens.tokensForUser(user.id)
      sendJson(res, { tokens: tokens.map(publicView), mcp_url: cfg.mcpUrl })
      return true
    }

    if (path === '/api/connect/tokens' && method === 'POST') {
      const active = (await cfg.tokens.tokensForUser(user.id)).filter((t) => t.revokedAt === null)
      if (active.length >= MAX_ACTIVE_TOKENS) {
        sendJson(
          res,
          {
            error: 'refused',
            message: `You have ${active.length} active tokens, which is the limit. Revoke one first.`,
          },
          409,
        )
        return true
      }

      const label = str(await readFields(req), 'label') || 'my laptop'
      const minted = await mintToken(cfg.tokens, { userId: user.id, label }, Date.now())

      sendJson(res, {
        token: minted.token,
        // Said in the payload as well as the UI, because whoever writes the UI
        // next should not have to discover it from the store implementation.
        warning: 'This is the only time this token is shown. It cannot be recovered.',
        record: publicView(minted.record),
        claude_code_command: `claude mcp add --transport http townsquare ${cfg.mcpUrl} --header "Authorization: Bearer ${minted.token}"`,
      })
      return true
    }

    const revoke = /^\/api\/connect\/tokens\/([A-Za-z0-9_-]{1,64})\/revoke$/.exec(path)
    if (revoke && method === 'POST') {
      const id = revoke[1]!
      const token = await cfg.tokens.tokenById(id)
      // Someone else's token id is answered exactly like a token that does not
      // exist. Anything else is a probe for which ids are real.
      if (!token || token.userId !== user.id) {
        sendJson(res, { error: 'not_found' }, 404)
        return true
      }
      await cfg.tokens.revokeToken(id, Date.now())
      sendJson(res, { revoked: id })
      return true
    }

    sendJson(res, { error: 'not_found' }, 404)
    return true
  }
}

/** Everything about a token except the part that makes it work. */
function publicView(token: {
  id: string
  label: string
  createdAt: number
  expiresAt: number
  lastUsedAt: number | null
  revokedAt: number | null
}) {
  return {
    id: token.id,
    label: token.label,
    created_at: new Date(token.createdAt).toISOString(),
    expires_at: new Date(token.expiresAt).toISOString(),
    last_used_at: token.lastUsedAt ? new Date(token.lastUsedAt).toISOString() : null,
    revoked: token.revokedAt !== null,
  }
}
