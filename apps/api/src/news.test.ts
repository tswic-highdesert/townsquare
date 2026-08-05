/**
 * What the news surface promises, tested without a browser or a live scrape.
 *
 * Three claims carry the whole section and all three are testable here: that
 * a timestamp never reads as something that has not happened yet, that a
 * cluster is two newsrooms on one event and never one newsroom on two days,
 * and that nothing on the screen is invented. The last one shows up as
 * assertions that a field is *absent* — the byline with no author, the
 * cluster that does not form.
 */

import { describe, expect, it } from 'vitest'
import {
  assembleNews,
  assembleStory,
  cleanByline,
  cleanSummary,
  clusterStories,
  decodeEntities,
  newsStamp,
  sourceDomain,
  sourceTint,
  titleTokens,
  topicCounts,
  topicsOf,
  type NewsSourceInfo,
  type NewsStory,
} from './news.js'
import type { TownSquareItem } from './today.js'

const TOWN = { id: 'russellville-ar', name: 'Russellville', timezone: 'America/Chicago' }
const TZ = TOWN.timezone

const SOURCES = new Map<string, NewsSourceInfo>([
  ['the-courier', { id: 'the-courier', name: 'The Courier', type: 'media' }],
  ['arkansas-tech', { id: 'arkansas-tech', name: 'Arkansas Tech University', type: 'education' }],
])

function story(
  over: Partial<TownSquareItem> & { id: string; publishedAt: string },
): TownSquareItem {
  return {
    type: 'story',
    title: 'A story',
    description: 'Summary.',
    body: 'Summary.',
    source: 'the-courier',
    tags: [],
    community: 'Russellville',
    url: 'https://www.couriernews.com/news/a-story/',
    createdAt: over.publishedAt,
    updatedAt: over.publishedAt,
    ...over,
  } as TownSquareItem
}

function build(items: TownSquareItem[], now: string, topic?: string | null) {
  return assembleNews({ now, town: TOWN, items, sources: SOURCES, topic: topic ?? null })
}

/* ── text off a scraper ─────────────────────────────────────────────────── */

describe('decodeEntities', () => {
  it('decodes the numeric entities RSS actually ships', () => {
    // A real title in this town's feed. Rendered raw it reads as our bug.
    expect(decodeEntities('Fall &#8217;26 ATU Student Activities Board Events Announced')).toBe(
      'Fall ’26 ATU Student Activities Board Events Announced',
    )
  })

  it('decodes named and hex entities', () => {
    expect(decodeEntities('Boys &amp; Girls Club')).toBe('Boys & Girls Club')
    expect(decodeEntities('caf&#xe9;')).toBe('café')
  })

  it('leaves something that only looks like an entity alone', () => {
    expect(decodeEntities('Rates rose 4&5 percent; see the filing')).toBe(
      'Rates rose 4&5 percent; see the filing',
    )
    expect(decodeEntities('&notareal;')).toBe('&notareal;')
  })
})

describe('cleanSummary', () => {
  it('turns the feed truncation marker into an ellipsis', () => {
    expect(
      cleanSummary('Ten members of the community participated in an orientation [&#8230;]'),
    ).toBe('Ten members of the community participated in an orientation…')
  })

  it('leaves a bracketed aside inside the sentence alone', () => {
    expect(cleanSummary('The board [the full board] voted.')).toBe('The board [the full board] voted.')
  })
})

describe('cleanByline', () => {
  it('drops the label and the reporter’s work email', () => {
    expect(cleanByline('By Travis Simpson tsimpson@couriernews.com')).toBe('Travis Simpson')
  })

  it('leaves the casing exactly as the paper filed it', () => {
    // Title-casing this would turn ATU into Atu, which misspells an
    // institution to fix a house style that is not ours to fix.
    expect(cleanByline('By ATU MEDIA RELATIONS')).toBe('ATU MEDIA RELATIONS')
    expect(cleanByline('By SEN. JOHN BOOZMAN')).toBe('SEN. JOHN BOOZMAN')
  })

  it('is null when there is no byline, rather than a placeholder', () => {
    expect(cleanByline(undefined)).toBeNull()
    expect(cleanByline('   ')).toBeNull()
    expect(cleanByline('tsimpson@couriernews.com')).toBeNull()
  })
})

describe('sourceDomain', () => {
  it('is the host the tap actually lands on, without the www', () => {
    expect(sourceDomain('https://www.couriernews.com/news/a/article_x.html')).toBe('couriernews.com')
    expect(sourceDomain('https://www.arkansastechnews.com/a-story/')).toBe('arkansastechnews.com')
  })

  it('is null on anything that is not a web link, rather than throwing', () => {
    expect(sourceDomain(undefined)).toBeNull()
    expect(sourceDomain('not a url')).toBeNull()
    expect(sourceDomain('javascript:alert(1)')).toBeNull()
  })
})

describe('sourceTint', () => {
  it('is stable for a domain and inside the ramp', () => {
    const tint = sourceTint('couriernews.com')
    expect(sourceTint('couriernews.com')).toBe(tint)
    expect(['navy', 'sage', 'gold', 'terracotta', 'ink']).toContain(tint)
  })
})

/* ── time ───────────────────────────────────────────────────────────────── */

describe('newsStamp', () => {
  const now = '2026-08-05T18:30:00.000Z' // 1:30pm in Russellville
  const nowMs = Date.parse(now)
  const today = '2026-08-05'
  const stamp = (iso: string) => newsStamp(iso, TZ, today, nowMs)

  it('counts minutes for exactly one hour and no further', () => {
    expect(stamp('2026-08-05T18:29:40.000Z').label).toBe('just now')
    expect(stamp('2026-08-05T18:29:00.000Z').label).toBe('1 minute ago')
    expect(stamp('2026-08-05T18:12:00.000Z').label).toBe('18 minutes ago')
    // One hour and a minute is the same day, so it is words rather than 61.
    // 17:29Z is 12:29pm in Russellville, which is the afternoon.
    expect(stamp('2026-08-05T17:29:00.000Z').label).toBe('this afternoon')
  })

  it('marks only the first hour as fresh', () => {
    expect(stamp('2026-08-05T18:12:00.000Z').fresh).toBe(true)
    expect(stamp('2026-08-05T17:00:00.000Z').fresh).toBe(false)
  })

  it('cuts the part of day at noon and six, in the town’s clock', () => {
    expect(stamp('2026-08-05T16:00:00.000Z').label).toBe('this morning') // 11am
    expect(stamp('2026-08-05T17:30:00.000Z').label).toBe('this afternoon') // 12:30pm
  })

  it('keeps the part of day on yesterday', () => {
    // A council vote at 11:04pm and a press release at 9am are different
    // answers to "when did this happen", and "Yesterday" gives neither.
    expect(stamp('2026-08-05T04:04:00.000Z').label).toBe('yesterday evening')
    expect(stamp('2026-08-04T15:00:00.000Z').label).toBe('yesterday morning')
  })

  it('hands anything older to storyStamp rather than re-deciding it', () => {
    expect(stamp('2026-08-03T15:00:00.000Z').label).toBe('Monday')
    expect(stamp('2026-07-21T15:00:00.000Z').label).toBe('Jul 21')
  })

  it('counts minutes across the midnight boundary', () => {
    // Filed at 11:50pm, read at 12:20am. It is thirty minutes old whatever
    // the calendar says, and "yesterday evening" would be absurd.
    const at = Date.parse('2026-08-06T05:20:00.000Z') // 12:20am the 6th
    expect(newsStamp('2026-08-06T04:50:00.000Z', TZ, '2026-08-06', at).label).toBe('30 minutes ago')
  })
})

/* ── topics ─────────────────────────────────────────────────────────────── */

describe('topics', () => {
  it('collapses the tags that are one subject', () => {
    // Every `editorial` in this feed also carries `opinion`, and the three
    // university tags are one set on one source. Three chips for one topic is
    // a rail that lies about how much is in it.
    expect(topicsOf(['opinion', 'editorial'])).toEqual(['opinion'])
    expect(topicsOf(['university', 'atu', 'campus-news'])).toEqual(['arkansas-tech'])
  })

  it('gives an untagged story no topic rather than a default one', () => {
    expect(topicsOf([])).toEqual([])
    expect(topicsOf(['weather'])).toEqual([])
  })

  it('drops a topic with nothing in it', () => {
    const stories = [
      { topics: ['sports'] },
      { topics: ['sports'] },
      { topics: ['opinion'] },
    ] as NewsStory[]
    expect(topicCounts(stories)).toEqual([
      { id: 'sports', label: 'Sports', count: 2 },
      { id: 'opinion', label: 'Opinion', count: 1 },
    ])
  })
})

/* ── clustering ─────────────────────────────────────────────────────────── */

function asStory(over: Partial<NewsStory> & { id: string; title: string }): NewsStory {
  return {
    summary: '',
    url: null,
    imageUrl: null,
    sourceId: 'the-courier',
    sourceName: 'The Courier',
    sourceInitial: 'TC',
    sourceTint: 'navy',
    domain: 'couriernews.com',
    byline: null,
    publishedAt: '2026-08-05T12:00:00.000Z',
    timeLabel: 'this morning',
    fresh: false,
    medium: 'reported',
    topics: [],
    ...over,
  } as NewsStory
}

describe('clusterStories', () => {
  it('groups two newsrooms writing up one thing', () => {
    // Both of these are in the town's real feed, two hours apart.
    const clusters = clusterStories([
      asStory({
        id: 'a',
        title: 'ATU alumnus leading revamped food service on campus',
        publishedAt: '2026-08-05T16:20:00.000Z',
      }),
      asStory({
        id: 'b',
        title: 'ATU Grad Leading Revamped Food Service on Campus',
        sourceId: 'arkansas-tech',
        publishedAt: '2026-08-05T12:41:00.000Z',
      }),
    ])
    expect(clusters).toHaveLength(1)
    expect(clusters[0]?.sourceCount).toBe(2)
    // Newest first, by time and nothing else.
    expect(clusters[0]?.stories.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('never groups one newsroom’s own running column', () => {
    // These score 0.71 against each other and are two days of public record.
    // A group that is one paper twice has nothing to say about coverage.
    expect(
      clusterStories([
        asStory({ id: 'a', title: 'Bond hearings Aug. 5, 2026' }),
        asStory({ id: 'b', title: 'Bond hearings Aug. 1, 2026' }),
      ]),
    ).toEqual([])
  })

  it('leaves two unrelated headlines alone', () => {
    expect(
      clusterStories([
        asStory({ id: 'a', title: 'Teeter wins special election' }),
        asStory({ id: 'b', title: 'Russellville golf begins season Monday', sourceId: 'arkansas-tech' }),
      ]),
    ).toEqual([])
  })

  it('refuses a match outside the four day window', () => {
    expect(
      clusterStories([
        asStory({
          id: 'a',
          title: 'AGS Class of 2026 members reflect on four unforgettable weeks',
          publishedAt: '2026-08-10T12:00:00.000Z',
        }),
        asStory({
          id: 'b',
          title: 'AGS Class of 2026 Reflects on Four Life-Changing Weeks',
          sourceId: 'arkansas-tech',
          publishedAt: '2026-08-01T12:00:00.000Z',
        }),
      ]),
    ).toEqual([])
  })

  it('puts a story in one group and no more', () => {
    const clusters = clusterStories([
      asStory({ id: 'a', title: 'Council rezones the Weir Road corner for apartments' }),
      asStory({
        id: 'b',
        title: 'Council rezones Weir Road corner for apartments',
        sourceId: 'arkansas-tech',
      }),
      asStory({
        id: 'c',
        title: 'Council rezones the Weir Road corner for apartments tonight',
        sourceId: 'arkansas-tech',
      }),
    ])
    const ids = clusters.flatMap((c) => c.stories.map((s) => s.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('drops the short words that make unrelated headlines look alike', () => {
    expect([...titleTokens('The board of the city set a new rate')]).toEqual([
      'board',
      'city',
      'rate',
    ])
  })
})

/* ── the feed ───────────────────────────────────────────────────────────── */

describe('assembleNews', () => {
  const NOW = '2026-08-05T18:30:00.000Z'

  it('leads on what today.ts would lead on, art and all', () => {
    const payload = build(
      [
        story({ id: 'plain', title: 'Candidate filing ends at noon', publishedAt: '2026-08-05T17:00:00.000Z' }),
        story({
          id: 'art',
          title: 'Teeter wins special election',
          publishedAt: '2026-08-05T16:41:00.000Z',
          imageUrl: 'https://example.test/a.jpg',
        }),
      ],
      NOW,
    )
    expect(payload.lead?.id).toBe('art')
    // What the hero passed over is the first row, never off the screen.
    expect(payload.rows[0]?.id).toBe('plain')
  })

  it('does not open the town on a records listing', () => {
    const payload = build(
      [
        story({
          id: 'bond',
          title: 'Bond hearings Aug. 5, 2026',
          publishedAt: '2026-08-05T17:00:00.000Z',
          imageUrl: 'https://example.test/mugshot.jpg',
        }),
        story({ id: 'real', title: 'Teeter wins special election', publishedAt: '2026-08-05T16:00:00.000Z' }),
      ],
      NOW,
    )
    expect(payload.lead?.id).toBe('real')
    // Public record, still on the screen. Nothing is filtered out of the feed.
    expect(payload.rows.map((r) => r.id)).toContain('bond')
  })

  it('never prints a story that has not been published yet', () => {
    const payload = build(
      [
        story({ id: 'now', publishedAt: '2026-08-05T17:00:00.000Z' }),
        story({ id: 'later', publishedAt: '2026-08-06T09:00:00.000Z' }),
      ],
      NOW,
    )
    expect([payload.lead?.id, ...payload.rows.map((r) => r.id)]).not.toContain('later')
  })

  it('shows a clustered story in the cluster and not again as a row', () => {
    const payload = build(
      [
        story({ id: 'lead', title: 'Teeter wins special election', publishedAt: '2026-08-05T18:00:00.000Z' }),
        story({
          id: 'a',
          title: 'ATU alumnus leading revamped food service on campus',
          publishedAt: '2026-08-05T16:20:00.000Z',
        }),
        story({
          id: 'b',
          title: 'ATU Grad Leading Revamped Food Service on Campus',
          source: 'arkansas-tech',
          publishedAt: '2026-08-05T12:41:00.000Z',
        }),
      ],
      NOW,
    )
    expect(payload.clusters).toHaveLength(1)
    expect(payload.rows.map((r) => r.id)).not.toContain('a')
    expect(payload.rows.map((r) => r.id)).not.toContain('b')
  })

  it('never draws the lead twice by clustering it', () => {
    const payload = build(
      [
        story({
          id: 'a',
          title: 'ATU alumnus leading revamped food service on campus',
          publishedAt: '2026-08-05T16:20:00.000Z',
        }),
        story({
          id: 'b',
          title: 'ATU Grad Leading Revamped Food Service on Campus',
          source: 'arkansas-tech',
          publishedAt: '2026-08-05T12:41:00.000Z',
        }),
      ],
      NOW,
    )
    expect(payload.lead?.id).toBe('a')
    expect(payload.clusters).toEqual([])
    expect(payload.rows.map((r) => r.id)).toEqual(['b'])
  })

  it('filters to a topic and picks that topic’s own lead', () => {
    const payload = build(
      [
        story({ id: 'news', title: 'Teeter wins', publishedAt: '2026-08-05T18:00:00.000Z', tags: ['local-news'] }),
        story({ id: 'ball', title: 'Cyclones open camp', publishedAt: '2026-08-05T15:00:00.000Z', tags: ['sports'] }),
      ],
      NOW,
      'sports',
    )
    expect(payload.topic).toBe('sports')
    expect(payload.lead?.id).toBe('ball')
    expect([payload.lead?.id, ...payload.rows.map((r) => r.id)]).not.toContain('news')
    // The rail still counts all of town, so a chip can say whether it is
    // worth leaving the list you are on.
    expect(payload.topics.find((t) => t.id === 'local-news')?.count).toBe(1)
    // The sign-off counts what is on this screen, both numbers. "2 sources ·
    // 25 stories" under a filter that is one paper all the way down is two
    // different scopes in one sentence.
    expect(payload.signoff.sourceCount).toBe(1)
    expect(payload.signoff.storyCount).toBe(1)
  })

  it('ignores a topic nobody publishes rather than emptying the screen', () => {
    const payload = build([story({ id: 'a', publishedAt: '2026-08-05T18:00:00.000Z' })], NOW, 'weather')
    expect(payload.topic).toBeNull()
    expect(payload.lead?.id).toBe('a')
  })

  it('counts a source by its stories and names the host it publishes at', () => {
    const payload = build(
      [
        story({ id: 'a', publishedAt: '2026-08-05T18:00:00.000Z' }),
        story({ id: 'b', publishedAt: '2026-08-05T17:00:00.000Z' }),
        story({
          id: 'c',
          source: 'arkansas-tech',
          url: 'https://www.arkansastechnews.com/a/',
          publishedAt: '2026-08-05T16:00:00.000Z',
        }),
      ],
      NOW,
    )
    expect(payload.sources.map((s) => [s.name, s.domain, s.storyCount])).toEqual([
      ['The Courier', 'couriernews.com', 2],
      // atu.edu is what the registry says; arkansastechnews.com is where the
      // tap lands, and the exit button has to name the one the reader visits.
      ['Arkansas Tech University', 'arkansastechnews.com', 1],
    ])
  })

  it('is an empty screen with no lead when the town published nothing', () => {
    const payload = build([], NOW)
    expect(payload.lead).toBeNull()
    expect(payload.rows).toEqual([])
    expect(payload.clusters).toEqual([])
    expect(payload.topics).toEqual([])
    expect(payload.signoff.oldestLabel).toBeNull()
    expect(payload.signoff.storyCount).toBe(0)
  })

  it('says how far back the feed reaches', () => {
    const payload = build(
      [
        story({ id: 'a', publishedAt: '2026-08-05T18:00:00.000Z' }),
        story({ id: 'b', publishedAt: '2026-08-03T18:00:00.000Z' }),
      ],
      NOW,
    )
    expect(payload.signoff.oldestLabel).toBe('Monday')
    expect(payload.signoff.storyCount).toBe(2)
  })

  it('carries a byline only when the paper filed one', () => {
    const payload = build(
      [
        story({
          id: 'a',
          publishedAt: '2026-08-05T18:00:00.000Z',
          author: 'By Travis Simpson tsimpson@couriernews.com',
        }),
        story({ id: 'b', publishedAt: '2026-08-05T17:00:00.000Z' }),
      ],
      NOW,
    )
    expect(payload.lead?.byline).toBe('Travis Simpson')
    expect(payload.rows[0]?.byline).toBeNull()
  })

  it('reads opinion off the tag rather than off the headline', () => {
    const payload = build(
      [
        story({ id: 'a', publishedAt: '2026-08-05T18:00:00.000Z', tags: ['opinion', 'editorial'] }),
        story({ id: 'b', publishedAt: '2026-08-05T17:00:00.000Z', tags: ['local-news'] }),
      ],
      NOW,
    )
    expect(payload.lead?.medium).toBe('opinion')
    expect(payload.rows[0]?.medium).toBe('reported')
  })
})

/* ── the reader page ────────────────────────────────────────────────────── */

describe('assembleStory', () => {
  const NOW = '2026-08-05T18:30:00.000Z'
  const items = [
    story({
      id: 'a',
      title: 'ATU alumnus leading revamped food service on campus',
      publishedAt: '2026-08-05T16:20:00.000Z',
      author: 'By Hannah Butler hbutler@couriernews.com',
      tags: ['local-news'],
    }),
    story({
      id: 'b',
      title: 'ATU Grad Leading Revamped Food Service on Campus',
      source: 'arkansas-tech',
      url: 'https://www.arkansastechnews.com/b/',
      publishedAt: '2026-08-05T12:41:00.000Z',
      tags: ['university', 'atu', 'campus-news'],
    }),
  ]
  const read = (id: string) =>
    assembleStory({ now: NOW, town: TOWN, items, sources: SOURCES, storyId: id })

  it('carries whoever else covered the same thing', () => {
    expect(read('a')?.alsoCovering.map((s) => s.id)).toEqual(['b'])
    expect(read('b')?.alsoCovering.map((s) => s.id)).toEqual(['a'])
  })

  it('names the source with the host the reader is about to visit', () => {
    expect(read('b')?.source.domain).toBe('arkansastechnews.com')
  })

  it('labels the story’s topics for the crumb', () => {
    expect(read('b')?.topics).toEqual([{ id: 'arkansas-tech', label: 'Arkansas Tech' }])
  })

  it('is null on a story that is not in the town’s feed', () => {
    expect(read('nothing-like-this')).toBeNull()
  })

  it('is an empty list when nobody else covered it', () => {
    const alone = assembleStory({
      now: NOW,
      town: TOWN,
      items: [story({ id: 'solo', title: 'Teeter wins special election', publishedAt: '2026-08-05T16:00:00.000Z' })],
      sources: SOURCES,
      storyId: 'solo',
    })
    expect(alone?.alsoCovering).toEqual([])
  })
})
