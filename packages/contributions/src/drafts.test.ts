import { describe, expect, it } from 'vitest'
import { Drafts, draftTitle, MAX_DRAFTS } from './drafts.js'
import { MemoryDraftStore } from './memory.js'

const TOWN = 'russellville-ar'
const dana = { townId: TOWN, userId: 'u-dana' }
const luis = { townId: TOWN, userId: 'u-luis' }
const NOW = Date.UTC(2026, 5, 8, 15, 0)

const drafts = (now = () => NOW) => new Drafts({ store: new MemoryDraftStore(), now })

describe('autosave', () => {
  it('creates on the first save and updates on the next, without being told which', async () => {
    const service = drafts()
    const first = await service.save(dana, { type: 'event', content: { title: 'Summer reading' } })
    const second = await service.save(dana, {
      id: first.id,
      type: 'event',
      content: { title: 'Summer reading kickoff' },
    })

    expect(second.id).toBe(first.id)
    expect(await service.list(dana)).toHaveLength(1)
    expect(second.title).toBe('Summer reading kickoff')
  })

  it('keeps half-finished work, because a draft that validated would lose the race', async () => {
    const service = drafts()
    // No start time, no category. Nothing here would publish, and that is fine.
    const draft = await service.save(dana, { type: 'event', content: { title: 'Something' } })
    expect(draft.content).toEqual({ title: 'Something' })
  })

  it('starts a fresh draft rather than failing when the id is not recognised', async () => {
    const service = drafts()
    const draft = await service.save(dana, { id: 'gone', type: 'photo', content: {} })
    expect(draft.id).not.toBe('gone')
    expect(draft.title).toBe('Untitled photo')
  })

  it('refuses a type that is not one of the five', async () => {
    await expect(drafts().save(dana, { type: 'rant', content: {} })).rejects.toMatchObject({
      code: 'invalid',
    })
  })

  it('caps the list', async () => {
    const service = drafts()
    for (let n = 0; n < MAX_DRAFTS; n++) {
      await service.save(dana, { type: 'event', content: { title: `draft ${n}` } })
    }
    await expect(service.save(dana, { type: 'event', content: {} })).rejects.toMatchObject({
      code: 'conflict',
    })
  })
})

describe('a draft is private, and there is no way to say otherwise', () => {
  it('answers not_found for somebody else, the same as for nothing', async () => {
    const service = drafts()
    const mine = await service.save(dana, { type: 'event', content: { title: 'Mine' } })
    await expect(service.get(luis, mine.id)).rejects.toMatchObject({ code: 'not_found' })
    await expect(service.get(dana, 'no-such-thing')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('does not let somebody else overwrite one either', async () => {
    const service = drafts()
    const mine = await service.save(dana, { type: 'event', content: { title: 'Mine' } })
    const theirs = await service.save(luis, { id: mine.id, type: 'event', content: { title: 'Not yours' } })

    expect(theirs.id).not.toBe(mine.id)
    expect((await service.get(dana, mine.id)).title).toBe('Mine')
  })

  it('does not let somebody else discard one', async () => {
    const service = drafts()
    const mine = await service.save(dana, { type: 'event', content: { title: 'Mine' } })
    expect(await service.discard(luis, mine.id)).toBe(false)
    expect(await service.list(dana)).toHaveLength(1)
  })
})

describe('discard and tidy', () => {
  it('is a real delete, because a draft was never published', async () => {
    const service = drafts()
    const mine = await service.save(dana, { type: 'event', content: { title: 'Mine' } })
    expect(await service.discard(dana, mine.id)).toBe(true)
    expect(await service.list(dana)).toHaveLength(0)
    // Throwing away something already gone is a success. It is already gone.
    expect(await service.discard(dana, mine.id)).toBe(false)
  })

  it('finds what has been untouched past the ninety days', async () => {
    let clock = NOW
    const service = drafts(() => clock)
    await service.save(dana, { type: 'event', content: { title: 'Old' } })
    clock = NOW + 91 * 24 * 60 * 60 * 1000
    await service.save(dana, { type: 'event', content: { title: 'New' } })

    const expired = await service.tidy()
    expect(expired.map((d) => d.title)).toEqual(['Old'])
  })
})

describe('what the list calls something', () => {
  it('uses whichever field the composer had a title in', () => {
    expect(draftTitle('event', { title: 'Summer reading kickoff' })).toBe('Summer reading kickoff')
    expect(draftTitle('collection', { name: 'Where to eat' })).toBe('Where to eat')
    expect(draftTitle('photo', { caption: 'Market morning' })).toBe('Market morning')
    expect(draftTitle('correction', { targetLabel: "Fat Daddy's" })).toBe("Fat Daddy's")
  })

  it('names the type rather than leaving a blank row', () => {
    expect(draftTitle('photo', {})).toBe('Untitled photo')
  })
})
