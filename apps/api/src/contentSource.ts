import sharp from 'sharp'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { TownSquareItem } from './today.js'
import { isLocalEvent } from './localEvents.js'
import { retainMissingSources, summarizeContent, type FeedHealth } from './contentFreshness.js'

// Image work stays small on the preview's shared CPU and memory budget.
sharp.concurrency(1)
sharp.cache({ memory: 16, files: 0, items: 20 })

const FEED_MODULE = '../../../packages/feed/src/data/index.js'
const CACHE_DIR = process.env['DATA_DIR'] ?? '/tmp/townsquare-data'
const CACHE_PATH = join(CACHE_DIR, 'content.json')
const TTL = 15 * 60_000
let items: TownSquareItem[] = []
let checkedAt = 0
let sourceHealth: FeedHealth[] = []
let loading: Promise<readonly TownSquareItem[]> | null = null
let hydrated = false
const upstreamImages = new Map<string, string>()
const photoCache = new Map<string, { bytes: Buffer; type: string }>()

export function contentStatus() {
  return summarizeContent(publicItems(), sourceHealth, checkedAt)
}

function usablePhoto(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return null
    const host = url.hostname
    if (!(host === 'www.arkansastechnews.com' || host === 'arkansastechnews.com' ||
      host.endsWith('.townnews.com') || host === 'www.atu.edu' || host === 'www.arkansasstateparks.com')) return null
    if (host.endsWith('.townnews.com')) url.searchParams.set('resize', '1200,900')
    return url.href
  } catch { return null }
}

async function enrichPhotos(rows: TownSquareItem[]): Promise<void> {
  const recent = rows.filter((i) => i.type === 'story')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10)
  await Promise.allSettled(recent.map(async (item) => {
    if (item.type !== 'story' || item.imageUrl || !item.url) return
    const url = new URL(item.url)
    if (url.hostname !== 'www.arkansastechnews.com') return
    const response = await fetch(url, { signal: AbortSignal.timeout(7000), redirect: 'error' })
    if (!response.ok) return
    const html = await response.text()
    const tag = html.match(/<meta\b[^>]*property=["']og:image["'][^>]*>/i)?.[0]
    const raw = tag?.match(/content=["']([^"']+)/i)?.[1]?.replaceAll('&amp;', '&')
    const photo = raw ? usablePhoto(raw) : null
    if (photo) item.imageUrl = photo
  }))
}

function publicItems(): TownSquareItem[] {
  return items.filter((item) => item.type !== 'event' || isLocalEvent(item)).map((item) => {
    if (item.type !== 'story' || !item.imageUrl) return item
    const source = usablePhoto(item.imageUrl)
    if (!source) return { ...item, imageUrl: undefined }
    upstreamImages.set(item.id, source)
    return { ...item, imageUrl: `/api/images/${encodeURIComponent(item.id)}` }
  })
}

async function refresh(): Promise<readonly TownSquareItem[]> {
  const mod = await import(FEED_MODULE) as {
    getAllItemsAsync(): Promise<TownSquareItem[]>
    getSourceHealth(): FeedHealth[]
  }
  const fetched = await mod.getAllItemsAsync()
  sourceHealth = mod.getSourceHealth()
  checkedAt = Date.now()
  // One recurring calendar can emit the same ID more than once. The source fix
  // preserves occurrence IDs; this guard also keeps React and saves consistent.
  const unique = new Map(fetched.map((item) => [item.id, item]))
  const next = retainMissingSources(items, [...unique.values()], sourceHealth)
  await enrichPhotos(next)
  if (next.length) {
    items = next
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(`${CACHE_PATH}.next`, JSON.stringify({ items, checkedAt, sourceHealth }))
    await rename(`${CACHE_PATH}.next`, CACHE_PATH)
  }
  return publicItems()
}

export async function loadContent(): Promise<readonly TownSquareItem[]> {
  if (!hydrated) {
    hydrated = true
    try {
      const disk = JSON.parse(await readFile(CACHE_PATH, 'utf8')) as { items: TownSquareItem[]; checkedAt: number; sourceHealth?: FeedHealth[] }
      if (Array.isArray(disk.items)) {
        items = disk.items; checkedAt = Number.isFinite(disk.checkedAt) ? disk.checkedAt : 0
        sourceHealth = Array.isArray(disk.sourceHealth) ? disk.sourceHealth : []
      }
    } catch { /* A first deployment has no cached content. */ }
  }
  if (items.length && Date.now() - checkedAt < TTL) return publicItems()
  if (!loading) loading = refresh().catch((error: unknown) => {
    console.warn('Content refresh failed; retaining the last successful collection.', error instanceof Error ? error.message : '')
    if (!items.length) throw error
    return publicItems()
  }).finally(() => { loading = null })
  // Serve the last good collection immediately while refreshing in the background.
  return items.length ? publicItems() : loading
}

/** Only photographs already attached to a known source item can be fetched. */
export async function imageRoute(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith('/api/images/')) return false
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return true }
  let id: string
  try { id = decodeURIComponent(url.pathname.slice('/api/images/'.length)) }
  catch { res.writeHead(400); res.end(); return true }
  await loadContent()
  const source = upstreamImages.get(id)
  if (!source) { res.writeHead(404); res.end(); return true }
  try {
    const width = url.searchParams.get('w') === '640' ? 640 : 1000
    const cacheKey = `${source}:${width}`
    let photo = photoCache.get(cacheKey)
    if (!photo) {
      const response = await fetch(source, { signal: AbortSignal.timeout(12000), redirect: 'error' })
      const type = response.headers.get('content-type')?.split(';')[0] ?? ''
      if (!response.ok || !/^image\/(jpeg|png|webp|avif)$/.test(type)) throw new Error('Photo unavailable')
      if (Number(response.headers.get('content-length')) > 5_000_000) throw new Error('Photo too large')
      const reader = response.body?.getReader()
      if (!reader) throw new Error('Missing image body')
      const chunks: Uint8Array[] = []
      let length = 0
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        length += chunk.value.length
        if (length > 5_000_000) { await reader.cancel(); throw new Error('Photo too large') }
        chunks.push(chunk.value)
      }
      photo = { bytes: await sharp(Buffer.concat(chunks), { limitInputPixels: 20_000_000 })
        .rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(), type: 'image/webp' }
      if (photoCache.size >= 16) photoCache.delete(photoCache.keys().next().value ?? '')
      photoCache.set(cacheKey, photo)
    }
    res.writeHead(200, { 'Content-Type': photo.type, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' })
    res.end(photo.bytes)
  } catch { res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end() }
  return true
}
