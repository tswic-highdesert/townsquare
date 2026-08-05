import { describe, expect, it } from 'vitest'
import { BUNDLE_LIMITS } from '@townsquare/bundle'
import {
  MemoryDraftStore,
  UPLOAD_TICKET_TTL_MS,
  acceptFile,
  checkInventory,
  missingPaths,
  newUploadTicket,
  sha256Hex,
  type InventoryEntry,
} from './drafts.js'

const NOW = 1_700_000_000_000
const enc = new TextEncoder()

function entry(path: string, text: string): InventoryEntry {
  const bytes = enc.encode(text)
  return { path, sha256: sha256Hex(bytes), bytes: bytes.byteLength }
}

const MANIFEST = entry('townsquare.json', '{}')
const INDEX = entry('index.html', '<!doctype html>')

describe('checkInventory', () => {
  it('accepts a plain inventory', () => {
    expect(checkInventory([MANIFEST, INDEX])).toEqual([])
  })

  it('insists on a manifest at the root', () => {
    const problems = checkInventory([INDEX])
    expect(problems.map((p) => p.path)).toContain('townsquare.json')
  })

  it('refuses traversal and absolute paths', () => {
    for (const bad of ['../secrets', '/etc/passwd', 'a/../../b']) {
      const problems = checkInventory([MANIFEST, { ...INDEX, path: bad }])
      expect(problems.length, bad).toBeGreaterThan(0)
    }
  })

  it('refuses two paths that differ only in case', () => {
    const problems = checkInventory([MANIFEST, INDEX, { ...INDEX, path: 'INDEX.html' }])
    expect(problems.some((p) => p.message === 'declared twice')).toBe(true)
  })

  it('refuses a malformed hash before any bytes move', () => {
    const problems = checkInventory([MANIFEST, { ...INDEX, sha256: 'nope' }])
    expect(problems.some((p) => p.message.includes('64 lowercase hex'))).toBe(true)
  })

  it('refuses a bundle that is too big by declaration alone', () => {
    const huge = { ...INDEX, bytes: BUNDLE_LIMITS.totalBytes + 1 }
    const problems = checkInventory([MANIFEST, huge])
    expect(problems.length).toBeGreaterThan(0)
  })

  it('refuses an empty inventory', () => {
    expect(checkInventory([])).toHaveLength(1)
  })
})

describe('acceptFile', () => {
  const store = new MemoryDraftStore()

  async function draftWith(ticketHash: string, expiresAt = NOW + UPLOAD_TICKET_TTL_MS) {
    return store.createDraft(
      {
        userId: 'u1',
        slug: 'hello',
        inventory: [MANIFEST, INDEX],
        uploadTokenHash: ticketHash,
        uploadExpiresAt: expiresAt,
      },
      NOW,
    )
  }

  it('accepts a declared file whose bytes match', async () => {
    const ticket = newUploadTicket()
    const draft = await draftWith(ticket.hash)
    const result = acceptFile(draft, ticket.token, 'index.html', enc.encode('<!doctype html>'), NOW)
    expect(result).toEqual({ ok: true })
  })

  it('refuses a wrong or missing ticket before revealing anything about the draft', async () => {
    const ticket = newUploadTicket()
    const draft = await draftWith(ticket.hash)
    for (const presented of [undefined, 'wrong']) {
      const result = acceptFile(draft, presented, 'index.html', enc.encode('<!doctype html>'), NOW)
      expect(result).toEqual({
        ok: false,
        status: 401,
        reason: 'upload ticket is missing or wrong',
      })
    }
  })

  it('refuses an expired ticket', async () => {
    const ticket = newUploadTicket()
    const draft = await draftWith(ticket.hash)
    const result = acceptFile(
      draft,
      ticket.token,
      'index.html',
      enc.encode('<!doctype html>'),
      NOW + UPLOAD_TICKET_TTL_MS + 1,
    )
    expect(result.ok).toBe(false)
  })

  it('refuses a path that was never declared', async () => {
    const ticket = newUploadTicket()
    const draft = await draftWith(ticket.hash)
    const result = acceptFile(draft, ticket.token, 'sneaky.js', enc.encode('alert(1)'), NOW)
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect((result as { reason: string }).reason).toContain('not in the inventory')
  })

  it('refuses declared bytes that changed under the declaration', async () => {
    const ticket = newUploadTicket()
    const draft = await draftWith(ticket.hash)
    // The path and length are right; only the content is not what was pinned.
    const swapped = enc.encode('<!doctype HTML>')
    expect(swapped.byteLength).toBe(enc.encode('<!doctype html>').byteLength)
    const result = acceptFile(draft, ticket.token, 'index.html', swapped, NOW)
    expect((result as { reason: string }).reason).toContain('hashes to')
  })

  it('refuses a length that does not match the declaration', async () => {
    const ticket = newUploadTicket()
    const draft = await draftWith(ticket.hash)
    const result = acceptFile(draft, ticket.token, 'index.html', enc.encode('short'), NOW)
    expect((result as { reason: string }).reason).toContain('were declared')
  })

  it('refuses traversal even with a valid ticket', async () => {
    const ticket = newUploadTicket()
    const draft = await draftWith(ticket.hash)
    const result = acceptFile(draft, ticket.token, '../../etc/passwd', enc.encode('x'), NOW)
    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('refuses anything once the draft is submitted', async () => {
    const ticket = newUploadTicket()
    const draft = await draftWith(ticket.hash)
    const frozen = { ...draft, status: 'submitted' as const }
    const result = acceptFile(frozen, ticket.token, 'index.html', enc.encode('<!doctype html>'), NOW)
    expect(result).toMatchObject({ ok: false, status: 409 })
  })
})

describe('completeness', () => {
  it('tracks what is still outstanding', async () => {
    const store = new MemoryDraftStore()
    const ticket = newUploadTicket()
    const draft = await store.createDraft(
      {
        userId: 'u1',
        slug: 'hello',
        inventory: [MANIFEST, INDEX],
        uploadTokenHash: ticket.hash,
        uploadExpiresAt: NOW + UPLOAD_TICKET_TTL_MS,
      },
      NOW,
    )
    expect(missingPaths(draft)).toEqual(['townsquare.json', 'index.html'])

    await store.putFile(draft.id, 'townsquare.json', enc.encode('{}'), NOW)
    expect(missingPaths((await store.draftById(draft.id))!)).toEqual(['index.html'])
  })
})
