import { describe, expect, it } from 'vitest'
import { digestContent, LIMITS, validateContent } from './content.js'

const NOW = Date.UTC(2026, 5, 8, 15, 0)
const NEXT_WEEK = NOW + 7 * 24 * 60 * 60 * 1000

const anEvent = {
  title: 'Homecoming supper and singing',
  startsAt: NEXT_WEEK,
  category: 'church',
  cost: 'free',
}

describe('an event', () => {
  it('takes a confirmed instant and refuses prose', () => {
    expect(() =>
      validateContent('event', { ...anEvent, startsAt: 'saturday at 7' }, NOW),
    ).toThrowError(/confirmed time/)
  })

  it('refuses a start time that has already been and gone', () => {
    expect(() =>
      validateContent('event', { ...anEvent, startsAt: NOW - 3 * 24 * 60 * 60 * 1000 }, NOW),
    ).toThrowError(/already passed/)
  })

  it('allows this morning, so somebody adding today at noon is not fighting the form', () => {
    const content = validateContent('event', { ...anEvent, startsAt: NOW - 60 * 60 * 1000 }, NOW)
    expect(content.kind).toBe('event')
  })

  it('refuses an end before the start', () => {
    expect(() =>
      validateContent('event', { ...anEvent, endsAt: NEXT_WEEK - 1000 }, NOW),
    ).toThrowError(/finish before it starts/)
  })

  it('refuses a javascript: link, before it is ever stored', () => {
    expect(() =>
      // eslint-disable-next-line no-script-url
      validateContent('event', { ...anEvent, link: 'javascript:alert(1)' }, NOW),
    ).toThrowError(/http or https/)
  })

  it('takes a place as a listing or a name, and never an address it invents', () => {
    const content = validateContent(
      'event',
      { ...anEvent, place: { listingId: 'biz-1', name: 'Pleasant Grove Baptist Church' } },
      NOW,
    )
    if (content.kind !== 'event') throw new Error('expected an event')
    expect(content.place).toEqual({ listingId: 'biz-1', name: 'Pleasant Grove Baptist Church' })
  })

  it('refuses over-length rather than truncating it', () => {
    const description = 'x'.repeat(LIMITS.eventDescription + 23)
    expect(() => validateContent('event', { ...anEvent, description }, NOW)).toThrowError(
      /23 characters over/,
    )
  })

  it('lowercases and de-duplicates tags', () => {
    const content = validateContent('event', { ...anEvent, tags: ['Market', 'market', 'Downtown'] }, NOW)
    if (content.kind !== 'event') throw new Error('expected an event')
    expect(content.tags).toEqual(['market', 'downtown'])
  })
})

describe('a correction', () => {
  const base = {
    targetRef: 'biz-1',
    targetLabel: "Fat Daddy's Bar-B-Que",
    field: 'hours',
    beforeValue: '11am to 8pm',
    newValue: '11am to 3pm',
  }

  it('will not go through without a reason, because the reason is what gets read', () => {
    expect(() => validateContent('correction', base, NOW)).toThrowError(/reason is required/)
  })

  it('takes one field, from a closed list', () => {
    expect(() =>
      validateContent('correction', { ...base, field: 'everything', reason: 'because' }, NOW),
    ).toThrowError(/field must be one of/)
  })
})

describe('a collection', () => {
  it('needs something in it', () => {
    expect(() => validateContent('collection', { name: 'Empty', items: [] }, NOW)).toThrowError(
      /at least one thing/,
    )
  })

  it('keeps the order given, and drops a repeat', () => {
    const content = validateContent(
      'collection',
      {
        name: 'Where to eat before a Tech game',
        items: [
          { kind: 'business', refId: 'b2', label: "Stoby's" },
          { kind: 'business', refId: 'b1', label: "Fat Daddy's" },
          { kind: 'business', refId: 'b2', label: "Stoby's" },
        ],
      },
      NOW,
    )
    if (content.kind !== 'collection') throw new Error('expected a collection')
    expect(content.items.map((i) => i.refId)).toEqual(['b2', 'b1'])
  })
})

describe('a notice', () => {
  it('treats a send time that has slipped past as now, rather than an error', () => {
    const content = validateContent(
      'notice',
      { title: 'Supper is early', body: 'In the gym.', severity: 'informational', publishAt: NOW - 5000 },
      NOW,
    )
    if (content.kind !== 'notice') throw new Error('expected a notice')
    expect(content.publishAt).toBeNull()
  })

  it('refuses a send time three months out', () => {
    expect(() =>
      validateContent(
        'notice',
        {
          title: 'Supper is early',
          body: 'In the gym.',
          severity: 'informational',
          publishAt: NOW + 200 * 24 * 60 * 60 * 1000,
        },
        NOW,
      ),
    ).toThrowError(/ninety days/)
  })
})

describe('the pin', () => {
  it('does not depend on the order the keys happened to be written in', () => {
    const a = validateContent('event', anEvent, NOW)
    const b = validateContent('event', { cost: 'free', category: 'church', startsAt: NEXT_WEEK, title: anEvent.title }, NOW)
    expect(digestContent(a)).toBe(digestContent(b))
  })

  it('changes when a single character of the content does', () => {
    const a = validateContent('event', anEvent, NOW)
    const b = validateContent('event', { ...anEvent, title: `${anEvent.title}.` }, NOW)
    expect(digestContent(a)).not.toBe(digestContent(b))
  })
})

describe('the emergency rung', () => {
  it('cannot be typed into a form, at any standing', () => {
    // Section 9: emergency breaks through a silent phone and is the one channel
    // a resident cannot turn off. Refused in validation rather than in the gate
    // matrix, because this is not a question of who is allowed to send one.
    expect(() =>
      validateContent(
        'notice',
        { title: 'Tornado warning', body: 'Take shelter now.', severity: 'emergency' },
        NOW,
      ),
    ).toThrowError(/severity must be one of informational, advisory, urgent/)
  })
})
