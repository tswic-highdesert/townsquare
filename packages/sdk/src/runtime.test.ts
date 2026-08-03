import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { METHODS as WIRE_METHODS } from '@townsquare/shared'
import { METHOD_MAP } from './methods.js'

/**
 * The guest runtime is plain JavaScript served verbatim to browsers, so it is
 * not covered by the TypeScript method-table checks. Without this test it could
 * drift from the wire contract silently: a typo in a method string would ship as
 * a creation-breaking `invalid_request` that no CI step would catch.
 */
const source = readFileSync(fileURLToPath(new URL('../runtime/sdk.js', import.meta.url)), 'utf8')

function methodStringsIn(src: string): Set<string> {
  const found = new Set<string>()
  for (const m of src.matchAll(/\b(?:call|notify)\(\s*'([^']+)'/g)) {
    found.add(m[1]!)
  }
  return found
}

describe('guest runtime', () => {
  const used = methodStringsIn(source)

  it('calls only methods that exist on the wire', () => {
    for (const m of used) {
      expect(METHOD_MAP.has(m), `runtime calls "${m}", which is not a wire method`).toBe(true)
    }
  })

  it('implements every wire method', () => {
    for (const m of WIRE_METHODS) {
      expect(used.has(m), `wire method "${m}" is not reachable from the guest runtime`).toBe(true)
    }
  })

  it('exports every documented namespace', () => {
    for (const ns of ['app', 'town', 'user', 'records', 'storage']) {
      expect(source).toMatch(new RegExp(`export const ${ns} = `))
    }
  })

  it('ships unminified, since source is what gets reviewed and forked', () => {
    const lines = source.split('\n')
    const mean = source.length / lines.length
    expect(mean).toBeLessThan(200)
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThan(500)
  })

  it('never posts to the parent outside the handshake', () => {
    // Exactly one window.parent.postMessage, the hello. Everything else goes
    // over the port. A second one would be a channel outside the audited path.
    const parentPosts = [...source.matchAll(/window\.parent\.postMessage/g)]
    expect(parentPosts).toHaveLength(1)
  })

  it('validates the message source before reading any field', () => {
    expect(source).toMatch(/e\.source !== window\.parent/)
  })
})
