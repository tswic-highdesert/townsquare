import { describe, expect, it } from 'vitest'
import { isLocalEvent, distinctVenues } from './localEvents.js'
import type { EventItem } from '../../../packages/feed/src/lib/types.js'
const event = (id: string, location: string, tags = ['athletics']): EventItem => ({ id, title:id, location, tags,
  type:'event', description:'', source:'arkansas-tech', community:'Russellville', startDate:'2026-10-02T00:00:00Z', createdAt:'', updatedAt:'' })
describe('local discovery', () => {
  it('does not call a university away game a local outing', () => {
    expect(isLocalEvent(event('away','Bethany, Okla.'))).toBe(false)
    expect(isLocalEvent(event('home','Tucker Coliseum'))).toBe(true)
    expect(isLocalEvent(event('unknown','Location TBA'))).toBe(false)
    expect(isLocalEvent(event('regional','Ozark', ['music']))).toBe(true)
  })
  it('keeps the first glimpse varied across locations', () => {
    const events = [event('act1','Mulberry Mountain',[]),event('act2','Mulberry Mountain',[]),event('gallery','Norman Hall',[])]
    expect(distinctVenues(events,3).map((item)=>item.id)).toEqual(['act1','gallery'])
  })
})
