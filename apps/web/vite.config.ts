/**
 * The shell's dev server.
 *
 * Three origins, on purpose, in development as in production:
 *
 *   townsquare.localhost:5173      the shell. The session cookie lives here.
 *   *.tsq-apps.localhost:3031      untrusted bundles, one origin each
 *   localhost:3030                 the read API, which holds the credential
 *
 * Chromium and Safari resolve any `*.localhost` name to 127.0.0.1 themselves
 * and treat it as a secure context, so this costs no /etc/hosts entry and no
 * certificate — and every origin check means exactly what it will mean in
 * production, which is the only way boundary tests are worth running.
 */

import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

const SHELL_PORT = 5173
const FONTS_DIR = r('../../packages/tokens/fonts')
const BRAND_DIR = r('../../brand/png')
const SPRITE_FILE = r('../../design/hifi-v2/icons.svg')

/**
 * Serve the typefaces from `@townsquare/tokens`, not from a copy.
 *
 * The shell and every creation must use the same files. Copying them into a
 * `public/` directory here would work today and drift the first time one side
 * is updated, and a font mismatch between the shell and the frames inside it is
 * exactly the kind of thing nobody notices for months.
 */
function fonts(): Plugin {
  return {
    name: 'townsquare-fonts',
    configureServer(server) {
      server.middlewares.use('/fonts', (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0] ?? ''
        if (!/^[a-z0-9-]{1,40}\.woff2$/.test(name)) return next()
        readFile(join(FONTS_DIR, name)).then(
          (bytes) => {
            res.setHeader('Content-Type', 'font/woff2')
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
            res.end(bytes)
          },
          () => next(),
        )
      })
    },
  }
}
/**
 * Serve the mark from `brand/png`, for the same reason the fonts come from
 * `packages/tokens/fonts`: a copy in `public/` is a second source of truth for
 * the one asset that must never be approximated. `brand/README.md` records what
 * happened the last time a near-enough version of the logo shipped.
 */
function brand(): Plugin {
  return {
    name: 'townsquare-brand',
    configureServer(server) {
      server.middlewares.use('/brand', (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0] ?? ''
        if (!/^[a-z0-9-]{1,40}\.png$/.test(name)) return next()
        readFile(join(BRAND_DIR, name)).then(
          (bytes) => {
            res.setHeader('Content-Type', 'image/png')
            res.setHeader('Cache-Control', 'public, max-age=3600')
            res.end(bytes)
          },
          () => next(),
        )
      })
    },
  }
}

/**
 * Serve the icon sprite from `design/hifi-v2`, for the third time and the same
 * reason: one file, one source of truth, and no copy in `public/` to drift.
 *
 * It comes from our own origin, so `<use href="/icons.svg#i-home">` is a
 * same-origin reference needing no CORS, no widened `img-src`, and no third
 * party in the load path of the town's home screen. Cached for an hour rather
 * than forever, because unlike a font file this one is still being drawn.
 */
function icons(): Plugin {
  return {
    name: 'townsquare-icons',
    configureServer(server) {
      server.middlewares.use('/icons.svg', (_req, res, next) => {
        readFile(SPRITE_FILE).then(
          (bytes) => {
            res.setHeader('Content-Type', 'image/svg+xml')
            res.setHeader('Cache-Control', 'public, max-age=3600')
            res.end(bytes)
          },
          () => next(),
        )
      })
    },
  }
}

const API_PORT = Number(process.env['API_PORT'] ?? 3030)

export default defineConfig({
  root: r('.'),
  plugins: [react(), fonts(), brand(), icons()],
  resolve: {
    alias: {
      '@townsquare/manifest': r('../../packages/manifest/src/index.ts'),
      '@townsquare/shared': r('../../packages/shared/src/index.ts'),
      '@townsquare/tokens': r('../../packages/tokens/src/index.ts'),
      '@townsquare/sdk': r('../../packages/sdk/src/index.ts'),
      '@townsquare/host': r('../../packages/host/src/index.ts'),
      '@townsquare/sandbox': r('../../packages/sandbox/src/index.ts'),
      '@townsquare/identity': r('../../packages/identity/src/index.ts'),
      '@townsquare/storage': r('../../packages/storage/src/index.ts'),
    },
  },
  server: {
    port: SHELL_PORT,
    // Bind to loopback, but answer to the name. Browsers map `*.localhost` to
    // 127.0.0.1 themselves; the OS resolver does not, so binding to the name
    // would fail with ENOTFOUND. Visiting http://townsquare.localhost:5173
    // then gives the shell a genuinely different registrable domain from the
    // bundle origins, which is what makes every origin check real here.
    host: '127.0.0.1',
    allowedHosts: ['townsquare.localhost', 'localhost'],
    proxy: {
      // The read API is its own service, exactly as it is in production. The
      // shell talks to it; a creation never can.
      '/api': { target: `http://localhost:${API_PORT}`, changeOrigin: false },
    },
    headers: {
      // The session cookie will live on this origin. Keep it out of any frame
      // and out of any opener.
      'Content-Security-Policy': "frame-ancestors 'self'",
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  },
})
