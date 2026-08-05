import { describe, expect, it } from 'vitest'
import {
  Alerts,
  ALERT_TOPICS,
  DEFAULT_THRESHOLD,
  defaultPreferences,
  inQuietHours,
  MemoryAlertPreferenceStore,
} from './alerts.js'

const TOWN = 'russellville-ar'
const USER = 'u-dana'
const NOW = Date.UTC(2026, 5, 8, 15, 0)

const alerts = () => new Alerts({ store: new MemoryAlertPreferenceStore(), now: () => NOW })

describe('the default, which most people never change', () => {
  it('is urgent and up, with quiet hours on', () => {
    const prefs = defaultPreferences(TOWN, USER, NOW)
    expect(prefs.threshold).toBe('urgent')
    expect(DEFAULT_THRESHOLD).toBe('urgent')
    expect(prefs.quietHours.enabled).toBe(true)
  })

  it('applies to a resident who has never opened the screen', async () => {
    const prefs = await alerts().forUser(TOWN, USER)
    expect(prefs.threshold).toBe('urgent')
  })

  it('turns on the topics that reorganise a morning, and not the rest', async () => {
    const prefs = await alerts().forUser(TOWN, USER)
    // A school closing and a bin day change alter what somebody does tomorrow.
    // A rezoning notice does not, and spending the permission on it is how
    // notifications end up off in November.
    expect([...prefs.topics].sort()).toEqual(['nuclear_one', 'roads', 'school', 'trash'])
    expect(prefs.topics).not.toContain('planning')
    expect(prefs.topics).not.toContain('council_agendas')
  })
})

describe('saving a change', () => {
  it('takes one field at a time and leaves the rest alone', async () => {
    const service = alerts()
    await service.update(TOWN, USER, { threshold: 'advisory' })
    const after = await service.update(TOWN, USER, { topics: ['planning'] })

    expect(after.threshold).toBe('advisory')
    expect(after.topics).toEqual(['planning'])
    expect(after.quietHours.enabled).toBe(true)
  })

  it('refuses a threshold that is not on the ladder', async () => {
    await expect(alerts().update(TOWN, USER, { threshold: 'catastrophic' })).rejects.toMatchObject({
      code: 'invalid',
    })
  })

  it('refuses a topic nobody defined', async () => {
    await expect(alerts().update(TOWN, USER, { topics: ['gossip'] })).rejects.toMatchObject({
      code: 'invalid',
    })
  })

  it('has no field anywhere that would take an address', async () => {
    // Section 9 promises this in a sentence at the bottom of the screen. The
    // promise is only as good as the shape of the record behind it.
    const prefs = await alerts().forUser(TOWN, USER)
    expect(Object.keys(prefs).sort()).toEqual([
      'threshold',
      'topics',
      'townId',
      'quietHours',
      'updatedAt',
      'userId',
    ].sort())
  })
})

describe('the settings screen', () => {
  it('renders the emergency rung as locked rather than hiding it', async () => {
    const view = await alerts().view(TOWN, USER)
    const emergency = view.rungs.find((r) => r.severity === 'emergency')
    // A control you cannot find is worse than one you cannot move.
    expect(emergency?.locked).toBe(true)
    expect(view.rungs.filter((r) => r.locked)).toHaveLength(1)
  })

  it('says out loud that the emergency channel cannot be turned off', async () => {
    const view = await alerts().view(TOWN, USER)
    expect(view.emergencyNote).toContain('comes through on silent')
    expect(view.emergencyNote).toContain('no setting that turns that off')
  })

  it('offers every topic, with the ones that are on marked', async () => {
    const view = await alerts().view(TOWN, USER)
    expect(view.topics.map((t) => t.topic)).toEqual([...ALERT_TOPICS])
    expect(view.topics.find((t) => t.topic === 'school')?.on).toBe(true)
    expect(view.topics.find((t) => t.topic === 'planning')?.on).toBe(false)
  })
})

describe('whether one notice reaches one resident', () => {
  const service = alerts()
  const prefs = defaultPreferences(TOWN, USER, NOW)
  const NOON = 12 * 60
  const THREE_AM = 3 * 60

  it('never pushes an informational, for anybody', async () => {
    const loud = { ...prefs, threshold: 'informational' as const }
    const decision = service.decide(loud, { severity: 'informational' }, NOON)
    expect(decision.push).toBe(false)
    expect(decision.reason).toContain('for anyone')
  })

  it('drops something below the threshold', () => {
    expect(service.decide(prefs, { severity: 'advisory' }, NOON).push).toBe(false)
  })

  it('lets a subscribed topic through below the threshold', () => {
    const decision = service.decide(prefs, { severity: 'advisory', topic: 'school' }, NOON)
    expect(decision.push).toBe(true)
  })

  it('holds an urgent notice until morning during quiet hours', () => {
    const decision = service.decide(prefs, { severity: 'urgent' }, THREE_AM)
    expect(decision.push).toBe(true)
    expect(decision.heldUntilMorning).toBe(true)
  })

  it('sends an emergency at 3am, on silent, at every threshold', () => {
    for (const threshold of ['informational', 'advisory', 'urgent', 'emergency'] as const) {
      const decision = service.decide(
        { ...prefs, threshold, topics: [] },
        { severity: 'emergency' },
        THREE_AM,
      )
      expect(decision.push).toBe(true)
      expect(decision.heldUntilMorning).toBe(false)
    }
  })
})

describe('quiet hours', () => {
  it('wraps past midnight, which is the only interesting case', () => {
    const overnight = { fromMinute: 22 * 60, toMinute: 6 * 60 + 30 }
    expect(inQuietHours(overnight, 23 * 60)).toBe(true)
    expect(inQuietHours(overnight, 3 * 60)).toBe(true)
    expect(inQuietHours(overnight, 6 * 60 + 29)).toBe(true)
    expect(inQuietHours(overnight, 6 * 60 + 30)).toBe(false)
    expect(inQuietHours(overnight, 12 * 60)).toBe(false)
  })

  it('treats an empty window as no quiet hours rather than all day', () => {
    expect(inQuietHours({ fromMinute: 600, toMinute: 600 }, 600)).toBe(false)
  })
})
