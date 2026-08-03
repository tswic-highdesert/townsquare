/**
 * Generate the SDK docs artifact from the method table.
 *
 * Run `pnpm gen` to write it, `pnpm gen --check` in CI to fail on drift.
 *
 * The artifact is what the MCP serves as `get_sdk_docs` and what ships as
 * `AGENTS.md` in starter templates. It carries a hash of its own content, and
 * the MCP refuses to boot if that hash does not match, because a docs/SDK skew
 * silently teaches an entire generation of creations a contract that does not
 * exist. That is as dangerous as an unauthenticated endpoint and gets the same
 * fail-closed treatment.
 */

import { createHash } from 'node:crypto'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { METHODS, METHOD_MAP, assertMethodTable, type MethodDef } from '../src/methods.js'
import { METHODS as WIRE_METHODS, ERROR_CODES, LIMITS } from '@townsquare/shared'
import { SDK_MAJOR, MANIFEST_VERSION, STORAGE_QUOTA_BYTES } from '@townsquare/manifest'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_TS = join(HERE, '..', 'src', 'docs.generated.ts')
const OUT_MD = join(HERE, '..', 'generated', 'AGENTS.md')

/**
 * Completeness, both directions.
 *
 * A wire method with no table entry would be callable but undocumented and
 * unpermissioned, which is the worst possible combination. A table entry with no
 * wire method would document something nobody can call. Either is a build
 * failure, not a warning.
 */
function assertCoverage(): void {
  const missing = WIRE_METHODS.filter((m) => !METHOD_MAP.has(m))
  if (missing.length) {
    throw new Error(
      `these wire methods have no entry in the SDK method table, so they would ship ` +
        `undocumented and without a permission rule: ${missing.join(', ')}`,
    )
  }
  const wire = new Set<string>(WIRE_METHODS)
  const extra = METHODS.filter((m) => !wire.has(m.method))
  if (extra.length) {
    throw new Error(
      `these documented methods do not exist on the wire: ${extra.map((m) => m.method).join(', ')}`,
    )
  }
}

function requirementLabel(m: MethodDef): string {
  switch (m.requires.kind) {
    case 'none':
      return 'nothing'
    case 'identity':
      return '`permissions.identity: "handle"`'
    case 'storage':
      return '`permissions.storage: true`'
    case 'recordRead':
      return 'the record type in `permissions.read`'
    case 'recordWrite':
      return 'the record type in `permissions.write`, and a verified resident'
  }
}

function renderReference(): string {
  const byNamespace = new Map<string, MethodDef[]>()
  for (const m of METHODS) {
    const ns = m.method.split('.')[0]!
    const list = byNamespace.get(ns) ?? []
    list.push(m)
    byNamespace.set(ns, list)
  }

  const parts: string[] = []
  for (const [ns, methods] of byNamespace) {
    parts.push(`### \`${ns}\`\n`)
    for (const m of methods) {
      parts.push(
        `#### ${m.signature}\n`,
        `${m.summary}\n`,
        `${m.description}\n`,
        `**Requires:** ${requirementLabel(m)}  `,
        `**Returns:** ${m.returns}  `,
        `**Throws:** ${m.throws.length ? m.throws.map((t) => `\`${t}\``).join(', ') : 'nothing'}\n`,
        '```js',
        m.example,
        '```\n',
      )
    }
  }
  return parts.join('\n')
}

function renderRules(): string {
  return `## Four rules no tool can enforce for you

**1. Everything is vendored.** There is no npm, no CDN, and no bare package
import at runtime. Every byte your app loads must be a file inside your bundle.
A \`<script src="https://unpkg.com/...">\` is a rejection, not a style note. The
platform serves your creation with \`script-src 'self'\`, so a remote script will
not execute even if review missed it.

**2. Every capability is declared.** The \`permissions\` block in your manifest is
default-deny and the host enforces it, so an undeclared read, write, storage use
or network host fails with \`permission_denied\` no matter what your code says.
Over-declaring is also a problem: a reviewer reading a permissions block full of
unused capabilities cannot tell signal from noise. Declare exactly what you use.

**3. The signed-out visitor is the common case.** \`user.current()\` returns null
for anonymous visitors, and writes throw \`not_verified\` for signed-in but
unverified ones. An app that assumes a verified user is broken for most of the
town. Handle both.

**4. Never minify.** Source is what gets reviewed and what other residents fork.
Ship readable code with real names.

## Errors

Everything async throws \`TownSquareError\` with a stable \`code\`. These are
answers, not retries: change what you are doing rather than trying again. Only
\`rate_limited\` and \`unavailable\` are worth a retry.

${ERROR_CODES.map((c) => `- \`${c}\``).join('\n')}

## Limits

- Storage: ${STORAGE_QUOTA_BYTES} bytes per user, across all your keys
- Request timeout: ${LIMITS.timeoutMs}ms
- Concurrent in-flight calls: ${LIMITS.maxInFlight}
- Call \`app.ready()\` within ${LIMITS.readyTimeoutMs}ms or the host shows a failed state
- Reported heights are clamped to ${LIMITS.minHeight}-${LIMITS.maxHeight}px
`
}

function build() {
  assertMethodTable()
  assertCoverage()

  const sections = {
    overview:
      `A Town Square creation is a sandboxed static mini-app that runs inside Town Square, ` +
      `written against \`@townsquare/sdk\`. It is a folder containing \`townsquare.json\`, an ` +
      `entry HTML file, an icon, and whatever else you vendor. There is no build step and no ` +
      `server: your app runs in a resident's browser and talks to the town through the SDK.`,
    rules: renderRules(),
    reference: renderReference(),
  }

  const contentSha = createHash('sha256')
    .update(JSON.stringify(sections))
    .digest('hex')

  const artifact = {
    sdkMajor: SDK_MAJOR,
    manifestVersion: MANIFEST_VERSION,
    contentSha256: contentSha,
    sections,
    /**
     * The validator's table of legal call sites is this array, not a
     * hand-written list. Document a method the SDK does not export and the
     * validator rejects code that calls it; that coupling is what keeps the
     * docs honest.
     */
    symbols: METHODS.map((m) => ({
      method: m.method,
      signature: m.signature,
      requires: m.requires,
    })),
  }

  const ts =
    `/* GENERATED by packages/sdk/scripts/generate.ts. Do not edit.\n` +
    ` * Run \`pnpm gen\` after changing the method table. */\n\n` +
    `export const SDK_DOCS = ${JSON.stringify(artifact, null, 2)} as const\n\n` +
    `export type SdkDocs = typeof SDK_DOCS\n`

  const md =
    `# Building a Town Square creation\n\n` +
    `> Generated from the SDK method table. SDK ${SDK_MAJOR}, manifest ${MANIFEST_VERSION}.\n\n` +
    `${sections.overview}\n\n${sections.rules}\n## Reference\n\n${sections.reference}`

  return { ts, md, contentSha }
}

function main() {
  const check = process.argv.includes('--check')
  const { ts, md, contentSha } = build()

  if (check) {
    const stale: string[] = []
    if (!existsSync(OUT_TS) || readFileSync(OUT_TS, 'utf8') !== ts) stale.push(OUT_TS)
    if (!existsSync(OUT_MD) || readFileSync(OUT_MD, 'utf8') !== md) stale.push(OUT_MD)
    if (stale.length) {
      console.error(
        `SDK docs are stale. The method table changed without regenerating:\n` +
          stale.map((f) => `  ${f}`).join('\n') +
          `\nRun \`pnpm gen\`.`,
      )
      process.exit(1)
    }
    console.log(`SDK docs are current (${contentSha.slice(0, 12)})`)
    return
  }

  mkdirSync(dirname(OUT_MD), { recursive: true })
  writeFileSync(OUT_TS, ts)
  writeFileSync(OUT_MD, md)
  console.log(`wrote docs artifact ${contentSha.slice(0, 12)} for ${METHODS.length} methods`)
}

main()
