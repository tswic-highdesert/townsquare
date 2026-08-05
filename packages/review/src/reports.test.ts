/**
 * Reporting, tested mostly as a weapon rather than as a feature.
 *
 * The happy path here is four lines long. Everything else is somebody trying to
 * use the Report button to do something to a neighbour: filing twenty times,
 * filing against everything in the gallery, filing without living here, or
 * reading a queue they are not on the committee for.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryReportStore } from './memory.js'
import { REPORTS_PER_DAY, Reports, type ReporterIdentity } from './reports.js'
import type { Reviewer } from './model.js'

const TOWN = 'russellville-ar'
const NOW = 1_700_000_000_000
const DAY = 24 * 60 * 60 * 1000

const MODERATOR: Reviewer = { userId: 'mod-1', handle: 'tswic', role: 'admin' }
const NOT_A_MODERATOR: Reviewer = { userId: 'user-9', handle: 'nosy', role: 'user' }

const VERIFIED: ReporterIdentity = { userId: 'user-1', handle: 'dana', verified: true }
const UNVERIFIED: ReporterIdentity = { userId: 'user-2', handle: 'drifter', verified: false }

let gallery: Map<string, { id: string; name: string }>
let store: MemoryReportStore
let reports: Reports
let clock: { now: number }

beforeEach(() => {
  clock = { now: NOW }
  gallery = new Map([
    ['flock-map', { id: 'creation-1', name: 'Flock camera map' }],
    ['trash-day', { id: 'creation-2', name: 'Trash day' }],
  ])
  store = new MemoryReportStore()
  reports = new Reports({
    reports: store,
    targets: {
      async creationBySlug(_townId, slug) {
        return gallery.get(slug) ?? null
      },
    },
    now: () => clock.now,
  })
})

/** Somewhere else in the gallery to report, so the duplicate rule is not in play. */
function alsoInTheGallery(slug: string): string {
  gallery.set(slug, { id: slug, name: slug })
  return slug
}

function file(reporter: ReporterIdentity, slug = 'flock-map', over: Record<string, unknown> = {}) {
  return reports.file(reporter, { townId: TOWN, slug, reason: 'broken', ...over })
}

describe('who can file', () => {
  it('takes a report from a verified resident', async () => {
    const filed = await file(VERIFIED, 'flock-map', { reason: 'illegal', detail: 'see the map' })

    expect(filed.duplicate).toBe(false)
    expect(filed.report).toMatchObject({
      reporterId: 'user-1',
      targetId: 'creation-1',
      targetLabel: 'Flock camera map',
      reason: 'illegal',
      detail: 'see the map',
      resolution: null,
    })
  })

  it('refuses an unverified account', async () => {
    // Not gatekeeping for its own sake: an anonymous report is free to produce
    // and expensive to read, which is the whole shape of a griefing tool.
    await expect(file(UNVERIFIED)).rejects.toThrow(/verified residents/)
    expect(await store.open(TOWN)).toHaveLength(0)
  })

  it('refuses a reason nobody defined rather than storing it', async () => {
    await expect(file(VERIFIED, 'flock-map', { reason: 'i-dont-like-it' })).rejects.toThrow(
      /reason must be one of/,
    )
  })

  it('says nothing exists for a creation that does not', async () => {
    await expect(file(VERIFIED, 'never-existed')).rejects.toThrow(/no such creation/)
  })

  it('records the version the reporter was looking at', async () => {
    const filed = await file(VERIFIED, 'flock-map', { version: '1.4.0' })
    expect(filed.report.targetVersion).toBe('1.4.0')
  })
})

describe('not a griefing tool', () => {
  it('collapses a second report of the same thing into the first', async () => {
    const first = await file(VERIFIED)
    const again = await file(VERIFIED, 'flock-map', { reason: 'spam', detail: 'and again' })

    expect(again.duplicate).toBe(true)
    expect(again.report.id).toBe(first.report.id)
    // And the moderator has one row to read, not two.
    expect(await store.open(TOWN)).toHaveLength(1)
  })

  it('lets a resident file again once the first was resolved', async () => {
    const first = await file(VERIFIED)
    await reports.resolve(MODERATOR, first.report.id, 'dismissed', 'nothing here')

    clock.now += 60_000
    const second = await file(VERIFIED)
    expect(second.duplicate).toBe(false)
    expect(second.report.id).not.toBe(first.report.id)
  })

  it('caps how many one resident can file in a day', async () => {
    // A different target each time, so the duplicate rule is not what stops it.
    for (let n = 0; n < REPORTS_PER_DAY; n++) await file(VERIFIED, alsoInTheGallery(`filler-${n}`))
    await expect(file(VERIFIED, 'trash-day')).rejects.toThrow(/daily limit/)

    // The cap rolls rather than latching: a day later they can file again.
    clock.now += DAY + 1
    await expect(file(VERIFIED, 'trash-day')).resolves.toMatchObject({ duplicate: false })
  })

  it('caps one resident without capping the town', async () => {
    for (let n = 0; n < REPORTS_PER_DAY; n++) await file(VERIFIED, alsoInTheGallery(`filler-${n}`))

    const neighbour: ReporterIdentity = { userId: 'user-3', handle: 'sam', verified: true }
    await expect(file(neighbour, 'trash-day')).resolves.toMatchObject({ duplicate: false })
  })

  it('trims a detail rather than letting a report become a channel', async () => {
    const filed = await file(VERIFIED, 'flock-map', { detail: 'x'.repeat(5000) })
    expect(filed.report.detail).toHaveLength(2000)
  })
})

describe('reading and closing the queue', () => {
  it('is a moderator role, checked in the service', async () => {
    await file(VERIFIED)
    await expect(reports.open(NOT_A_MODERATOR, TOWN)).rejects.toThrow(/moderator role/)
  })

  it('lists open reports oldest first', async () => {
    await file(VERIFIED, 'flock-map')
    clock.now += 1000
    await file({ userId: 'user-4', handle: 'kim', verified: true }, 'trash-day')

    const open = await reports.open(MODERATOR, TOWN)
    expect(open.map((r) => r.targetLabel)).toEqual(['Flock camera map', 'Trash day'])
  })

  it('drops a report out of the queue once it is resolved', async () => {
    const filed = await file(VERIFIED)
    clock.now += 1000

    const resolved = await reports.resolve(MODERATOR, filed.report.id, 'dismissed', 'reads fine')
    expect(resolved).toMatchObject({
      resolution: 'dismissed',
      resolvedBy: 'mod-1',
      resolvedAt: clock.now,
      resolutionNote: 'reads fine',
    })
    expect(await reports.open(MODERATOR, TOWN)).toHaveLength(0)
  })

  it('will not resolve the same report twice', async () => {
    const filed = await file(VERIFIED)
    await reports.resolve(MODERATOR, filed.report.id, 'dismissed', 'no')
    await expect(reports.resolve(MODERATOR, filed.report.id, 'upheld', 'wait')).rejects.toThrow(
      /already dismissed/,
    )
  })

  it('will not resolve a report that does not exist', async () => {
    await expect(reports.resolve(MODERATOR, 'made-up', 'dismissed', 'no')).rejects.toThrow(
      /no such report/,
    )
  })

  it('refuses a resolution from a resident', async () => {
    const filed = await file(VERIFIED)
    await expect(
      reports.resolve(NOT_A_MODERATOR, filed.report.id, 'dismissed', 'nothing to see'),
    ).rejects.toThrow(/moderator role/)
    expect((await store.byId(filed.report.id))?.resolvedAt).toBeNull()
  })
})

describe('the store enforces what the index does', () => {
  it('refuses a second open row for one reporter and target', async () => {
    // The service collapses duplicates before this is reachable. Reaching it
    // means something went round the service, which is what the partial unique
    // index exists to stop in Postgres.
    await file(VERIFIED)
    await expect(
      store.create(
        {
          townId: TOWN,
          reporterId: 'user-1',
          reporterHandle: 'dana',
          targetType: 'creation',
          targetId: 'creation-1',
          targetLabel: 'Flock camera map',
          targetVersion: null,
          reason: 'spam',
          detail: null,
        },
        NOW,
      ),
    ).rejects.toThrow(/already exists/)
  })
})
