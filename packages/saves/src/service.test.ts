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

  /**
   * A story is the first kind pointing outside the town's own data.
   *
   * The snapshot rule carries more weight here than anywhere else: a saved
   * business is still in the directory next week, and a saved story is a
   * headline on a newspaper's site that may be behind a wall, moved, or gone.
   * What is stored has to stand on its own.
   */
  it('saves a story, which is the one kind we do not host', async () => {
    const { save } = await saves.save(MAYA, {
      kind: 'story',
      refId: 'courier-www-couriernews-com-news-pcso-responds-t-198ms42',
      title: 'Chamber CEO graduates from CDI program',
      detail: 'The Courier',
      url: 'https://www.couriernews.com/news/chamber-ceo-graduates/article_x.html',
    })
    expect(save.kind).toBe('story')
    expect(save.title).toBe('Chamber CEO graduates from CDI program')
    expect(save.url).toBe('https://www.couriernews.com/news/chamber-ceo-graduates/article_x.html')
  })

  it('keeps a story and a business with the same refId apart', async () => {
    // `refId` is scoped by kind, not globally unique, and the news ids come
    // from a different generator than the directory's.
    await saves.save(MAYA, { ...HARDWARE, refId: 'same-id' })
    await saves.save(MAYA, { kind: 'story', refId: 'same-id', title: 'A headline', detail: 'The Courier' })
    expect((await saves.list(MAYA)).map((s) => s.kind).sort()).toEqual(['business', 'story'])
    expect(await saves.remove(MAYA, 'story', 'same-id')).toBe(true)
    expect((await saves.list(MAYA)).map((s) => s.kind)).toEqual(['business'])
  })

  /**
   * The reason the reader sends the source name as `detail` and not the summary.
   *
   * A third of the town's stories carry an RSS summary longer than 200
   * characters, and `detail` refuses rather than truncates — correctly, for a
   * field a person typed. A bookmark button that fails on a third of the feed
   * would have been the bug; the source name is both short and the thing the
   * saved list actually shows.
   */
  it('refuses an over-long detail rather than clipping it', async () => {
    await expect(
      saves.save(MAYA, { ...HARDWARE, kind: 'story', detail: 'x'.repeat(201) }),
    ).rejects.toThrow(/longer than/)
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
