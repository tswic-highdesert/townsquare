/**
 * News, assembled.
 *
 * `design/hifi-v2` section 03 is the news surface, and the whole section is
 * decided by one fact about Town Square: **we do not host the article.** Every
 * headline belongs to somebody else, every tap leaves town, and our entire job
 * is to be the fastest honest route to a neighbour's reporting.
 *
 * Same rule as `today.ts`, and it is the reason this file is shorter than the
 * design sheet: **a surface with no real source is omitted, not mocked.** The
 * sheet draws a developing-story timeline, a hand-picked pull-quote hero, six
 * source cards, a paywall tag and a save button. Two sources exist, nothing
 * marks a story as still moving, no editor picks a quote, and `SAVE_KINDS` has
 * no `story` in it. None of those are drawn here, and each omission is named in
 * DEVELOPING.md rather than filled with something plausible.
 *
 * Everything `today.ts` already decided is imported from it rather than
 * restated. `storyStamp`, `townDay`, `pickLead` and `isRoutineRecord` are the
 * rules for what the town's front page leads on, and a news screen that
 * disagreed with the home screen about which story is the top of town would be
 * two products.
 */

/**
 * Types come from the deep path, not from `@townsquare/feed`.
 *
 * The barrel re-exports the scrapers, which are checked under
 * `tsconfig.ported.json`. Importing it — even `import type` — drags all of that
 * into this app's strict graph. Same note as the top of `today.ts`.
 */
import type { StoryItem, TownSquareItem } from '../../../packages/feed/src/lib/types.js'
import { isRoutineRecord, pickLead, storyStamp, townDay } from './today.js'

const isStory = (i: TownSquareItem): i is StoryItem => i.type === 'story'

/** What a source is, as the news surface needs it. */
export interface NewsSource {
  id: string
  name: string
  /** The tile of initials. `aria-hidden` in the markup: the name identifies. */
  initial: string
  /** One of five tints, keyed to the domain. See `sourceTint`. */
  tint: SourceTint
  /**
   * The host a tap actually lands on, said out loud before the tap.
   *
   * Read from the stories, never from the source registry: `arkansas-tech`
   * registers `atu.edu` and publishes at `arkansastechnews.com`, and the
   * domain on an exit button has to be the one the reader is about to visit.
   */
  domain: string | null
  /** How many of this source's stories are in the feed this payload describes. */
  storyCount: number
}

export type SourceTint = 'navy' | 'sage' | 'gold' | 'terracotta' | 'ink'

/**
 * Reported or opinion, and nothing else.
 *
 * The sheet's third medium is Audio, which is the one that makes a cluster
 * worth reading — the radio station has the tape. No source in this town
 * publishes audio, so there is no third value here. `opinion` is real: 23
 * stories carry the tag.
 */
export type NewsMedium = 'reported' | 'opinion'

export interface NewsStory {
  id: string
  title: string
  summary: string
  url: string | null
  imageUrl: string | null
  sourceId: string
  sourceName: string
  sourceInitial: string
  sourceTint: SourceTint
  /** The host the tap lands on, for the exit button and the row's honesty. */
  domain: string | null
  /** The byline as the paper filed it, minus the boilerplate. Often absent. */
  byline: string | null
  publishedAt: string
  timeLabel: string
  /**
   * Under an hour old.
   *
   * The one timestamp allowed to go dark and bold, because inside an hour the
   * number changes what a resident does next. Everything older is metadata.
   */
  fresh: boolean
  medium: NewsMedium
  topics: string[]
}

/**
 * One event, covered by more than one newsroom.
 *
 * Note what is *not* on this type: a sentence describing the event. The sheet
 * puts one at the top of the card, labelled as ours, and it is the best idea in
 * the section — but writing it means a model summarising two headlines into a
 * third, and a synthesised sentence sitting above two real ones is exactly the
 * thing the sheet's own note says would cost us the sources. So the card is the
 * count and the rows, and the headlines speak for themselves.
 */
export interface NewsCluster {
  id: string
  sourceCount: number
  stories: NewsStory[]
}

export interface NewsTopic {
  id: string
  label: string
  count: number
}

export interface NewsPayload {
  town: { id: string; name: string; timezone: string }
  /** The topic filter in effect, or null for all of town. */
  topic: string | null
  topics: NewsTopic[]
  lead: NewsStory | null
  clusters: NewsCluster[]
  rows: NewsStory[]
  sources: NewsSource[]
  signoff: {
    /** When this payload was assembled, in the town's clock. */
    assembledLabel: string
    sourceCount: number
    storyCount: number
    /** How far back the feed reaches, said the way the timestamps are. */
    oldestLabel: string | null
  }
  assembledAt: string
}

export interface ReaderPayload {
  story: NewsStory
  source: NewsSource
  /** The same event at another newsroom. Empty most of the time. */
  alsoCovering: NewsStory[]
  /** The story's own topics, for the crumb above the headline. */
  topics: Array<{ id: string; label: string }>
  assembledAt: string
}

/* ────────────────────────────────────────────────────────────────────────────
 * Text off a scraper is not text off a screen
 * ──────────────────────────────────────────────────────────────────────── */

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/**
 * Undo the entity encoding RSS arrives in.
 *
 * `Fall &#8217;26 ATU Student Activities Board Events Announced` is a real
 * title in this town's feed, and rendered as-is it is a headline with a
 * mangled apostrophe in it — which reads as our bug rather than as the paper's
 * encoding. React escapes on output, so decoding here is safe: nothing
 * downstream treats these strings as markup.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole
  })
}

/**
 * A story's summary, which is the source's own and is labelled as such.
 *
 * Every story in this town's feed has `body === description`: the scrapers
 * carry the RSS summary and nothing more. That is why there is no "Town Square
 * summary" panel in the reader page even though the sheet designs one. We have
 * no article to summarise, so a panel headed with our name over the paper's own
 * words would be taking credit for a sentence The Courier wrote.
 *
 * The one edit is the truncation marker: WordPress ends a clipped summary with
 * ` […]`, which is a feed artefact rather than punctuation anyone typed.
 */
export function cleanSummary(text: string): string {
  return decodeEntities(text)
    .replace(/\s*\[\s*(?:…|\.\.\.)\s*\]\s*$/u, '…')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The byline, minus the two things that are plumbing rather than attribution.
 *
 * `By Travis Simpson tsimpson@couriernews.com` is how the Courier's scrape
 * arrives. The `By ` is our own label's job, and the address is a working
 * reporter's work email republished on a screen he never agreed to be on — so
 * both come off.
 *
 * Nothing else is touched, and the casing especially is left alone. Half these
 * bylines are set in caps (`By SEN. JOHN BOOZMAN`, `ATU MEDIA RELATIONS`) and
 * the obvious fix, title-casing an all-caps string, turns `ATU` into `Atu`. A
 * shouty byline is the paper's house style; a misspelled institution is our
 * mistake. Same trade as the category regex in `today.ts`: a miss costs a
 * little polish, a false positive says something untrue.
 */
export function cleanByline(author: string | undefined): string | null {
  if (!author) return null
  const cleaned = author
    .replace(/^\s*by\s+/i, '')
    .replace(/\S+@\S+\.\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > 0 ? cleaned : null
}

/**
 * The host a link lands on, without the `www.`.
 *
 * Returns null rather than throwing on anything that is not an http(s) URL, so
 * a malformed link in a scrape costs the domain line and not the screen.
 */
export function sourceDomain(url: string | undefined | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return parsed.hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Time
 * ──────────────────────────────────────────────────────────────────────── */

const HOUR_MS = 60 * 60 * 1000

function parts(iso: string, timezone: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, ...opts }).format(new Date(iso))
}

/** Morning, afternoon, evening, cut at noon and six, in the town's clock. */
function partOfDay(iso: string, timezone: string): 'morning' | 'afternoon' | 'evening' {
  const hour = Number(parts(iso, timezone, { hour: 'numeric', hour12: false }))
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

export interface Stamp {
  label: string
  fresh: boolean
}

/**
 * When a story ran, said the way a neighbour would say it.
 *
 * The sheet's rule set, specimen 12: count minutes for exactly one hour, then
 * switch to words. `four hours ago` is not a sentence anybody says out loud,
 * and a feed that mixes `2 hours ago` with `Tuesday` with `08/04` reads as a
 * screen three people assembled without meeting.
 *
 * Everything a day old or more is **`storyStamp`'s answer, not a second
 * opinion**. That function already owns the "Yesterday, then a weekday, then a
 * date" ladder and the timezone arithmetic under it, and Today and News
 * disagreeing about whether something ran Tuesday would be the same bug in two
 * places. The only thing added on top is the part of day on yesterday, because
 * "yesterday afternoon" and "yesterday, 11:04 pm" answer different questions
 * about a council vote.
 *
 * The minute count runs *before* the day comparison on purpose. A story filed
 * at 11:50pm and read at 12:20am is twenty minutes old, whatever the calendar
 * says about it.
 */
export function newsStamp(iso: string, timezone: string, todayKey: string, nowMs: number): Stamp {
  const ageMs = nowMs - new Date(iso).getTime()

  if (ageMs < 60_000) return { label: 'just now', fresh: true }
  if (ageMs < HOUR_MS) {
    const minutes = Math.floor(ageMs / 60_000)
    return { label: `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`, fresh: true }
  }

  const day = townDay(iso, timezone)
  if (day === todayKey) {
    const when = partOfDay(iso, timezone)
    return { label: when === 'evening' ? 'tonight' : `this ${when}`, fresh: false }
  }

  const stamped = storyStamp(iso, timezone, todayKey)
  if (stamped === 'Yesterday') return { label: `yesterday ${partOfDay(iso, timezone)}`, fresh: false }
  return { label: stamped, fresh: false }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Topics
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * The topic rail, built from the tags the scrapers actually emit.
 *
 * Seven distinct tags exist across the town's stories and they collapse to
 * four subjects: `editorial` never appears without `opinion`, and `university`,
 * `atu` and `campus-news` are one set on one source. Rendering all seven would
 * be a rail where three chips are the same chip.
 *
 * There is no `Nuclear One` or `City Council` chip, which the sheet has and
 * which are the two topics a resident of this town would actually want. They
 * would have to come from matching words in a headline, and a topic that is
 * sometimes wrong is worse than a topic that does not exist: a resident who
 * follows City Council and misses the vote has been told a lie about what
 * following means.
 */
const TOPIC_TABLE: ReadonlyArray<{ id: string; label: string; tags: readonly string[] }> = [
  { id: 'local-news', label: 'Local news', tags: ['local-news'] },
  { id: 'sports', label: 'Sports', tags: ['sports'] },
  { id: 'opinion', label: 'Opinion', tags: ['opinion', 'editorial'] },
  { id: 'arkansas-tech', label: 'Arkansas Tech', tags: ['university', 'atu', 'campus-news'] },
]

export function topicsOf(tags: readonly string[]): string[] {
  const held = new Set(tags.map((t) => t.toLowerCase()))
  return TOPIC_TABLE.filter((t) => t.tags.some((tag) => held.has(tag))).map((t) => t.id)
}

export function topicLabel(id: string): string | null {
  return TOPIC_TABLE.find((t) => t.id === id)?.label ?? null
}

/** Every topic with something in it, commonest first. An empty chip is a dead end. */
export function topicCounts(stories: readonly NewsStory[]): NewsTopic[] {
  return TOPIC_TABLE.map((t) => ({
    id: t.id,
    label: t.label,
    count: stories.filter((s) => s.topics.includes(t.id)).length,
  }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/* ────────────────────────────────────────────────────────────────────────────
 * Clustering
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Words that carry no subject, dropped before two headlines are compared.
 *
 * Short list on purpose. Every word removed here makes two unrelated headlines
 * look more alike, and a false cluster tells a resident two newsrooms covered
 * one thing when they covered two.
 */
const STOP_WORDS = new Set(
  'a an the of for on in at to and or with from by is are was were be as its it this that new set sets his her their'.split(
    ' ',
  ),
)

export function titleTokens(title: string): Set<string> {
  return new Set(
    decodeEntities(title)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  )
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const word of a) if (b.has(word)) shared += 1
  return shared / (a.size + b.size - shared)
}

/**
 * How alike two headlines have to be before we say they are one event.
 *
 * Measured against the town's whole feed rather than guessed. At 0.3 the rule
 * finds exactly two cross-source pairs in 81 stories and both are genuinely one
 * story — the Courier and the university writing up the same new food service
 * manager, and the same two on the Governor's School class. At 0.45 it finds
 * the same two, so the threshold sits at 0.45 with the margin on the safe side:
 * a missed cluster costs a card, a false one is a claim about who covered what.
 */
const CLUSTER_THRESHOLD = 0.45

/** Four days. Two newsrooms writing up one meeting are rarely further apart. */
const CLUSTER_WINDOW_MS = 4 * 24 * 60 * 60 * 1000

/**
 * Stories that are one event, grouped.
 *
 * **Only across sources.** Within one newsroom, near-identical headlines are
 * the opposite of a cluster: `Bond hearings Aug. 5, 2026` and `Bond hearings
 * Aug. 1, 2026` score 0.71 against each other and are two different days of
 * public record. The whole value of this card is "who else covered it", so a
 * group that is one paper twice has nothing to say.
 *
 * Greedy single pass, newest first, so a story joins the newest group it
 * matches and never appears in two.
 */
export function clusterStories(stories: readonly NewsStory[]): NewsCluster[] {
  const tokens = new Map(stories.map((s) => [s.id, titleTokens(s.title)]))
  const taken = new Set<string>()
  const clusters: NewsCluster[] = []

  for (const seed of stories) {
    if (taken.has(seed.id)) continue
    const group = [seed]
    const seedTokens = tokens.get(seed.id) ?? new Set<string>()
    const seedAt = new Date(seed.publishedAt).getTime()

    for (const other of stories) {
      if (other.id === seed.id || taken.has(other.id)) continue
      if (other.sourceId === seed.sourceId) continue
      if (Math.abs(new Date(other.publishedAt).getTime() - seedAt) > CLUSTER_WINDOW_MS) continue
      if (overlap(seedTokens, tokens.get(other.id) ?? new Set()) < CLUSTER_THRESHOLD) continue
      group.push(other)
    }

    if (group.length < 2) continue
    for (const member of group) taken.add(member.id)
    clusters.push({
      id: `cluster-${seed.id}`,
      sourceCount: new Set(group.map((s) => s.sourceId)).size,
      // By time and nothing else. There is no ranking between two newsrooms
      // that an aggregator has any standing to make.
      stories: group.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    })
  }

  return clusters
}

/* ────────────────────────────────────────────────────────────────────────────
 * Assembly
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Five tints for a town that will keep adding sources.
 *
 * Keyed to the domain rather than the source id, so a source that is
 * re-registered keeps its tile, and derived rather than assigned so a new
 * source has one the day it is added. Two sources publish stories here and the
 * ramp holds five, so nothing collides yet — and when it does, the name beside
 * the tile is what identifies. That is why the tile is `aria-hidden` on the
 * screen: it is a recognition aid, never the identification.
 */
const TINTS: readonly SourceTint[] = ['navy', 'sage', 'gold', 'terracotta', 'ink']

export function sourceTint(key: string): SourceTint {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return TINTS[hash % TINTS.length] as SourceTint
}

/** `The Courier` → `TC`, `Arkansas Tech University` → `AU`. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '·'
  const first = words[0]?.[0] ?? ''
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : (words[0]?.[1] ?? '')
  return (first + second).toUpperCase()
}

export interface NewsSourceInfo {
  id: string
  name: string
  type: string
}

export interface AssembleNewsInput {
  now: string
  town: { id: string; name: string; timezone: string }
  items: readonly TownSquareItem[]
  sources: ReadonlyMap<string, NewsSourceInfo>
  /** The topic chip in effect, or null for all of town. */
  topic?: string | null
}

/**
 * How many rows the feed carries under the lead and the clusters.
 *
 * The town publishes about eighty stories a month and all of them are in
 * range, so this is a scroll length rather than a filter: the sign-off says
 * how far back the list reaches, which is the honest way to end a feed.
 */
const ROW_LIMIT = 24

function toStory(
  item: StoryItem,
  ctx: { tz: string; dayKey: string; nowMs: number; sources: ReadonlyMap<string, NewsSourceInfo> },
): NewsStory {
  const name = ctx.sources.get(item.source)?.name ?? item.source
  const domain = sourceDomain(item.url)
  const stamp = newsStamp(item.publishedAt, ctx.tz, ctx.dayKey, ctx.nowMs)
  const tags = item.tags ?? []

  return {
    id: item.id,
    title: decodeEntities(item.title),
    summary: cleanSummary(item.description),
    url: item.url ?? null,
    imageUrl: item.imageUrl ?? null,
    sourceId: item.source,
    sourceName: name,
    sourceInitial: initials(name),
    sourceTint: sourceTint(domain ?? item.source),
    domain,
    byline: cleanByline(item.author),
    publishedAt: item.publishedAt,
    timeLabel: stamp.label,
    fresh: stamp.fresh,
    medium: tags.includes('opinion') || tags.includes('editorial') ? 'opinion' : 'reported',
    topics: topicsOf(tags),
  }
}

function sourceCards(
  stories: readonly NewsStory[],
  sources: ReadonlyMap<string, NewsSourceInfo>,
): NewsSource[] {
  const seen = new Map<string, NewsSource>()
  for (const story of stories) {
    const existing = seen.get(story.sourceId)
    if (existing) {
      existing.storyCount += 1
      // A source's domain is whatever it is publishing at. The first story
      // with a readable URL settles it; the rest only count.
      if (!existing.domain && story.domain) existing.domain = story.domain
      continue
    }
    seen.set(story.sourceId, {
      id: story.sourceId,
      name: sources.get(story.sourceId)?.name ?? story.sourceName,
      initial: story.sourceInitial,
      tint: story.sourceTint,
      domain: story.domain,
      storyCount: 1,
    })
  }
  return [...seen.values()].sort((a, b) => b.storyCount - a.storyCount || a.name.localeCompare(b.name))
}

/** Every published story in town, newest first, cleaned and stamped. */
function allStories(input: AssembleNewsInput): NewsStory[] {
  const nowMs = new Date(input.now).getTime()
  const ctx = {
    tz: input.town.timezone,
    dayKey: townDay(input.now, input.town.timezone),
    nowMs,
    sources: input.sources,
  }
  return input.items
    .filter(isStory)
    // A publication date in the future is a scrape artefact, not a scoop.
    .filter((s) => new Date(s.publishedAt).getTime() <= nowMs)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((s) => toStory(s, ctx))
}

export function assembleNews(input: AssembleNewsInput): NewsPayload {
  const tz = input.town.timezone
  const nowMs = new Date(input.now).getTime()
  const dayKey = townDay(input.now, tz)
  const everything = allStories(input)

  // The rail counts all of town, never the filtered slice. A chip that reports
  // the size of the list you are already looking at cannot tell you whether it
  // is worth leaving the one you are on.
  const topics = topicCounts(everything)
  const topic = input.topic && topics.some((t) => t.id === input.topic) ? input.topic : null
  const stories = topic ? everything.filter((s) => s.topics.includes(topic)) : everything

  /**
   * The lead, decided by `today.ts` and not by this file.
   *
   * `pickLead` reaches up to 36 hours for a story with art and passes over the
   * bond-hearing roundup on the way. Both rules are argued out in `today.ts`
   * and DEVELOPING.md, and the news screen leading on something the home
   * screen does not would be two products with one name.
   *
   * It takes `StoryItem`s, so it is fed the raw items in the same order rather
   * than the mapped ones — the mapping is presentation, and the rule is about
   * the story.
   */
  const raw = input.items
    .filter(isStory)
    .filter((s) => new Date(s.publishedAt).getTime() <= nowMs)
    .filter((s) => (topic ? topicsOf(s.tags ?? []).includes(topic) : true))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  const leadItem = pickLead(raw, nowMs)
  const lead = leadItem ? (stories.find((s) => s.id === leadItem.id) ?? null) : null

  /**
   * Clusters are formed over what is left after the lead.
   *
   * If the lead belongs to a group, drawing that group as a card below it
   * prints the same headline twice on one screen. Excluding the lead first
   * means a two-member group collapses to a single ordinary row, and the tie
   * is still there for anyone who opens the story: the reader page carries
   * "Also covering this", computed over everything.
   */
  const rest = stories.filter((s) => s.id !== lead?.id)
  const clusters = clusterStories(rest)
  const clustered = new Set(clusters.flatMap((c) => c.stories.map((s) => s.id)))
  const rows = rest.filter((s) => !clustered.has(s.id)).slice(0, ROW_LIMIT)

  const shown = [...(lead ? [lead] : []), ...clusters.flatMap((c) => c.stories), ...rows]
  const oldest = shown.reduce<NewsStory | null>(
    (acc, s) => (!acc || s.publishedAt < acc.publishedAt ? s : acc),
    null,
  )

  return {
    town: input.town,
    topic,
    topics,
    lead,
    clusters,
    rows,
    sources: sourceCards(everything, input.sources),
    signoff: {
      assembledLabel: parts(input.now, tz, { hour: 'numeric', minute: '2-digit', hour12: true }),
      // Both numbers count the same thing: what is on this screen. The sign-off
      // read "2 sources · 25 stories" under a Sports filter that is one paper
      // all the way down, which is two different scopes in one sentence.
      sourceCount: new Set(shown.map((s) => s.sourceId)).size,
      storyCount: shown.length,
      oldestLabel: oldest ? newsStamp(oldest.publishedAt, tz, dayKey, nowMs).label : null,
    },
    assembledAt: input.now,
  }
}

export interface AssembleStoryInput extends Omit<AssembleNewsInput, 'topic'> {
  storyId: string
}

/**
 * One story's page.
 *
 * Not a copy of the article and not trying to be. The whole page is a byline, a
 * credited thumbnail, the source's own summary, a source card and one large
 * control that leaves — plus whoever else covered it, which is the one thing
 * here that an aggregator can offer and a newsroom cannot.
 *
 * Returns null on an unknown id rather than throwing, so the route answers 404
 * and nothing above it has to know how a story goes missing.
 */
export function assembleStory(input: AssembleStoryInput): ReaderPayload | null {
  const everything = allStories(input)
  const story = everything.find((s) => s.id === input.storyId)
  if (!story) return null

  const cluster = clusterStories(everything).find((c) => c.stories.some((s) => s.id === story.id))
  const alsoCovering = cluster ? cluster.stories.filter((s) => s.id !== story.id) : []

  const source = sourceCards(everything, input.sources).find((s) => s.id === story.sourceId)

  return {
    story,
    source: source ?? {
      id: story.sourceId,
      name: story.sourceName,
      initial: story.sourceInitial,
      tint: story.sourceTint,
      domain: story.domain,
      storyCount: 1,
    },
    alsoCovering,
    topics: story.topics.flatMap((id) => {
      const label = topicLabel(id)
      return label ? [{ id, label }] : []
    }),
    assembledAt: input.now,
  }
}

export { isRoutineRecord }
