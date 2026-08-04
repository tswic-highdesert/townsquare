/**
 * `/api/bridge/storage`, the server half of `storage.*`.
 *
 * Reached only from the bridge section of `identityRoutes.ts`, after an act
 * token has been verified, and handed the token's claims rather than the
 * request. That is deliberate: this file has no access to a cookie, a header
 * or a query parameter that could name a creation or a user, so the scope it
 * writes under is structurally the token's and cannot be anything else.
 *
 * Threat model rows 17 and 18 live here.
 */

import type { ServerResponse } from 'node:http'
import type { ActClaims } from '@townsquare/identity'
import type { CreationStorage } from '@townsquare/storage'
import { sendJson } from './http.js'

const STATUS: Record<string, number> = {
  invalid_request: 400,
  too_large: 413,
  unauthenticated: 401,
  permission_denied: 403,
}

function fail(res: ServerResponse, code: string, message: string, extra?: unknown): void {
  sendJson(res, { error: code, message, details: extra }, STATUS[code] ?? 400)
}

export interface StorageRequest {
  method: string
  claims: ActClaims
  query: URLSearchParams
  body: Record<string, unknown> | null
}

/**
 * Handle a storage call.
 *
 * The two gates come first and in this order: the creation must have declared
 * storage, and somebody must be signed in. The host checked the first one too,
 * from the same claims — that check is a fast error message for the builder,
 * and this one is the boundary.
 */
export async function handleStorage(
  storage: CreationStorage,
  res: ServerResponse,
  req: StorageRequest,
): Promise<void> {
  const { claims } = req

  if (!claims.gr.storage) {
    return fail(res, 'permission_denied', 'This creation did not declare `permissions.storage`.')
  }
  if (claims.sub === null) {
    // Distinct from permission_denied on purpose. The app is allowed; there is
    // simply nobody to store against, and telling a builder otherwise sends
    // them to edit a manifest that was already right.
    return fail(res, 'unauthenticated', 'Nobody is signed in, so there is no storage.')
  }

  const scope = { creationId: claims.cre, userId: claims.sub }

  if (req.method === 'GET') {
    const result = await storage.get(scope, req.query.get('key'))
    if (!result.ok) return fail(res, result.code, result.message)
    // `undefined` is not JSON, so an unset key is reported as an explicit
    // absence and the host turns it back into `undefined` for the guest.
    return sendJson(res, { found: result.found, value: result.found ? result.value : null })
  }

  if (req.method === 'PUT') {
    const body = req.body
    if (!body || typeof body['key'] !== 'string') {
      return fail(res, 'invalid_request', 'A storage key is required.')
    }

    // An absent `value` property is a removal. The guest reaches this by
    // calling `set(key, undefined)`; `undefined` survives the structured clone
    // across the port and is dropped from the JSON on this hop, so the absence
    // is the signal rather than a magic value that collides with a stored one.
    const value = 'value' in body ? body['value'] : undefined
    const result = await storage.set(scope, body['key'], value)
    if (!result.ok) return fail(res, result.code, result.message, 'usage' in result ? result.usage : undefined)

    return sendJson(res, { usage: result.usage })
  }

  fail(res, 'invalid_request', `Unsupported method: ${req.method}`)
}
