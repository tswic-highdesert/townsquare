/**
 * The bundle server, wired to `node:http`.
 *
 * Deliberately thin: everything that decides anything lives in
 * `@townsquare/sandbox`, which is a pure function and is where the tests point.
 * This file's only jobs are to move bytes and to *not* add anything. In
 * particular it registers no cookie parser, no session middleware and no auth,
 * because the guarantee that a creation's origin cannot read a session should
 * hold by construction rather than by everyone remembering.
 *
 * Local development uses `*.tsq-apps.localhost`, which Chromium and Safari
 * resolve to 127.0.0.1 on their own and treat as a secure context. That gives
 * genuine origin separation with no /etc/hosts edit and no certificates, so
 * every boundary test means the same thing locally as in production.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { serveBundleRequest, type SandboxConfig } from '@townsquare/sandbox'
import { guestThemeCss, FONT_FILES } from '@townsquare/tokens'
import { loadExampleCreations } from './examples.js'

const PORT = Number(process.env['SANDBOX_PORT'] ?? 3031)
const APPS_DOMAIN = process.env['APPS_DOMAIN'] ?? 'tsq-apps.localhost'

const sdkPath = fileURLToPath(new URL('../../../packages/sdk/runtime/sdk.js', import.meta.url))
const fontsDir = new URL('../../../packages/tokens/fonts/', import.meta.url)

/**
 * Read the typefaces once, at boot, into memory.
 *
 * They are a handful of files that never change while the process runs, and
 * holding them here means the request path touches no filesystem at all —
 * which is the same property that makes bundle serving free of traversal bugs.
 */
async function loadFonts(): Promise<Map<string, Uint8Array>> {
  const fonts = new Map<string, Uint8Array>()
  for (const name of FONT_FILES) {
    const path = fileURLToPath(new URL(`${name}.woff2`, fontsDir))
    fonts.set(name, new Uint8Array(await readFile(path)))
  }
  return fonts
}

async function main(): Promise<void> {
  const sdkJs = await readFile(sdkPath, 'utf8')
  const fonts = await loadFonts()
  const store = await loadExampleCreations()

  const config: SandboxConfig = {
    origin: { appsDomain: APPS_DOMAIN, scheme: 'http', port: PORT },
    store,
    assets: {
      sdkJs,
      themeCss: () => guestThemeCss(),
      themeVersion: 2,
      sdkMajor: 1,
      fonts,
    },
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void handle(req, res, config)
  })

  server.listen(PORT, () => {
    console.log(`sandbox listening on http://<origin-key>.${APPS_DOMAIN}:${PORT}`)
    for (const key of store.keys()) {
      console.log(`  http://${key}.${APPS_DOMAIN}:${PORT}/`)
    }
  })
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  config: SandboxConfig,
): Promise<void> {
  try {
    const result = await serveBundleRequest(
      { method: req.method ?? 'GET', host: req.headers.host ?? '', url: req.url ?? '/' },
      config,
    )
    res.writeHead(result.status, result.headers)
    res.end(result.body ? Buffer.from(result.body) : undefined)
  } catch (err) {
    // Nothing about the failure reaches the response. This origin serves
    // untrusted code; an error page here is read by the creation itself.
    console.error('sandbox error', err)
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('error\n')
  }
}

void main()
