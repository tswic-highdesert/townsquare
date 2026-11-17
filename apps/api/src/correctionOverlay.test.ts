import { describe, expect, it } from 'vitest'
import type { TownRecord } from '@townsquare/contributions'
import type { TownSquareItem } from './today.js'
import { applyApprovedCorrections } from './correctionOverlay.js'
const TOWN = 'russellville-ar'
const business: TownSquareItem = { id: 'biz-example', type: 'business', title: 'Source name', name: 'Source name', description: '', category: 'Park', address: 'Source address', phone: '479-555-0100', hours: 'Unknown', geo: { lat: 35.28, lng: -93.13 }, source: 'source', tags: [], community: TOWN, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
function record(fields: Record<string, unknown>, changes: Partial<TownRecord> = {}): TownRecord {
  return { id: 'record', townId: TOWN, type: 'business', data: { fields }, currentVersion: 2, status: 'active', sourceRef: business.id, createdAt: 1, updatedAt: 2, ...changes }
}

describe('approved correction overlay', () => {
  it('copies only supported public fields without mutating the source or exposing attribution', () => {
    const [changed] = applyApprovedCorrections([business], [record({ name: 'Reviewed name', phone: '479-555-0101', hours: 'Mon 9am to 5pm', userId: 'private', website: 'https://bad.example' })], TOWN)
    expect(changed).toMatchObject({ name: 'Reviewed name', title: 'Reviewed name', phone: '479-555-0101', hours: 'Mon 9am to 5pm', updatedAt: '2026-01-01' })
    expect(changed).not.toHaveProperty('userId')
    expect(changed).not.toHaveProperty('website')
    expect(business.name).toBe('Source name')
  })
  it('removes an outdated map pin after an address correction', () => {
    expect(applyApprovedCorrections([business], [record({ address: 'Reviewed address' })], TOWN)[0]).not.toHaveProperty('geo')
    expect(business.geo).toBeDefined()
  })
  it('hides a reviewed closure and restores it when reverted to the empty baseline', () => {
    expect(applyApprovedCorrections([business], [record({ closed: 'Permanently closed, checked by moderator' })], TOWN)).toEqual([])
    expect(applyApprovedCorrections([business], [record({ closed: '' })], TOWN)).toHaveLength(1)
  })
  it('ignores other towns, inactive records, missing targets, malformed fields and non-business records', () => {
    for (const candidate of [record({ name: 'Wrong' }, { townId: 'another-town' }), record({ name: 'Wrong' }, { status: 'hidden' }), record({ name: 'Wrong' }, { sourceRef: 'gone' }), record({}, { data: { fields: [] } }), record({ name: 'Wrong' }, { type: 'event' })]) {
      expect(applyApprovedCorrections([business], [candidate], TOWN)).toEqual([business])
    }
  })
})
