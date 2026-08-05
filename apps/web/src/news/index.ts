/**
 * The news surface: the feed and one story's page.
 *
 * Two screens rather than one, because they answer different questions. The
 * feed is "what happened in town"; the reader is "is this worth the click",
 * and the second one exists so a resident can decide before leaving.
 */

export { News } from './News.js'
export type { NewsProps } from './News.js'

export { Reader } from './Reader.js'
export type { ReaderProps } from './Reader.js'

export { fetchNews, fetchStory, isStale, STALE_AFTER_MS } from './newsData.js'
export type {
  NewsCluster,
  NewsMedium,
  NewsPayload,
  NewsSource,
  NewsStory,
  NewsTopic,
  ReaderPayload,
  SourceTint,
} from './newsData.js'
