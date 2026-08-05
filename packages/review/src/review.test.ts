import { beforeEach, describe, expect, it } from 'vitest'
import { bundleDigest, hashFiles, type BundleFile } from '@townsquare/bundle'
import { BundleStorePublisher, MemoryBundleStore } from '@townsquare/sandbox'
import { parseManifest, type Manifest } from '@townsquare/manifest'
import { Review, ReviewError } from './service.js'
import { diffManifests, grantsOf, isEscalation } from './diff.js'
import { MemoryCreationStore, MemoryRecordTypeStore, MemorySubmissionStore } from './memory.js'
import type { NewSubmission, Reviewer } from './model.js'

const TOWN = 'russellville-ar'
const NOW = 1_700_000_000_000
const enc = new TextEncoder()

const MODERATOR: Reviewer = { userId: 'mod-1', handle: 'tswic', role: 'admin' }
const RESIDENT: Reviewer = { userId: 'mod-1', handle: 'tswic', role: 'user' }

function manifestFor(overrides: Record<string, unknown> = {}): Manifest {
  const parsed = parseManifest({
    manifest_version: 1,
    sdk: 1,
    name: 'Hello',
    tagline: 'A very small creation',
    description: 'Exists so the tests exercise the real publish path end to end.',
    version: '1.0.0',
    entry: 'index.html',
    icon: 'icon.svg',
    permissions: { identity: 'none' },
    ...overrides,
  })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues))
  return parsed.manifest
}

function bundleFor(manifest: Manifest): Map<string, Uint8Array> {
  return new Map([
    ['townsquare.json', enc.encode(JSON.stringify(manifest, null, 2))],
    [
      'index.html',
      enc.encode(
        '<!doctype html>\n<html lang="en">\n  <head><title>Hello</title></head>\n' +
          '  <body>\n    <h1>Hello</h1>\n' +
          "    <script type=\"module\">\n      import { app } from '@townsquare/sdk'\n      app.ready()\n    </script>\n" +
          '  </body>\n</html>\n',
      ),
    ],
    [
      'icon.svg',
      enc.encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect/></svg>\n'),
    ],
  ])
}

function submissionFor(
  manifest: Manifest,
  over: Partial<NewSubmission> = {},
): NewSubmission {
  const files = bundleFor(manifest)
  const list: BundleFile[] = [...files].map(([path, bytes]) => ({ path, bytes }))
  return {
    townId: TOWN,
    userId: 'user-1',
    handle: 'builder',
    creationId: null,
    proposedSlug: 'hello',
    name: manifest.name,
    version: manifest.version,
    manifest,
    entry: manifest.entry,
    bundleDigest: bundleDigest(hashFiles(list)),
    files,
    warnings: [],
    ...over,
  }
}

let submissions: MemorySubmissionStore
let creations: MemoryCreationStore
let recordTypes: MemoryRecordTypeStore
let bundles: MemoryBundleStore
let review: Review
let clock: { now: number }

beforeEach(() => {
  clock = { now: NOW }
  submissions = new MemorySubmissionStore()
  creations = new MemoryCreationStore()
  recordTypes = new MemoryRecordTypeStore()
  bundles = new MemoryBundleStore()
  review = new Review({
    submissions,
    creations,
    recordTypes,
    publisher: new BundleStorePublisher({
      store: bundles,
      origin: { appsDomain: 'tsq-apps.localhost', scheme: 'http', port: 3031 },
      shellOrigins: ['http://townsquare.localhost:5173'],
    }),
    now: () => clock.now,
  })
})

describe('joining the queue', () => {
  it('takes a first submission as a new creation', async () => {
    const submission = await review.submit(submissionFor(manifestFor()))
    expect(submission.status).toBe('queued')
    expect(submission.creationId).toBeNull()
    expect((await review.queue(TOWN))[0]).toMatchObject({ kind: 'new', escalates: false })
  })

  it('refuses a second submission while one is outstanding', async () => {
    await review.submit(submissionFor(manifestFor()))
    await expect(review.submit(submissionFor(manifestFor({ version: '1.0.1' })))).rejects.toThrow(
      /already have version/,
    )
  })

  it('lists oldest first, so the first person to submit is not the last served', async () => {
    await review.submit(submissionFor(manifestFor(), { userId: 'a', proposedSlug: 'first' }))
    clock.now += 1000
    await review.submit(submissionFor(manifestFor(), { userId: 'b', proposedSlug: 'second' }))

    expect((await review.queue(TOWN)).map((q) => q.proposedSlug)).toEqual(['first', 'second'])
  })
})

describe('deciding', () => {
  it('is a moderator role, not something a resident can do', async () => {
    const submission = await review.submit(submissionFor(manifestFor()))
    await expect(review.decide(RESIDENT, submission.id, 'approve', '')).rejects.toThrow(
      /moderator role/,
    )
    // And nothing was published on the way to refusing.
    expect(bundles.list()).toHaveLength(0)
  })

  it('cannot decide the same submission twice', async () => {
    const submission = await review.submit(submissionFor(manifestFor()))
    await review.decide(MODERATOR, submission.id, 'reject', 'not for us')
    await expect(review.decide(MODERATOR, submission.id, 'approve', '')).rejects.toThrow(
      /already rejected/,
    )
  })

  it('records a rejection with the reviewer’s words', async () => {
    const submission = await review.submit(submissionFor(manifestFor()))
    const result = await review.decide(MODERATOR, submission.id, 'reject', 'reads like a scraper')
    expect(result.submission).toMatchObject({
      status: 'rejected',
      note: 'reads like a scraper',
      decidedBy: MODERATOR.userId,
    })
    expect(result.creation).toBeNull()
  })

  it('asks for changes without ending the road', async () => {
    const submission = await review.submit(submissionFor(manifestFor()))
    const result = await review.decide(MODERATOR, submission.id, 'request_changes', 'drop the tracker')
    expect(result.submission.status).toBe('changes_requested')
  })
})

describe('approval', () => {
  it('publishes to a real origin and makes the version live', async () => {
    const submission = await review.submit(submissionFor(manifestFor()))
    const result = await review.decide(MODERATOR, submission.id, 'approve', 'looks good')

    expect(result.submission.status).toBe('approved')
    expect(result.creation).toMatchObject({ slug: 'hello', status: 'active' })
    expect(result.url).toMatch(/^http:\/\/[0-9a-z]{12}\.tsq-apps\.localhost:3031$/)

    // Servable through the same store and path the sandbox serves from.
    const resolved = await bundles.resolveOrigin('creation', result.creation!.originKey)
    expect(resolved?.entryPath).toBe('index.html')
    expect(resolved?.cspHeader).toContain("script-src 'self'")
    expect(resolved?.versionId).toBe(result.creation!.activeVersionId)

    // And it is in the catalogue, which a preview never is.
    expect(bundles.list().map((c) => c.slug)).toEqual(['hello'])
  })

  it('refuses to publish bytes that no longer match the submitted digest', async () => {
    const submission = await review.submit(
      submissionFor(manifestFor(), { bundleDigest: 'f'.repeat(64) }),
    )
    await expect(review.decide(MODERATOR, submission.id, 'approve', '')).rejects.toThrow(
      /no longer matches the digest/,
    )
    expect(bundles.list()).toHaveLength(0)
  })

  it('registers the record types the version defines', async () => {
    const manifest = manifestFor({
      permissions: { identity: 'handle', read: ['flock_camera'], write: ['flock_camera'] },
      defines: [
        {
          type: 'flock_camera',
          label: 'Flock camera',
          schema: { lat: { type: 'number', required: true } },
        },
      ],
    })
    const submission = await review.submit(submissionFor(manifest))
    await review.decide(MODERATOR, submission.id, 'approve', '')

    const types = await recordTypes.list(TOWN)
    expect(types.map((t) => t.type)).toEqual(['flock_camera'])
    expect(types[0]!.definedByCreationId).not.toBeNull()
  })

  it('asks for changes when the town moved underneath a queued submission', async () => {
    const manifest = manifestFor({
      permissions: { identity: 'handle', read: ['flock_camera'], write: ['flock_camera'] },
      defines: [
        {
          type: 'flock_camera',
          label: 'Flock camera',
          schema: { lat: { type: 'number', required: true } },
        },
      ],
    })
    const submission = await review.submit(submissionFor(manifest))

    // Someone else defines the same type first, incompatibly, while this sits
    // in the queue. Approving a stale pass would write what the validator now
    // rejects.
    await recordTypes.define(
      {
        townId: TOWN,
        type: 'flock_camera',
        label: 'Flock camera',
        schema: { lat: { type: 'string', required: true } },
        definedByCreationId: 'someone-else',
      },
      clock.now,
    )

    const result = await review.decide(MODERATOR, submission.id, 'approve', '')
    expect(result.submission.status).toBe('changes_requested')
    expect(result.submission.note).toContain('The town changed while this was in the queue')
    expect(bundles.list()).toHaveLength(0)
  })

  it('suffixes a slug already taken rather than bouncing the submission', async () => {
    const first = await review.submit(submissionFor(manifestFor()))
    await review.decide(MODERATOR, first.id, 'approve', '')

    const second = await review.submit(
      submissionFor(manifestFor(), { userId: 'user-2', handle: 'other' }),
    )
    const result = await review.decide(MODERATOR, second.id, 'approve', '')
    expect(result.creation!.slug).toBe('hello-2')
  })

  it('will not let one resident submit into another’s creation', async () => {
    const first = await review.submit(submissionFor(manifestFor()))
    const approved = await review.decide(MODERATOR, first.id, 'approve', '')

    await expect(
      review.submit(
        submissionFor(manifestFor({ version: '1.1.0' }), {
          userId: 'user-2',
          handle: 'other',
          creationId: approved.creation!.id,
        }),
      ),
    ).rejects.toThrow(/belongs to another resident/)
  })
})

describe('updates', () => {
  async function publishFirst(manifest = manifestFor()) {
    const submission = await review.submit(submissionFor(manifest))
    const result = await review.decide(MODERATOR, submission.id, 'approve', '')
    return result.creation!
  }

  it('recognises a second submission of the same slug as an update', async () => {
    const creation = await publishFirst()
    const next = await review.submit(submissionFor(manifestFor({ version: '1.1.0' })))
    expect(next.creationId).toBe(creation.id)
    expect((await review.queue(TOWN))[0]!.kind).toBe('update')
  })

  it('refuses a version that was already submitted', async () => {
    await publishFirst()
    await expect(review.submit(submissionFor(manifestFor()))).rejects.toThrow(/already been submitted/)
  })

  it('keeps the live version serving until a human approves the next one', async () => {
    const creation = await publishFirst()
    const liveVersion = creation.activeVersionId

    await review.submit(submissionFor(manifestFor({ version: '1.1.0', name: 'Hello Again' })))

    // Queued, not published. Residents are still running what was approved.
    const unchanged = (await creations.byId(creation.id))!
    expect(unchanged.activeVersionId).toBe(liveVersion)
    expect(unchanged.name).toBe('Hello')
    const resolved = await bundles.resolveOrigin('creation', creation.originKey)
    expect(resolved?.versionId).toBe(liveVersion)
  })

  it('keeps the origin key across versions, so storage survives the update', async () => {
    const creation = await publishFirst()
    const next = await review.submit(submissionFor(manifestFor({ version: '1.1.0' })))
    const result = await review.decide(MODERATOR, next.id, 'approve', '')

    // The origin key is the storage partition. A new one on every update would
    // silently empty every resident's saved state.
    expect(result.creation!.originKey).toBe(creation.originKey)
    expect(result.creation!.activeVersionId).not.toBe(creation.activeVersionId)
  })

  it('supersedes the previous version rather than deleting it', async () => {
    const creation = await publishFirst()
    const next = await review.submit(submissionFor(manifestFor({ version: '1.1.0' })))
    await review.decide(MODERATOR, next.id, 'approve', '')

    const versions = await creations.versionsFor(creation.id)
    expect(versions.map((v) => `${v.version}:${v.status}`)).toEqual([
      '1.0.0:superseded',
      '1.1.0:approved',
    ])
  })

  it('flags an update that asks for something new', async () => {
    await publishFirst()
    await review.submit(
      submissionFor(
        manifestFor({
          version: '1.1.0',
          permissions: { identity: 'handle', network: ['collect.example.com'] },
        }),
      ),
    )

    const item = (await review.queue(TOWN))[0]!
    expect(item.escalates).toBe(true)

    const detail = await review.detail(item.id)
    expect(detail.kind).toBe('update')
    expect(detail.diff!.escalations).toEqual([
      { key: 'identity', added: ['handle'], removed: [] },
      { key: 'network', added: ['collect.example.com'], removed: [] },
    ])
  })

  it('does not flag an update that gives something up', async () => {
    await publishFirst(manifestFor({ permissions: { identity: 'handle', storage: true } }))
    await review.submit(
      submissionFor(manifestFor({ version: '1.1.0', permissions: { identity: 'handle' } })),
    )

    const item = (await review.queue(TOWN))[0]!
    expect(item.escalates).toBe(false)
    const detail = await review.detail(item.id)
    expect(detail.diff!.reductions).toEqual([{ key: 'storage', added: [], removed: ['storage'] }])
  })
})

describe('what a reviewer is shown', () => {
  it('lists every grant on a first submission, since all of it is new', async () => {
    const submission = await review.submit(
      submissionFor(manifestFor({ permissions: { identity: 'handle', storage: true } })),
    )
    const detail = await review.detail(submission.id)
    expect(detail.kind).toBe('new')
    expect(detail.diff).toBeNull()
    expect(detail.grants).toEqual([
      { key: 'identity', added: ['handle'], removed: [] },
      { key: 'storage', added: ['storage'], removed: [] },
    ])
  })

  it('hands over the source as text, and names what it did not inline', async () => {
    const manifest = manifestFor()
    const files = bundleFor(manifest)
    files.set('logo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    const list: BundleFile[] = [...files].map(([path, bytes]) => ({ path, bytes }))

    const submission = await review.submit(
      submissionFor(manifest, { files, bundleDigest: bundleDigest(hashFiles(list)) }),
    )
    const detail = await review.detail(submission.id)

    expect(detail.files.map((f) => f.path)).toEqual(['icon.svg', 'index.html', 'townsquare.json'])
    expect(detail.files.find((f) => f.path === 'index.html')!.text).toContain('app.ready()')
    expect(detail.omitted).toEqual([{ path: 'logo.png', bytes: 4, reason: 'not a text file' }])
  })

  it('reads the bytes the queue holds, not the ones the builder still has', async () => {
    const manifest = manifestFor()
    const files = bundleFor(manifest)
    const submission = await review.submit(submissionFor(manifest, { files }))

    // The builder keeps editing their copy. The queue is unmoved.
    files.set('index.html', enc.encode('<script>fetch("https://evil.example")</script>'))

    const detail = await review.detail(submission.id)
    expect(detail.files.find((f) => f.path === 'index.html')!.text).not.toContain('evil.example')
  })
})

describe('the permission diff on its own', () => {
  it('names an added network host as an escalation', () => {
    const diff = diffManifests(
      manifestFor(),
      manifestFor({ version: '2.0.0', permissions: { network: ['collect.example.com'] } }),
    )
    expect(isEscalation(diff)).toBe(true)
    expect(diff.escalations[0]).toEqual({
      key: 'network',
      added: ['collect.example.com'],
      removed: [],
    })
  })

  it('treats a removal as a reduction and nothing else', () => {
    const diff = diffManifests(
      manifestFor({ permissions: { network: ['tile.openstreetmap.org'] } }),
      manifestFor({ version: '2.0.0' }),
    )
    expect(isEscalation(diff)).toBe(false)
    expect(diff.escalations).toEqual([])
    expect(diff.reductions[0]!.removed).toEqual(['tile.openstreetmap.org'])
  })

  it('notices a rename, so a quiet rebrand is visible', () => {
    const diff = diffManifests(manifestFor(), manifestFor({ version: '2.0.0', name: 'Something Else' }))
    expect(diff.renamed).toEqual({ from: 'Hello', to: 'Something Else' })
  })

  it('counts a newly defined record type as an escalation', () => {
    const withType = manifestFor({
      version: '2.0.0',
      permissions: { read: ['flock_camera'], write: ['flock_camera'] },
      defines: [
        { type: 'flock_camera', label: 'Flock camera', schema: { lat: { type: 'number' } } },
      ],
    })
    const diff = diffManifests(manifestFor(), withType)
    expect(diff.newRecordTypes).toEqual(['flock_camera'])
    expect(isEscalation(diff)).toBe(true)
  })

  it('reports no grants at all for a creation that asks for nothing', () => {
    expect(grantsOf(manifestFor())).toEqual([])
  })
})

describe('errors', () => {
  it('are typed, so a route can map them to a status', async () => {
    await expect(review.detail('nope')).rejects.toBeInstanceOf(ReviewError)
    await expect(review.detail('nope')).rejects.toMatchObject({ code: 'not_found' })
  })
})
