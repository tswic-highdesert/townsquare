import { describe, expect, it } from 'vitest'
import { Contributions } from './service.js'
import { ContributionError } from './errors.js'
import {
  MemoryAttemptLog,
  MemoryContributionStore,
  MemoryRecordStore,
  NoListingOwners,
  NoOrganisations,
} from './memory.js'
import type { Contributor, ListingLookup, Moderator, OrgDirectory } from './model.js'

const TOWN = 'russellville-ar'
const MONDAY = Date.UTC(2026, 5, 8, 15, 0) // 8 June 2026, 10am in the town

const dana: Contributor = { userId: 'u-dana', handle: 'dana_h', verified: true, role: 'user' }
const newcomer: Contributor = { userId: 'u-new', handle: 'newcomer', verified: false, role: 'user' }
const mod: Moderator = { userId: 'u-mod', handle: 'tswic', role: 'moderator' }

/** The directory, as a correction sees it. Real values, supplied by the test. */
class Listings implements ListingLookup {
  constructor(private readonly rows: Record<string, Record<string, string>>) {}
  async current(_townId: string, listingId: string, field: string) {
    const listing = this.rows[listingId]
    const value = listing?.[field]
    return value === undefined ? null : { label: listingId, value }
  }
  set(listingId: string, field: string, value: string): void {
    this.rows[listingId] = { ...this.rows[listingId], [field]: value }
  }
}

class OneOrg implements OrgDirectory {
  async membershipsFor() {
    return [{ orgId: 'org-fumc', orgName: 'First United Methodist Church' }]
  }
}

function harness(opts: { orgs?: OrgDirectory; listings?: Listings; now?: () => number } = {}) {
  const contributions = new MemoryContributionStore()
  const records = new MemoryRecordStore()
  const listings = opts.listings ?? new Listings({})
  const service = new Contributions({
    contributions,
    records,
    attempts: new MemoryAttemptLog(),
    orgs: opts.orgs ?? new NoOrganisations(),
    listings,
    ownership: new NoListingOwners(),
    now: opts.now ?? (() => MONDAY),
  })
  return { service, contributions, records, listings }
}

const anEvent = {
  title: 'Homecoming supper and singing',
  startsAt: MONDAY + 5 * 24 * 60 * 60 * 1000,
  category: 'church',
  description: 'Fried catfish, hushpuppies and whatever the tables bring.',
  cost: 'free',
}

describe('the gate matrix decides what happens, per type', () => {
  it('publishes an event from a verified resident straight away', async () => {
    const { service, records } = harness()
    const result = await service.submit(dana, { townId: TOWN, type: 'event', content: anEvent })

    expect(result.outcome).toBe('published')
    expect(result.contribution.status).toBe('published')
    expect(result.record?.currentVersion).toBe(1)

    const versions = await records.versions(result.record!.id)
    expect(versions).toHaveLength(1)
    expect(versions[0]!.author).toEqual({ kind: 'resident', userId: 'u-dana', handle: 'dana_h' })
  })

  it('holds an event from a resident who is short of vouches, rather than refusing it', async () => {
    const { service } = harness()
    const result = await service.submit(newcomer, { townId: TOWN, type: 'event', content: anEvent })

    expect(result.outcome).toBe('held_for_verification')
    expect(result.record).toBeNull()
    // The attribution it will go up under is already on the row, so the
    // resident's own list can say who it will post as.
    expect(result.contribution.attribution).toMatchObject({ kind: 'resident', handle: 'newcomer' })
  })

  it('publishes held work the moment the resident is verified', async () => {
    const { service } = harness()
    await service.submit(newcomer, { townId: TOWN, type: 'event', content: anEvent })

    const released = await service.releaseHeld({ ...newcomer, verified: true })
    expect(released).toHaveLength(1)
    expect(released[0]!.status).toBe('published')
  })

  it('refuses a notice from a person rather than holding it, because waiting fixes nothing', async () => {
    const { service } = harness()
    await expect(
      service.submit(dana, {
        townId: TOWN,
        type: 'notice',
        content: { title: 'Supper moves to 5:30', body: 'The hall is being refinished.', severity: 'informational' },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('publishes a routine notice from an organisation and queues an urgent one', async () => {
    const { service } = harness({ orgs: new OneOrg() })

    const routine = await service.submit(dana, {
      townId: TOWN,
      type: 'notice',
      content: { title: 'Supper moves to 5:30', body: 'The hall is being refinished.', severity: 'informational' },
    })
    expect(routine.outcome).toBe('published')
    expect(routine.contribution.attribution).toMatchObject({
      kind: 'organisation',
      orgName: 'First United Methodist Church',
      // The staff handle rides underneath the org name.
      handle: 'dana_h',
    })

    const urgent = await service.submit(dana, {
      townId: TOWN,
      type: 'notice',
      content: { title: 'Water over Old Post Road', body: 'The river came over at the bridge.', severity: 'urgent' },
    })
    expect(urgent.outcome).toBe('queued')
    expect(urgent.contribution.route).toBe('moderator')
  })

  it('schedules a notice, and nothing exists in the record until it is due', async () => {
    let clock = MONDAY
    const { service } = harness({ orgs: new OneOrg(), now: () => clock })
    const result = await service.submit(dana, {
      townId: TOWN,
      type: 'notice',
      content: {
        title: 'Vacation bible school sign ups open Friday',
        body: 'Forms are in the office.',
        severity: 'informational',
        publishAt: MONDAY + 4 * 60 * 60 * 1000,
      },
    })
    expect(result.outcome).toBe('scheduled')
    expect(result.record).toBeNull()
    expect(await service.sendDue(TOWN)).toHaveLength(0)

    clock = MONDAY + 5 * 60 * 60 * 1000
    const sent = await service.sendDue(TOWN)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.status).toBe('published')
  })

  it('refuses a photo outright, because there is nowhere to put the file', async () => {
    const { service } = harness()
    await expect(
      service.submit(dana, {
        townId: TOWN,
        type: 'photo',
        content: { imageRef: 'img-1', caption: 'Market morning on the square' },
      }),
    ).rejects.toMatchObject({ code: 'unavailable' })
  })
})

describe('corrections, and the dual attribution they create', () => {
  const aCorrection = {
    targetRef: 'biz-fat-daddys',
    targetLabel: "Fat Daddy's Bar-B-Que",
    field: 'hours',
    beforeValue: '11am to 8pm',
    newValue: '11am to 3pm',
    reason: 'Sign taped to the door since May, lunch only on Saturdays now.',
  }

  it('queues for a moderator, since nothing claims a listing yet', async () => {
    const listings = new Listings({ 'biz-fat-daddys': { hours: '11am to 8pm' } })
    const { service } = harness({ listings })

    const result = await service.submit(dana, { townId: TOWN, type: 'correction', content: aCorrection })
    expect(result.outcome).toBe('queued')
    expect(result.contribution.route).toBe('moderator')
    expect(await service.queue(mod, TOWN)).toHaveLength(1)
  })

  it('records the source and the resident as separate versions when it publishes', async () => {
    const listings = new Listings({ 'biz-fat-daddys': { hours: '11am to 8pm' } })
    const { service, records } = harness({ listings })

    const { contribution } = await service.submit(dana, {
      townId: TOWN,
      type: 'correction',
      content: aCorrection,
    })
    const decided = await service.decide(mod, contribution.id, 'approve', 'Rang them, that is right.')

    const versions = await records.versions(decided.record!.id)
    expect(versions).toHaveLength(2)
    // Version 1 is what the scrape said, attributed to the import. Version 2 is
    // the neighbour who read the sign. Both are in the record forever.
    expect(versions[0]!.author).toEqual({ kind: 'source', label: 'the directory import' })
    expect(versions[0]!.data['fields']).toEqual({ hours: '11am to 8pm' })
    expect(versions[1]!.author).toMatchObject({ kind: 'resident', handle: 'dana_h' })
    expect(versions[1]!.data['fields']).toEqual({ hours: '11am to 3pm' })
  })

  it('refuses to publish over the top of somebody who already fixed it', async () => {
    const listings = new Listings({ 'biz-fat-daddys': { hours: '11am to 8pm' } })
    const { service } = harness({ listings })

    const { contribution } = await service.submit(dana, {
      townId: TOWN,
      type: 'correction',
      content: aCorrection,
    })
    // Somebody else corrects the same field while this sits in the queue.
    listings.set('biz-fat-daddys', 'hours', '11am to 2pm')

    await expect(
      service.decide(mod, contribution.id, 'approve', 'looks right'),
    ).rejects.toMatchObject({ code: 'stale' })
  })

  it('refuses a correction to a listing that has left the directory', async () => {
    const { service } = harness({ listings: new Listings({}) })
    const { contribution } = await service.submit(dana, {
      townId: TOWN,
      type: 'correction',
      content: aCorrection,
    })
    await expect(service.decide(mod, contribution.id, 'approve', 'ok')).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})

describe('what a decision may and may not do', () => {
  it('is a moderator role, checked in the service and not only at the route', async () => {
    const { service } = harness()
    await expect(service.queue(dana as Moderator, TOWN)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('needs a note to turn something down, because the note is what a resident reads', async () => {
    const listings = new Listings({ 'b1': { hours: '9 to 5' } })
    const { service } = harness({ listings })
    const { contribution } = await service.submit(dana, {
      townId: TOWN,
      type: 'correction',
      content: {
        targetRef: 'b1',
        targetLabel: 'Somewhere',
        field: 'hours',
        beforeValue: '9 to 5',
        newValue: '9 to 6',
        reason: 'The sign in the window says six now.',
      },
    })
    await expect(service.decide(mod, contribution.id, 'decline', '   ')).rejects.toMatchObject({
      code: 'invalid',
    })
  })

  it('cannot decide the same thing twice', async () => {
    const listings = new Listings({ 'b1': { hours: '9 to 5' } })
    const { service } = harness({ listings })
    const { contribution } = await service.submit(dana, {
      townId: TOWN,
      type: 'correction',
      content: {
        targetRef: 'b1',
        targetLabel: 'Somewhere',
        field: 'hours',
        beforeValue: '9 to 5',
        newValue: '9 to 6',
        reason: 'The sign in the window says six now.',
      },
    })
    await service.decide(mod, contribution.id, 'decline', 'Not what I was told.')
    await expect(service.decide(mod, contribution.id, 'approve', '')).rejects.toMatchObject({
      code: 'conflict',
    })
  })
})

describe('the contributor only ever sees their own', () => {
  it('answers not_found for somebody else, never forbidden', async () => {
    const { service } = harness()
    const mine = await service.submit(dana, { townId: TOWN, type: 'event', content: anEvent })
    await expect(service.mineById(newcomer, mine.contribution.id)).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('withdraws something waiting, and refuses to withdraw something already up', async () => {
    const listings = new Listings({ 'b1': { hours: '9 to 5' } })
    const { service } = harness({ listings })
    const queued = await service.submit(dana, {
      townId: TOWN,
      type: 'correction',
      content: {
        targetRef: 'b1',
        targetLabel: 'Somewhere',
        field: 'hours',
        beforeValue: '9 to 5',
        newValue: '9 to 6',
        reason: 'The sign in the window says six now.',
      },
    })
    expect((await service.withdraw(dana, queued.contribution.id)).status).toBe('withdrawn')

    const live = await service.submit(dana, { townId: TOWN, type: 'event', content: anEvent })
    await expect(service.withdraw(dana, live.contribution.id)).rejects.toMatchObject({
      code: 'conflict',
    })
  })
})

describe('the pause', () => {
  it('lets nine through, pauses the tenth, and says when it lifts', async () => {
    let clock = MONDAY
    const { service } = harness({ now: () => clock })

    for (let n = 0; n < 9; n++) {
      clock = MONDAY + n * 60_000
      await service.submit(dana, { townId: TOWN, type: 'event', content: anEvent })
    }

    clock = MONDAY + 10 * 60_000
    const paused = await service
      .submit(dana, { townId: TOWN, type: 'event', content: anEvent })
      .catch((e: unknown) => e)
    expect(paused).toBeInstanceOf(ContributionError)
    expect((paused as ContributionError).code).toBe('paused')

    const options = await service.options(dana, TOWN)
    expect(options.pause.level).toBe('paused')
    // Rolling, not calendar: it lifts a day after the first of the nine.
    expect(options.pause.retryAt).toBe(MONDAY + 24 * 60 * 60 * 1000)
  })

  it('says a quiet line at seven without stopping anybody', async () => {
    let clock = MONDAY
    const { service } = harness({ now: () => clock })
    for (let n = 0; n < 7; n++) {
      clock = MONDAY + n * 60_000
      await service.submit(dana, { townId: TOWN, type: 'event', content: anEvent })
    }
    const options = await service.options(dana, TOWN)
    expect(options.pause.level).toBe('noticed')
    expect(options.notice).toContain('Eighth one today')
  })

  it('still takes corrections while publishing is paused', async () => {
    let clock = MONDAY
    const listings = new Listings({ 'b1': { hours: '9 to 5' } })
    const { service } = harness({ now: () => clock, listings })
    for (let n = 0; n < 9; n++) {
      clock = MONDAY + n * 60_000
      await service.submit(dana, { townId: TOWN, type: 'event', content: anEvent })
    }
    clock = MONDAY + 10 * 60_000

    const correction = await service.submit(dana, {
      townId: TOWN,
      type: 'correction',
      content: {
        targetRef: 'b1',
        targetLabel: 'Somewhere',
        field: 'hours',
        beforeValue: '9 to 5',
        newValue: '9 to 6',
        reason: 'The sign in the window says six now.',
      },
    })
    expect(correction.outcome).toBe('queued')
  })
})

describe('history, and putting a version back', () => {
  it('reverts forward, keeping the version it replaced', async () => {
    const listings = new Listings({ 'lib': { hours: '1pm to 5pm' } })
    const { service } = harness({ listings })

    const { contribution } = await service.submit(dana, {
      townId: TOWN,
      type: 'correction',
      content: {
        targetRef: 'lib',
        targetLabel: 'Pope County Library',
        field: 'hours',
        beforeValue: '1pm to 5pm',
        newValue: '1pm to 6pm',
        reason: 'New summer hours poster in the front window.',
      },
    })
    const { record } = await service.decide(mod, contribution.id, 'approve', 'Looks right.')

    const reverted = await service.revert(
      mod,
      record!.id,
      1,
      'The library rang: summer hours do not start until 7 June.',
    )
    expect(reverted.version).toBe(3)
    expect(reverted.revertedFrom).toBe(1)

    const { versions } = await service.history(record!.id)
    // Nothing was deleted. The contributor's version 2 is still theirs.
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3])
    expect(versions[1]!.author).toMatchObject({ handle: 'dana_h' })
  })

  it('will not revert to the version already on the record', async () => {
    const { service, records } = harness()
    const created = await records.create(
      {
        townId: TOWN,
        type: 'collection',
        data: { name: 'Where to eat before a Tech game' },
        sourceRef: null,
        author: { kind: 'resident', userId: 'u-dana', handle: 'dana_h' },
        contributionId: null,
      },
      MONDAY,
    )
    await expect(service.revert(mod, created.record.id, 1, 'because')).rejects.toMatchObject({
      code: 'conflict',
    })
  })
})
