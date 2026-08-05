/**
 * Drafts, and how a bundle's bytes get here.
 *
 * **Bundles never travel through the model's context.** A vendored copy of
 * Leaflet is ~150KB of minified JavaScript, and asking a language model to
 * reproduce it byte-exact is asking it to be a lossy file-copy utility on the
 * one class of file where lossiness is a security bug rather than a typo. It is
 * also a spectacular waste of a context window.
 *
 * So the transfer is out of band and the model only ever handles metadata:
 *
 *   1. the agent calls `begin_upload` with an **inventory** — every path, its
 *      sha256, and its byte length. This is a declaration, made before a single
 *      byte moves.
 *   2. the server returns a one-time upload ticket. The agent (which is sitting
 *      in a shell) POSTs each file's raw bytes.
 *   3. the server hashes what actually arrived and refuses anything that does
 *      not match the declaration, byte for byte, path for path.
 *
 * That inventory is not bookkeeping. It is what makes "everything is vendored"
 * *enforceable* rather than aspirational: the set of files that can exist in a
 * creation is fixed before the upload starts, an undeclared path is rejected on
 * arrival, and a declared path whose content changed under it is rejected too.
 * A reviewer approves a bundle whose contents were pinned by hash before anyone
 * knew what the review would say.
 */

import { createHash, randomBytes } from 'node:crypto'
import { hashSecret } from '@townsquare/identity'
import { BUNDLE_LIMITS, checkBundlePath, type BundleFile } from '@townsquare/bundle'

/** One declared file, before any bytes have moved. */
export interface InventoryEntry {
  path: string
  sha256: string
  bytes: number
}

export type DraftStatus = 'collecting' | 'complete' | 'submitted'

export interface Draft {
  id: string
  userId: string
  /** The proposed slug. The platform owns the final one; this is a request. */
  slug: string
  status: DraftStatus
  inventory: readonly InventoryEntry[]
  /** Path → bytes, for files that have actually arrived and verified. */
  received: ReadonlyMap<string, Uint8Array>
  /** Only the hash. Same rule as every other credential in this codebase. */
  uploadTokenHash: string
  uploadExpiresAt: number
  /** Set once `preview` has published this draft to a preview origin. */
  previewKey: string | null
  /** Set once `submit` has queued it. */
  submissionId: string | null
  createdAt: number
  updatedAt: number
}

export interface DraftStore {
  createDraft(
    input: {
      userId: string
      slug: string
      inventory: readonly InventoryEntry[]
      uploadTokenHash: string
      uploadExpiresAt: number
    },
    now: number,
  ): Promise<Draft>
  draftById(id: string): Promise<Draft | null>
  draftsForUser(userId: string): Promise<Draft[]>
  putFile(draftId: string, path: string, bytes: Uint8Array, now: number): Promise<void>
  updateDraft(id: string, patch: Partial<Omit<Draft, 'id' | 'received'>>, now: number): Promise<Draft>
  deleteDraft(id: string): Promise<void>
}

/**
 * How long an upload ticket lives.
 *
 * Generous enough that a slow connection uploading 200 files does not lose the
 * race, short enough that a ticket found in a shell history tomorrow is dead.
 * `begin_upload` can always be called again, which re-mints it.
 */
export const UPLOAD_TICKET_TTL_MS = 60 * 60 * 1000

/** Drafts are scratch space. Untouched ones are not kept forever. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const MAX_DRAFTS_PER_USER = 20

// ── the inventory, checked before a byte moves ───────────────────────────────

export interface InventoryProblem {
  path: string
  message: string
}

const SHA256_RE = /^[0-9a-f]{64}$/

/**
 * Vet a declared inventory against the bundle limits.
 *
 * Runs at `begin_upload`, which is the whole point: a 40MB creation is refused
 * as a sentence in a tool result, not as 40MB of accepted traffic followed by
 * a rejection. Every check here has a counterpart in `validateBundle`, and the
 * duplication is deliberate — this one is about what we are willing to *carry*,
 * that one about what we are willing to *publish*.
 */
export function checkInventory(inventory: readonly InventoryEntry[]): InventoryProblem[] {
  const problems: InventoryProblem[] = []

  if (inventory.length === 0) {
    return [{ path: '(inventory)', message: 'declare at least one file' }]
  }
  if (inventory.length > BUNDLE_LIMITS.fileCount) {
    problems.push({
      path: '(inventory)',
      message: `${inventory.length} files, limit is ${BUNDLE_LIMITS.fileCount}`,
    })
  }

  const seen = new Set<string>()
  let total = 0

  for (const entry of inventory) {
    const checked = checkBundlePath(entry.path)
    if (!checked.ok) {
      problems.push({ path: String(entry.path), message: checked.reason })
      continue
    }
    // Case-insensitive, matching the validator: two paths differing only in
    // case address one file on a case-insensitive client and two here.
    const key = checked.path.toLowerCase()
    if (seen.has(key)) {
      problems.push({ path: checked.path, message: 'declared twice' })
      continue
    }
    seen.add(key)

    if (!SHA256_RE.test(entry.sha256)) {
      problems.push({ path: checked.path, message: 'sha256 must be 64 lowercase hex characters' })
    }
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
      problems.push({ path: checked.path, message: 'bytes must be a non-negative integer' })
    } else if (entry.bytes > BUNDLE_LIMITS.fileBytes) {
      problems.push({
        path: checked.path,
        message: `${entry.bytes} bytes, per-file limit is ${BUNDLE_LIMITS.fileBytes}`,
      })
      total += entry.bytes
    } else {
      total += entry.bytes
    }
  }

  if (total > BUNDLE_LIMITS.totalBytes) {
    problems.push({
      path: '(inventory)',
      message: `${total} bytes declared, limit is ${BUNDLE_LIMITS.totalBytes}`,
    })
  }
  if (!seen.has('townsquare.json')) {
    problems.push({ path: 'townsquare.json', message: 'every bundle needs a townsquare.json at its root' })
  }

  return problems
}

export function newUploadTicket(): { token: string; hash: string } {
  const token = randomBytes(24).toString('base64url')
  return { token, hash: hashSecret(token) }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export type AcceptResult =
  | { ok: true }
  | { ok: false; status: number; reason: string }

/**
 * Decide whether an arriving file may be stored.
 *
 * Pure, and separated from the HTTP handler on purpose: every property worth
 * asserting here (an undeclared path is refused, a hash mismatch is refused, an
 * expired ticket is refused) is a property of this function, and a test should
 * not have to open a socket to check one.
 *
 * Note the order. The ticket is checked first, so an unauthenticated caller
 * learns nothing about which paths a draft declared.
 */
export function acceptFile(
  draft: Draft,
  presentedTicket: string | undefined,
  path: string,
  bytes: Uint8Array,
  now: number,
): AcceptResult {
  if (!presentedTicket || hashSecret(presentedTicket) !== draft.uploadTokenHash) {
    return { ok: false, status: 401, reason: 'upload ticket is missing or wrong' }
  }
  if (draft.uploadExpiresAt <= now) {
    return { ok: false, status: 401, reason: 'upload ticket has expired; call begin_upload again' }
  }
  if (draft.status === 'submitted') {
    return { ok: false, status: 409, reason: 'this draft has been submitted and is now frozen' }
  }

  const checked = checkBundlePath(path)
  if (!checked.ok) return { ok: false, status: 400, reason: checked.reason }

  const declared = draft.inventory.find((e) => e.path.toLowerCase() === checked.path.toLowerCase())
  if (!declared) {
    return {
      ok: false,
      status: 409,
      reason: `"${checked.path}" was not in the inventory declared to begin_upload`,
    }
  }
  if (bytes.byteLength !== declared.bytes) {
    return {
      ok: false,
      status: 409,
      reason: `"${checked.path}" is ${bytes.byteLength} bytes, but ${declared.bytes} were declared`,
    }
  }
  const actual = sha256Hex(bytes)
  if (actual !== declared.sha256) {
    return {
      ok: false,
      status: 409,
      reason: `"${checked.path}" hashes to ${actual}, but ${declared.sha256} was declared`,
    }
  }
  return { ok: true }
}

/** Declared paths with nothing stored against them yet. */
export function missingPaths(draft: Draft): string[] {
  return draft.inventory.filter((e) => !draft.received.has(e.path)).map((e) => e.path)
}

/** The draft as the validator wants it: a flat list of files. */
export function draftFiles(draft: Draft): BundleFile[] {
  return draft.inventory
    .filter((e) => draft.received.has(e.path))
    .map((e) => ({ path: e.path, bytes: draft.received.get(e.path)! }))
}

export class MemoryDraftStore implements DraftStore {
  private readonly drafts = new Map<string, Draft>()
  private readonly files = new Map<string, Map<string, Uint8Array>>()

  private hydrate(row: Draft): Draft {
    return { ...row, received: this.files.get(row.id) ?? new Map() }
  }

  async createDraft(
    input: {
      userId: string
      slug: string
      inventory: readonly InventoryEntry[]
      uploadTokenHash: string
      uploadExpiresAt: number
    },
    now: number,
  ): Promise<Draft> {
    const id = randomBytes(12).toString('base64url')
    const draft: Draft = {
      id,
      userId: input.userId,
      slug: input.slug,
      status: 'collecting',
      inventory: input.inventory.map((e) => ({ ...e })),
      received: new Map(),
      uploadTokenHash: input.uploadTokenHash,
      uploadExpiresAt: input.uploadExpiresAt,
      previewKey: null,
      submissionId: null,
      createdAt: now,
      updatedAt: now,
    }
    this.drafts.set(id, draft)
    this.files.set(id, new Map())
    return this.hydrate(draft)
  }

  async draftById(id: string): Promise<Draft | null> {
    const row = this.drafts.get(id)
    return row ? this.hydrate(row) : null
  }

  async draftsForUser(userId: string): Promise<Draft[]> {
    return [...this.drafts.values()]
      .filter((d) => d.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((d) => this.hydrate(d))
  }

  async putFile(draftId: string, path: string, bytes: Uint8Array, now: number): Promise<void> {
    const row = this.drafts.get(draftId)
    if (!row) throw new Error(`no such draft: ${draftId}`)
    this.files.get(draftId)?.set(path, bytes)
    this.drafts.set(draftId, { ...row, updatedAt: now })
  }

  async updateDraft(
    id: string,
    patch: Partial<Omit<Draft, 'id' | 'received'>>,
    now: number,
  ): Promise<Draft> {
    const row = this.drafts.get(id)
    if (!row) throw new Error(`no such draft: ${id}`)
    const next: Draft = { ...row, ...patch, id: row.id, received: row.received, updatedAt: now }
    this.drafts.set(id, next)
    return this.hydrate(next)
  }

  async deleteDraft(id: string): Promise<void> {
    this.drafts.delete(id)
    this.files.delete(id)
  }
}
