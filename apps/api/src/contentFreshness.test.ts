import { describe, expect, it } from 'vitest'
import { retainMissingSources, summarizeContent, type FeedHealth } from './contentFreshness.js'
import type { TownSquareItem } from './today.js'

const at = Date.parse('2026-10-02T01:00:00Z')
const base = { description: '', tags: [], community: 'Russellville', createdAt: '', updatedAt: '' }
const story: TownSquareItem = { ...base, id: 'news', title: 'A real story', type: 'story', source: 'arkansas-tech', body: '', publishedAt: '2026-10-01T12:00:00Z' }
const listing: TownSquareItem = { ...base, id: 'place', title: 'Directory listing', type: 'business', source: 'rvts-directory', name: 'Directory listing', category: 'food', address: 'Russellville' }
const alert: TownSquareItem = { ...base, id: 'notice', title: 'Alert', type: 'notice', source: 'nws-weather', severity: 'warning', isActive: true }
const feed = (overrides: Partial<FeedHealth> = {}): FeedHealth => ({
  id: 'atu-rss', sourceIds: ['arkansas-tech'], kinds: ['story'], state: 'available', itemCount: 1,
  checkedAt: new Date(at).toISOString(), lastFetched: new Date(at).toISOString(), lastDataAt: new Date(at).toISOString(), stale: false,
  ...overrides,
})

describe('honest content freshness', () => {
  it('never treats hundreds of static listings as fresh live content', () => {
    const listings = Array.from({ length: 741 }, (_, i) => ({ ...listing, id: `place-${i}` }))
    const status = summarizeContent(listings, [feed({ state: 'empty', itemCount: 0, lastDataAt: null })], at, at)
    expect(status).toMatchObject({ count: 741, staticCount: 741, liveCount: 0, freshLiveCount: 0, lastLiveDataAt: null, stale: true, status: 'unavailable' })
  })

  it('retains a failed source snapshot while exposing its original data time', () => {
    const old = new Date(at - 3600_000).toISOString()
    const health = [feed({ state: 'empty', itemCount: 0, lastDataAt: old })]
    const rows = retainMissingSources([story, listing], [listing], health)
    expect(rows.map((item) => item.id)).toContain('news')
    expect(summarizeContent(rows, health, at, at)).toMatchObject({ lastLiveDataAt: old, liveCount: 1, staleLiveCount: 1, stale: true, status: 'stale' })
  })

  it('does not resurrect cleared alerts or records removed from a returning source', () => {
    const health = [feed(), feed({ id: 'nws', sourceIds: ['nws-weather'], kinds: ['notice'], state: 'empty', itemCount: 0 })]
    expect(retainMissingSources([story, alert], [], health)).toEqual([])
  })

  it('reports partial coverage without calling the whole collection stale', () => {
    const health = [feed(), feed({ id: 'other', sourceIds: ['chamber'], kinds: ['event'], state: 'empty', itemCount: 0, lastDataAt: null })]
    expect(summarizeContent([story, listing], health, at, at)).toMatchObject({ freshLiveCount: 1, staleLiveCount: 0, status: 'partial', stale: false })
    expect(summarizeContent([story, listing], health, at, at + 31 * 60_000)).toMatchObject({ freshLiveCount: 0, staleLiveCount: 1, status: 'stale', stale: true })
  })

  it('treats legacy disk caches without source timestamps as unverified', () => {
    expect(summarizeContent([story, listing], [], at, at)).toMatchObject({ freshLiveCount: 0, stale: true, lastLiveDataAt: null })
  })
})
