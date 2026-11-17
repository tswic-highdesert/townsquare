import { gzipSync } from 'node:zlib'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, extname, sep } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json' }

const compressedFiles = new Map<string, { stamp: number; bytes: Buffer }>()

export async function staticFiles(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname.startsWith('/api/')) return false
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  let pathname: string
  try { pathname = decodeURIComponent(url.pathname) } catch { res.writeHead(400); res.end(); return true }
  const mount = pathname.startsWith('/fonts/') ? ['packages/tokens/fonts', pathname.slice(7)] :
    pathname.startsWith('/brand/') ? ['brand/png', pathname.slice(7)] : ['apps/web/dist', pathname.slice(1)]
  const base = resolve(ROOT, mount[0]!)
  let path = resolve(base, mount[1] || 'index.html')
  if (!path.startsWith(base + sep)) { res.writeHead(404); res.end(); return true }
  try {
    if (!(await stat(path)).isFile()) throw new Error('not a file')
  } catch {
    if (extname(pathname) || mount[0] !== 'apps/web/dist') return false
    path = resolve(base, 'index.html')
  }
  try {
    let bytes = await readFile(path)
    const acceptsGzip = (req.headers['accept-encoding'] ?? '').split(',').some(value => {
      const [coding, quality] = value.trim().split(';')
      return (coding === 'gzip' || coding === '*') && !/^\s*q=0(?:\.0*)?\s*$/.test(quality ?? '')
    })
    const compress = acceptsGzip && /\.(json|js|css|html|svg)$/.test(path)
    if (compress) {
      const stamp = (await stat(path)).mtimeMs
      const cached = compressedFiles.get(path)
      bytes = (cached?.stamp === stamp ? cached.bytes : gzipSync(bytes)) as typeof bytes
      if (compressedFiles.size > 32) compressedFiles.clear()
      compressedFiles.set(path, { stamp, bytes })
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(path)] ?? 'application/octet-stream',
      'Content-Length': bytes.length,
      'Vary': 'Accept-Encoding',
      ...(compress ? { 'Content-Encoding': 'gzip' } : {}),
      'Cache-Control': path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    })
    res.end(req.method === 'HEAD' ? undefined : bytes)
    return true
  } catch { return false }
}
