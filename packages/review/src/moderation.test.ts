/**
 * Acting on something already live, tested against the real publish path.
 *
 * Every test here starts by getting a creation genuinely approved through
 * `Review`, because the properties worth checking are about the state that
 * approval leaves behind: the origin key, the version rows, the bytes in the
 * bundle store. A hand-built fixture would let a revert "work" against files
 * nobody ever served.
 *
 * The two adversarial cases are the ones that would matter in a real town: a
 * resident cannot block a neighbour's creation, and a moderator cannot use
 * revert to publish a version that was never approved.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { bundleDigest, hashFiles, type BundleFile } from '@townsquare/bundle'
import { BundleStorePublisher, MemoryBundleStore, serveBundleRequest } from '@townsquare/sandbox'
import { parseManifest, type Manifest } from '@townsquare/manifest'
import { Moderation, revertVersionLabel } from './moderation.js'
import { Reports } from './reports.js'
import {
  MemoryCreationStore,
  MemoryModerationLogStore,
  MemoryRecordTypeStore,
  MemoryReportStore,
  MemorySubmissionStore,
} from './memory.js'
import { Review } from './service.js'
import type { Creation, NewSubmission, Reviewer } from './model.js'

const TOWN = 'russellville-ar'
const NOW = 1_700_000_000_000
const APPS = 'tsq-apps.localhost'
const enc = new TextEncoder()

const MODERATOR: Reviewer = { userId: 'mod-1', handle: 'tswic', role: 'admin' }
const RESIDENT: Reviewer = { userId: 'user-9', handle: 'neighbour', role: 'user' }

function manifestFor(over: Record<string, unknown> = {}): Manifest {
  const parsed = parseManifest({
    manifest_version: 1,
    sdk: 1,
    name: 'Trash day',
    tagline: 'When the truck comes',
    description: 'Exists so the moderation tests run against a real published creation.',
    version: '1.0.0',
    entry: 'index.html',
    icon: 'icon.svg',
    permissions: { identity: 'none' },
    ...over,
  })
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues))
  return parsed.manifest
}

function bundleFor(manifest: Manifest, body = 'Trash day'): Map<string, Uint8Array> {
  return new Map([
    ['townsquare.json', enc.encode(JSON.stringify(manifest, null, 2))],
    [
      'index.html',
      enc.encode(`<!doctype html>\n<html lang="en">\n  <body><h1>${body}</h1></body>\n</html>\n`),
    ],
    [
      'icon.svg',
      enc.encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect/></svg>\n'),
    ],
  ])
}

function submissionFor(manifest: Manifest, body?: string): NewSubmission {
  const files = bundleFor(manifest, body)
  const list: BundleFile[] = [...files].map(([path, bytes]) => ({ path, bytes }))
  return {
    townId: TOWN,
    userId: 'builder-1',
    handle: 'builder',
    creationId: null,
    proposedSlug: 'trash-day',
    name: manifest.name,
    version: manifest.version,
    manifest,
    entry: manifest.entry,
    bundleDigest: bundleDigest(hashFiles(list)),
    files,
    warnings: [],
  }
}

let creations: MemoryCreationStore
let reportStore: MemoryReportStore
let log: MemoryModerationLogStore
let bundles: MemoryBundleStore
let publisher: BundleStorePublisher
let review: Review
let reports: Reports
let moderation: Moderation
let clock: { now: number }

beforeEach(() => {
  clock = { now: NOW }
  creations = new MemoryCreationStore()
  reportStore = new MemoryReportStore()
  log = new MemoryModerationLogStore()
  bundles = new MemoryBundleStore()
  publisher = new BundleStorePublisher({
    store: bundles,
    origin: { appsDomain: APPS, scheme: 'http', port: 3031 },
    shellOrigins: ['http://townsquare.localhost:5173'],
  })
  review = new Review({
    submissions: new MemorySubmissionStore(),
    creations,
    recordTypes: new MemoryRecordTypeStore(),
    publisher,
    now: () => clock.now,
  })
  reports = new Reports({
    reports: reportStore,
    targets: {
      async creationBySlug(_townId, slug) {
        const row = await creations.bySlug(TOWN, slug)
        return row ? { id: row.id, name: row.name } : null
      },
    },
    now: () => clock.now,
  })
  moderation = new Moderation({
    creations,
    publisher,
    reports: reportStore,
    log,
    now: () => clock.now,
  })
})

/** Get something genuinely approved and live, the way a builder would. */
async function publishFirst(body?: string): Promise<Creation> {
  const submission = await review.submit(submissionFor(manifestFor(), body))
  const result = await review.decide(MODERATOR, submission.id, 'approve', 'reads clean')
  return result.creation!
}

/** And an update on top of it, so there is something to revert away from. */
async function publishUpdate(creation: Creation, version: string, body: string): Promise<void> {
  clock.now += 1000
  const submission = await review.submit({
    ...submissionFor(manifestFor({ version }), body),
    creationId: creation.id,
  })
  const result = await review.decide(MODERATOR, submission.id, 'approve', 'also fine')
  if (result.submission.status !== 'approved') {
    throw new Error(`update was not approved: ${result.submission.note ?? ''}`)
  }
}

/** What a resident's browser would actually get from the sandbox. */
async function fetchEntry(originKey: string) {
  return serveBundleRequest(
    { method: 'GET', host: `${originKey}.${APPS}:3031`, url: '/index.html' },
    {
      origin: { appsDomain: APPS, scheme: 'http', port: 3031 },
      store: bundles,
      assets: { sdkJs: '', themeCss: () => '', themeVersion: 1, sdkMajor: 1 },
    },
  )
}

describe('hiding and blocking', () => {
  it('stops the sandbox serving a blocked creation, and says a moderator did it', async () => {
    const creation = await publishFirst()
    expect((await fetchEntry(creation.originKey)).status).toBe(200)

    await moderation.act(MODERATOR, creation.id, 'block', 'copyright complaint upheld')

    const res = await fetchEntry(creation.originKey)
    expect(res.status).toBe(410)
    expect(new TextDecoder().decode(res.body!)).toContain('blocked by a moderator')
  })

  it('hides without claiming a moderator blocked it', async () => {
    const creation = await publishFirst()
    await moderation.act(MODERATOR, creation.id, 'hide', 'abandoned and broken')

    const res = await fetchEntry(creation.originKey)
    expect(res.status).toBe(410)
    expect(new TextDecoder().decode(res.body!)).toContain('hidden')
  })

  it('puts one back', async () => {
    const creation = await publishFirst()
    await moderation.act(MODERATOR, creation.id, 'block', 'looked bad')
    await moderation.act(MODERATOR, creation.id, 'restore', 'looked bad, was not')

    expect((await fetchEntry(creation.originKey)).status).toBe(200)
    expect((await creations.byId(creation.id))?.status).toBe('active')
  })

  it('refuses an action that would change nothing', async () => {
    const creation = await publishFirst()
    await expect(moderation.act(MODERATOR, creation.id, 'restore', 'already fine')).rejects.toThrow(
      /already active/,
    )
  })

  it('never deletes anything: a blocked creation is still a record of what someone made', async () => {
    const creation = await publishFirst()
    await moderation.act(MODERATOR, creation.id, 'block', 'the law says so')

    const row = await creations.byId(creation.id)
    expect(row).not.toBeNull()
    expect(row?.status).toBe('blocked')
    expect(await creations.versionsFor(creation.id)).toHaveLength(1)
  })

  it('writes an audit row a resident could be shown', async () => {
    const creation = await publishFirst()
    clock.now += 5000
    await moderation.act(MODERATOR, creation.id, 'hide', 'phoning home to an undeclared host')

    expect(await log.forCreation(creation.id)).toEqual([
      expect.objectContaining({
        action: 'hide',
        actorId: 'mod-1',
        actorHandle: 'tswic',
        note: 'phoning home to an undeclared host',
        createdAt: NOW + 5000,
      }),
    ])
  })
})

describe('a resident cannot moderate', () => {
  it('refuses to hide a neighbour’s creation, and serves it anyway', async () => {
    const creation = await publishFirst()

    await expect(moderation.act(RESIDENT, creation.id, 'hide', 'i do not like it')).rejects.toThrow(
      /moderator role/,
    )
    expect((await fetchEntry(creation.originKey)).status).toBe(200)
    expect(await log.forCreation(creation.id)).toHaveLength(0)
  })

  it('refuses even to the owner, who is not a moderator either', async () => {
    const creation = await publishFirst()
    const owner: Reviewer = { userId: creation.ownerId, handle: 'builder', role: 'user' }
    await expect(moderation.act(owner, creation.id, 'block', 'mine to block')).rejects.toThrow(
      /moderator role/,
    )
  })

  it('refuses to list or open the moderation surface', async () => {
    const creation = await publishFirst()
    await expect(moderation.creations(RESIDENT, TOWN)).rejects.toThrow(/moderator role/)
    await expect(moderation.detail(RESIDENT, creation.id)).rejects.toThrow(/moderator role/)
  })
})

describe('revert', () => {
  it('puts the old bytes back without destroying the new ones', async () => {
    const creation = await publishFirst('first version')
    await publishUpdate(creation, '1.1.0', 'second version')

    const versions = await creations.versionsFor(creation.id)
    const first = versions.find((v) => v.version === '1.0.0')!
    expect(new TextDecoder().decode((await fetchEntry(creation.originKey)).body!)).toContain(
      'second version',
    )

    clock.now += 1000
    const result = await moderation.revert(MODERATOR, creation.id, first.id, 'the update was bad')

    // What residents get is the old bundle.
    expect(new TextDecoder().decode((await fetchEntry(creation.originKey)).body!)).toContain(
      'first version',
    )

    // And it is a forward write: three rows now, none of them removed, with the
    // new one saying where it came from.
    const after = await creations.versionsFor(creation.id)
    expect(after).toHaveLength(3)
    expect(after.map((v) => v.version)).toEqual(['1.0.0', '1.1.0', '1.0.0+revert.1'])
    expect(after.find((v) => v.version === '1.0.0+revert.1')).toMatchObject({
      status: 'approved',
      revertedFromVersionId: first.id,
      reviewedBy: 'mod-1',
    })
    expect(result.entry).toMatchObject({ action: 'revert', toVersionId: after[2]!.id })
  })

  it('keeps the origin key, so nobody loses their saved state', async () => {
    const creation = await publishFirst('first version')
    await publishUpdate(creation, '1.1.0', 'second version')
    const first = (await creations.versionsFor(creation.id)).find((v) => v.version === '1.0.0')!

    await moderation.revert(MODERATOR, creation.id, first.id, 'roll it back')

    const after = await creations.byId(creation.id)
    expect(after?.originKey).toBe(creation.originKey)
  })

  it('supersedes the version it replaced rather than deleting it', async () => {
    const creation = await publishFirst('first version')
    await publishUpdate(creation, '1.1.0', 'second version')
    const first = (await creations.versionsFor(creation.id)).find((v) => v.version === '1.0.0')!

    await moderation.revert(MODERATOR, creation.id, first.id, 'roll it back')

    const bad = (await creations.versionsFor(creation.id)).find((v) => v.version === '1.1.0')!
    expect(bad.status).toBe('superseded')
    // Still readable, still hashed, still exactly what was approved.
    expect(await publisher.filesFor(bad.id)).not.toBeNull()
  })

  it('can be reverted again, forwards, which is what makes it cheap', async () => {
    const creation = await publishFirst('first version')
    await publishUpdate(creation, '1.1.0', 'second version')
    const versions = await creations.versionsFor(creation.id)
    const first = versions.find((v) => v.version === '1.0.0')!
    const second = versions.find((v) => v.version === '1.1.0')!

    await moderation.revert(MODERATOR, creation.id, first.id, 'roll it back')
    clock.now += 1000
    await moderation.revert(MODERATOR, creation.id, second.id, 'i was wrong, put it back')

    expect(new TextDecoder().decode((await fetchEntry(creation.originKey)).body!)).toContain(
      'second version',
    )
    expect((await creations.versionsFor(creation.id)).map((v) => v.version)).toEqual([
      '1.0.0',
      '1.1.0',
      '1.0.0+revert.1',
      '1.1.0+revert.1',
    ])
  })

  it('will not publish a version that was never approved', async () => {
    // The one that would let a moderator launder a rejected submission into
    // production by picking it off a list.
    const creation = await publishFirst()
    const versions = await creations.versionsFor(creation.id)
    await creations.addVersion(
      {
        id: 'never-approved',
        creationId: creation.id,
        version: '9.9.9',
        manifest: manifestFor({ version: '9.9.9' }),
        cspHeader: versions[0]!.cspHeader,
        bundleDigest: versions[0]!.bundleDigest,
        status: 'rejected',
        reviewedBy: 'mod-1',
        reviewedAt: NOW,
        reviewNotes: 'no',
        revertedFromVersionId: null,
      },
      NOW,
    )

    await expect(
      moderation.revert(MODERATOR, creation.id, 'never-approved', 'sneak it in'),
    ).rejects.toThrow(/never approved/)
  })

  it('will not reach a version belonging to another creation', async () => {
    const mine = await publishFirst()
    const otherSubmission = await review.submit({
      ...submissionFor(manifestFor({ name: 'Other' })),
      userId: 'builder-2',
      proposedSlug: 'other',
    })
    const other = (await review.decide(MODERATOR, otherSubmission.id, 'approve', 'ok')).creation!
    const theirVersion = (await creations.versionsFor(other.id))[0]!

    await expect(
      moderation.revert(MODERATOR, mine.id, theirVersion.id, 'wrong creation'),
    ).rejects.toThrow(/no such version of this creation/)
  })

  it('refuses to revert to what is already live', async () => {
    const creation = await publishFirst()
    const live = (await creations.versionsFor(creation.id))[0]!
    await expect(moderation.revert(MODERATOR, creation.id, live.id, 'again')).rejects.toThrow(
      /already what residents run/,
    )
  })

  it('refuses when the stored bytes no longer match the approved digest', async () => {
    const creation = await publishFirst('first version')
    await publishUpdate(creation, '1.1.0', 'second version')
    const first = (await creations.versionsFor(creation.id)).find((v) => v.version === '1.0.0')!

    // Same check approval makes, for the same reason: what goes live is what a
    // human read, or nothing goes live.
    bundles.add('creation', 'scratch', {
      versionId: first.id,
      creationId: creation.id,
      originKey: creation.originKey,
      entryPath: 'index.html',
      cspHeader: first.cspHeader,
      townId: TOWN,
      creationStatus: 'active',
      files: bundleFor(manifestFor(), 'tampered'),
    })

    await expect(moderation.revert(MODERATOR, creation.id, first.id, 'roll back')).rejects.toThrow(
      /no longer match the digest/,
    )
  })

  it('is a moderator role', async () => {
    const creation = await publishFirst('first version')
    await publishUpdate(creation, '1.1.0', 'second version')
    const first = (await creations.versionsFor(creation.id)).find((v) => v.version === '1.0.0')!

    await expect(moderation.revert(RESIDENT, creation.id, first.id, 'mine now')).rejects.toThrow(
      /moderator role/,
    )
    expect(new TextDecoder().decode((await fetchEntry(creation.originKey)).body!)).toContain(
      'second version',
    )
  })

  it('does not un-hide a creation on the way past', async () => {
    const creation = await publishFirst('first version')
    await publishUpdate(creation, '1.1.0', 'second version')
    const first = (await creations.versionsFor(creation.id)).find((v) => v.version === '1.0.0')!

    await moderation.act(MODERATOR, creation.id, 'hide', 'while we look at it')
    await moderation.revert(MODERATOR, creation.id, first.id, 'and roll it back')

    expect((await creations.byId(creation.id))?.status).toBe('hidden')
    expect((await fetchEntry(creation.originKey)).status).toBe(410)
  })
})

describe('the version label a revert writes', () => {
  it('never collides with the version it restores', () => {
    expect(revertVersionLabel('1.2.0', [])).toBe('1.2.0+revert.1')
  })

  it('counts up when the same version is restored twice', () => {
    expect(revertVersionLabel('1.2.0', [{ version: '1.2.0+revert.1' }])).toBe('1.2.0+revert.2')
  })
})

describe('the moderator surface', () => {
  it('surfaces anything with an open report first', async () => {
    const quiet = await publishFirst()
    const noisySubmission = await review.submit({
      ...submissionFor(manifestFor({ name: 'Noisy' })),
      userId: 'builder-2',
      proposedSlug: 'noisy',
    })
    const noisy = (await review.decide(MODERATOR, noisySubmission.id, 'approve', 'ok')).creation!

    await reports.file(
      { userId: 'user-1', handle: 'dana', verified: true },
      { townId: TOWN, slug: noisy.slug, reason: 'illegal' },
    )

    const rows = await moderation.creations(MODERATOR, TOWN)
    expect(rows.map((r) => r.slug)).toEqual([noisy.slug, quiet.slug])
    expect(rows[0]).toMatchObject({ openReports: 1, status: 'active', activeVersion: '1.0.0' })
  })

  it('shows which versions a revert could pick, and which it could not', async () => {
    const creation = await publishFirst('first version')
    await publishUpdate(creation, '1.1.0', 'second version')

    const detail = await moderation.detail(MODERATOR, creation.id)
    expect(detail.versions.map((v) => [v.version, v.live, v.revertable])).toEqual([
      ['1.1.0', true, false],
      ['1.0.0', false, true],
    ])
  })
})

describe('an action drains the reports it answered', () => {
  it('closes open reports as upheld when a creation is blocked', async () => {
    const creation = await publishFirst()
    await reports.file(
      { userId: 'user-1', handle: 'dana', verified: true },
      { townId: TOWN, slug: creation.slug, reason: 'illegal' },
    )
    await reports.file(
      { userId: 'user-2', handle: 'kim', verified: true },
      { townId: TOWN, slug: creation.slug, reason: 'illegal' },
    )

    const result = await moderation.act(MODERATOR, creation.id, 'block', 'both are right')

    expect(result.resolvedReports).toHaveLength(2)
    expect(await reportStore.open(TOWN)).toHaveLength(0)
    expect(result.resolvedReports.every((r) => r.resolution === 'upheld')).toBe(true)
  })

  it('closes them as reverted when the fix was a revert', async () => {
    const creation = await publishFirst('first version')
    await publishUpdate(creation, '1.1.0', 'second version')
    const first = (await creations.versionsFor(creation.id)).find((v) => v.version === '1.0.0')!

    await reports.file(
      { userId: 'user-1', handle: 'dana', verified: true },
      { townId: TOWN, slug: creation.slug, reason: 'broken', version: '1.1.0' },
    )
    const result = await moderation.revert(MODERATOR, creation.id, first.id, 'rolled back')

    expect(result.resolvedReports.map((r) => r.resolution)).toEqual(['reverted'])
  })

  it('closes nothing on a restore, because putting something back is not an answer', async () => {
    const creation = await publishFirst()
    await moderation.act(MODERATOR, creation.id, 'hide', 'while we look')
    await reports.file(
      { userId: 'user-1', handle: 'dana', verified: true },
      { townId: TOWN, slug: creation.slug, reason: 'spam' },
    )

    await moderation.act(MODERATOR, creation.id, 'restore', 'it was fine')
    expect(await reportStore.open(TOWN)).toHaveLength(1)
  })
})
