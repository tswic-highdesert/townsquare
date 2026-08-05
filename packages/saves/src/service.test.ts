import { beforeEach, describe, expect, it } from 'vitest'
import { MemorySaveStore } from './store.js'
import { MAX_SAVES, Saves, SavesError } from './service.js'

const TOWN = 'russellville-ar'
const MAYA = { townId: TOWN, userId: 'u_maya' }
const LUIS = { townId: TOWN, userId: 'u_luis' }

const HARDWARE = {
  kind: 'business',
  refId: 'biz-hickory-ash',
  title: 'Hickory & Ash',
  detail: 'Woodshop · open until 4 PM',
  url: 'https://hickoryandash.example',
}

describe('Saves', () => {
  let saves: Saves

  beforeEach(() => {
    saves = new Saves({ store: new MemorySaveStore() })
  })

  it('keeps what was saved, not a pointer to it', async () => {
    const { save } = await saves.save(MAYA, HARDWARE)
    expect(save.title).toBe('Hickory & Ash')
    expect(save.detail).toBe('Woodshop · open until 4 PM')
    expect(save.kind).toBe('business')
  })

  it('lists newest first', async () => {
    let clock = 1000
    saves = new Saves({ store: new MemorySaveStore(), now: () => (clock += 1000) })
    await saves.save(MAYA, HARDWARE)
    await saves.save(MAYA, { ...HARDWARE, refId: 'biz-el-sol', title: 'Taquería El Sol' })
    expect((await saves.list(MAYA)).map((s) => s.title)).toEqual([
      'Taquería El Sol',
      'Hickory & Ash',
    ])
  })

  /** Pressing the bookmark twice is someone checking. It is not an error. */
  it('answers a second save with the first one', async () => {
    const first = await saves.save(MAYA, HARDWARE)
    const again = await saves.save(MAYA, { ...HARDWARE, title: 'Hickory and Ash' })

    expect(again.duplicate).toBe(true)
    expect(again.save.id).toBe(first.save.id)
    expect(again.save.title).toBe('Hickory & Ash')
    expect(await saves.count(MAYA)).toBe(1)
  })

  it('is scoped to one resident, both ways', async () => {
    await saves.save(MAYA, HARDWARE)
    expect(await saves.list(LUIS)).toEqual([])

    // Luis saving the same listing is his own row, not a share of hers.
    const his = await saves.save(LUIS, HARDWARE)
    expect(his.duplicate).toBe(false)
    expect(await saves.count(MAYA)).toBe(1)
    expect(await saves.count(LUIS)).toBe(1)
  })

  it('will not let one resident unsave another one’s row', async () => {
    await saves.save(MAYA, HARDWARE)
    expect(await saves.remove(LUIS, 'business', HARDWARE.refId)).toBe(false)
    expect(await saves.count(MAYA)).toBe(1)
  })

  it('treats unsaving something never saved as done', async () => {
    expect(await saves.remove(MAYA, 'business', 'biz-nothing')).toBe(false)
  })

  it('removes only the row named', async () => {
    await saves.save(MAYA, HARDWARE)
    await saves.save(MAYA, { ...HARDWARE, kind: 'event', refId: 'ev-concert', title: 'Concert' })

    expect(await saves.remove(MAYA, 'business', HARDWARE.refId)).toBe(true)
    expect((await saves.list(MAYA)).map((s) => s.kind)).toEqual(['event'])
  })

  it('refuses a kind outside the closed set', async () => {
    await expect(saves.save(MAYA, { ...HARDWARE, kind: 'person' })).rejects.toThrow(SavesError)
  })

  it('refuses a save with nothing to show for it', async () => {
    await expect(saves.save(MAYA, { ...HARDWARE, title: '   ' })).rejects.toThrow(/title/)
    await expect(saves.save(MAYA, { ...HARDWARE, refId: '' })).rejects.toThrow(/refId/)
  })

  it('refuses rather than truncates an over-long field', async () => {
    await expect(saves.save(MAYA, { ...HARDWARE, title: 'x'.repeat(141) })).rejects.toThrow(
      /longer than/,
    )
  })

  /**
   * The saved row is rendered as an anchor in the shell, which is the origin
   * holding the session cookie.
   */
  it('refuses a url that is not http or https', async () => {
    await expect(
      saves.save(MAYA, { ...HARDWARE, url: 'javascript:alert(document.cookie)' }),
    ).rejects.toThrow(/http/)
    await expect(saves.save(MAYA, { ...HARDWARE, url: 'not a url' })).rejects.toThrow(/absolute/)
  })

  it('stops at the cap, and says so', async () => {
    for (let i = 0; i < MAX_SAVES; i++) {
      await saves.save(MAYA, { ...HARDWARE, refId: `biz-${i}` })
    }
    await expect(saves.save(MAYA, { ...HARDWARE, refId: 'one-too-many' })).rejects.toThrow(
      /Remove one/,
    )
  })

  /** At the cap you can still confirm what you already have. */
  it('lets a resident at the cap re-save something they already saved', async () => {
    for (let i = 0; i < MAX_SAVES; i++) {
      await saves.save(MAYA, { ...HARDWARE, refId: `biz-${i}` })
    }
    const again = await saves.save(MAYA, { ...HARDWARE, refId: 'biz-0' })
    expect(again.duplicate).toBe(true)
  })
})
