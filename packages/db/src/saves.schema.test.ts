/**
 * The saves table against the store that is currently enforcing its rules.
 *
 * `packages/saves` shipped with a `MemorySaveStore` whose duplicate check cited
 * `saves_user_target_uq` in a comment, and that index did not exist anywhere.
 * For a while the memory implementation was the only thing enforcing a rule
 * that is meant to be structural, which is the state every other store here is
 * shaped to avoid: a constraint is enforced in the same place twice, so a
 * second door onto saving cannot arrive without it.
 *
 * This is the third place, and its job is narrow. It needs no database — it
 * reads the table definition and asserts the index columns are the tuple the
 * memory store actually dedupes on. `packages/db/src/ingest.test.ts` is the
 * suite that talks to real Postgres and needs Docker; this one runs everywhere
 * and catches the failure that matters, which is the two definitions drifting
 * apart while each looks correct on its own.
 *
 * It lives in `packages/db` rather than beside the store, for a boring reason
 * worth writing down: `drizzle-orm` is a dependency of this package and not of
 * `packages/saves`, so a test importing the table definition can only run here.
 * The store comes back the other way by deep path, which is the same
 * cross-package shape `apps/api/src/main.ts` already uses for `businesses` and
 * `loadExampleCreations`.
 */

import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { saves } from './schema.js'
import { MemorySaveStore, SAVE_KINDS } from '../../saves/src/store.js'

const config = getTableConfig(saves)
const index = (name: string) => config.indexes.find((i) => i.config.name === name)
const columns = (name: string) =>
  index(name)?.config.columns.map((c) => ('name' in c ? c.name : String(c)))

describe('the saves table', () => {
  it('is keyed the way the store looks a save up', () => {
    // `MemorySaveStore.find(townId, userId, kind, refId)` is the uniqueness
    // probe. If that signature and this index disagree, one of them is letting
    // a duplicate through.
    expect(columns('saves_user_target_uq')).toEqual(['town_id', 'user_id', 'kind', 'ref_id'])
    expect(index('saves_user_target_uq')?.config.unique).toBe(true)
  })

  it('is total rather than partial, unlike the reports duplicate rule', () => {
    // A report may be filed again once the first is resolved: that is a new
    // complaint about a new situation. A bookmark has no lifecycle, so there is
    // no `where` clause and pressing the button twice stays one row.
    expect(index('saves_user_target_uq')?.config.where).toBeUndefined()
  })

  it('indexes the one read this surface makes', () => {
    expect(columns('saves_user_idx')).toEqual(['town_id', 'user_id', 'saved_at'])
  })

  it('requires everything that makes a row readable, and nothing more', () => {
    for (const required of ['town_id', 'user_id', 'kind', 'ref_id', 'title', 'saved_at']) {
      expect(config.columns.find((c) => c.name === required)?.notNull).toBe(true)
    }
    // The snapshot is allowed to be thin: a business has no detail and most
    // things have no url. The title is what makes a row readable at all, so it
    // is the one that cannot be null.
    expect(config.columns.find((c) => c.name === 'detail')?.notNull).toBe(false)
    expect(config.columns.find((c) => c.name === 'url')?.notNull).toBe(false)
  })

  it('holds the kinds as text, and lets the service own the closed set', async () => {
    // Deliberate: `story` joined `SAVE_KINDS` after this table was shaped, and
    // an enum would have made that a migration rather than a one-line change.
    // The set is checked in `Saves.save`, which is where a resident gets a
    // sentence about it rather than a driver error.
    expect(config.columns.find((c) => c.name === 'kind')?.dataType).toBe('string')
    expect([...SAVE_KINDS]).toContain('story')

    // And the rule is really enforced: two kinds sharing a refId are two
    // different saves, which is the case a narrower index would silently break.
    const store = new MemorySaveStore()
    const row = { townId: 't', userId: 'u', refId: 'x1', title: 'A thing', detail: null, url: null }
    await store.create({ ...row, kind: 'story' }, 1)
    await store.create({ ...row, kind: 'business' }, 2)
    expect(await store.count('t', 'u')).toBe(2)
    expect(await store.find('t', 'u', 'story', 'x1')).not.toBeNull()
  })
})
