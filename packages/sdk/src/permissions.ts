/**
 * Host-side permission enforcement.
 *
 * This is the boundary. The guest holds an advisory copy of its own grants so
 * the SDK can fail fast with a readable message, but nothing on the guest side
 * is trusted: a hand-written port message that skips the SDK entirely lands
 * here and is checked exactly the same way.
 *
 * Rules are derived from the method table rather than written twice, so a new
 * method cannot be added without declaring what it requires.
 */

import type { Manifest } from '@townsquare/manifest'
import { wireError, type WireError } from '@townsquare/shared'
import { METHOD_MAP, type MethodDef, type Requirement } from './methods.js'

export interface ActingUser {
  handle: string
  verified: boolean
}

export interface CheckContext {
  manifest: Manifest
  /** null when nobody is signed in, which is the common case. */
  user: ActingUser | null
}

export type CheckResult = { ok: true } | { ok: false; error: WireError }

const OK: CheckResult = { ok: true }

/**
 * Pull the record type out of the declared argument position.
 *
 * Params arrive as either a positional tuple or a lone value, so this handles
 * both. A non-string in the type position is a malformed call, not a permission
 * failure, and the distinction matters: one is a bug in the app and the other is
 * a missing declaration.
 */
function recordTypeArg(params: unknown, index: number): string | null {
  const v = Array.isArray(params) ? params[index] : index === 0 ? params : undefined
  return typeof v === 'string' && v.length > 0 ? v : null
}

function checkRequirement(req: Requirement, params: unknown, ctx: CheckContext): CheckResult {
  const { manifest, user } = ctx

  switch (req.kind) {
    case 'none':
      return OK

    case 'identity':
      if (manifest.permissions.identity !== 'handle') {
        return {
          ok: false,
          error: wireError(
            'permission_denied',
            'This creation did not declare `permissions.identity: "handle"`.',
          ),
        }
      }
      return OK

    case 'storage':
      if (!manifest.permissions.storage) {
        return {
          ok: false,
          error: wireError('permission_denied', 'This creation did not declare `permissions.storage`.'),
        }
      }
      // Storage is per user, so there is nowhere to put it for an anonymous
      // visitor. Distinct from permission_denied on purpose: the app is allowed,
      // there is simply no one to store against.
      if (!user) {
        return {
          ok: false,
          error: wireError('unauthenticated', 'Nobody is signed in, so there is no storage to read or write.'),
        }
      }
      return OK

    case 'recordRead': {
      const type = recordTypeArg(params, req.typeArg)
      if (!type) {
        return { ok: false, error: wireError('invalid_request', 'A record type is required.') }
      }
      // A declared write implies read: an app that can change a record can
      // obviously see it, and requiring both would be noise in the manifest.
      const allowed =
        manifest.permissions.read.includes(type) || manifest.permissions.write.includes(type)
      if (!allowed) {
        return {
          ok: false,
          error: wireError(
            'permission_denied',
            `This creation did not declare "${type}" under \`permissions.read\`.`,
          ),
        }
      }
      return OK
    }

    case 'recordWrite': {
      const type = recordTypeArg(params, req.typeArg)
      if (!type) {
        return { ok: false, error: wireError('invalid_request', 'A record type is required.') }
      }
      if (!manifest.permissions.write.includes(type)) {
        return {
          ok: false,
          error: wireError(
            'permission_denied',
            `This creation did not declare "${type}" under \`permissions.write\`.`,
          ),
        }
      }
      // Checked after the declaration, so an app that never had permission does
      // not get told about verification. Order here is a small information-leak
      // decision, not an accident.
      if (!user) {
        return {
          ok: false,
          error: wireError('unauthenticated', 'Sign in to contribute to the town.'),
        }
      }
      if (!user.verified) {
        return {
          ok: false,
          error: wireError(
            'not_verified',
            'Only verified residents can contribute. Ask a verified resident to vouch for you.',
          ),
        }
      }
      return OK
    }
  }
}

/**
 * The single gate every inbound call passes through.
 *
 * Order is deliberate: an unknown method is rejected before anything reads its
 * params, and permission is decided before the params schema runs, so probing a
 * capability you were never granted cannot be used to learn about its shape.
 */
export function checkCall(method: string, params: unknown, ctx: CheckContext): CheckResult {
  const def: MethodDef | undefined = METHOD_MAP.get(method)
  if (!def) {
    return { ok: false, error: wireError('invalid_request', `Unknown method: ${method}`) }
  }

  const permitted = checkRequirement(def.requires, params, ctx)
  if (!permitted.ok) return permitted

  const parsed = def.params.safeParse(params)
  if (!parsed.success) {
    return {
      ok: false,
      error: wireError('invalid_request', `Invalid params for ${method}`, {
        details: parsed.error.issues.map((i) => ({
          path: i.path.join('.') || '(root)',
          message: i.message,
        })),
      }),
    }
  }

  return OK
}

/**
 * The advisory grants handed to the guest at handshake.
 *
 * Everything here is public knowledge from the creation's own manifest, so
 * sending it leaks nothing. It exists purely so the SDK can throw a good error
 * synchronously instead of after a round trip.
 */
export function advisoryGrants(manifest: Manifest): {
  identity: 'none' | 'handle'
  read: string[]
  write: string[]
  storage: boolean
} {
  return {
    identity: manifest.permissions.identity,
    read: [...new Set([...manifest.permissions.read, ...manifest.permissions.write])],
    write: [...manifest.permissions.write],
    storage: manifest.permissions.storage,
  }
}
