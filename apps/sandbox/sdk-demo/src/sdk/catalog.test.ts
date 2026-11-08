/**
 * Keeps the demo's hand-written catalog in step with the SDK.
 *
 * `methods.ts` copies each method's signature and permission from the SDK's
 * method table (`packages/sdk/src/methods.ts`), because a creation cannot
 * import that table at runtime. Copies drift. These tests fail the moment the
 * SDK adds, renames or re-permissions a method and the demo has not caught up.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { METHODS as SDK_TABLE, type Requirement } from '../../../../../packages/sdk/src/methods.js'
import { DEMO_RECORD_TYPE, METHODS, NAMESPACES } from './methods.js'
import { loadDemoManifest } from './mockBridge.js'

// methods.ts imports the guest runtime; the repo-wide alias points elsewhere.
vi.mock('@townsquare/sdk', () => import('../../../../../packages/sdk/runtime/sdk.js'))

/** How the demo writes each kind of requirement for a reader. */
function describeRequirement(req: Requirement): string | null {
  switch (req.kind) {
    case 'none':
      return null
    case 'identity':
      return 'permissions.identity: "handle"'
    case 'storage':
      return 'permissions.storage: true'
    case 'recordRead':
      return `"${DEMO_RECORD_TYPE}" in permissions.read`
    case 'recordWrite':
      return `"${DEMO_RECORD_TYPE}" in permissions.write`
  }
}

describe('the demo catalog matches the SDK method table', () => {
  const demoIds = METHODS.map((m) => m.id)
  const sdkIds = SDK_TABLE.map((m) => m.method)

  it('lists every SDK method, and nothing the SDK does not have', () => {
    expect([...demoIds].sort()).toEqual([...sdkIds].sort())
  })

  it('lists each method once', () => {
    expect(new Set(demoIds).size).toBe(demoIds.length)
  })

  for (const def of SDK_TABLE) {
    describe(def.method, () => {
      const demo = METHODS.find((m) => m.id === def.method)

      it('has the same signature', () => {
        expect(demo?.signature).toBe(def.signature)
      })

      it('states the same permission requirement', () => {
        expect(demo?.requires).toBe(describeRequirement(def.requires))
      })

      it('sits in the namespace its name starts with', () => {
        expect(demo?.namespace).toBe(def.method.split('.')[0])
      })
    })
  }

  it('shows every namespace, and only those', () => {
    const fromTable = new Set(sdkIds.map((id) => id.split('.')[0]))
    expect([...NAMESPACES].sort()).toEqual([...fromTable].sort())
  })
})

describe('the demo type declarations match the SDK method table', () => {
  const dts = readFileSync(new URL('../townsquare-sdk.d.ts', import.meta.url), 'utf8')

  /** `export const town: { info(): ... }` becomes town -> {info, ...}. */
  function declaredMethods(): Map<string, Set<string>> {
    const out = new Map<string, Set<string>>()
    for (const block of dts.matchAll(/export const (\w+): \{([\s\S]*?)\n {2}\}/g)) {
      const names = [...block[2]!.matchAll(/^\s+(\w+)\(/gm)].map((m) => m[1]!)
      out.set(block[1]!, new Set(names))
    }
    return out
  }

  it('declares every SDK method', () => {
    const declared = declaredMethods()
    for (const def of SDK_TABLE) {
      const [ns, name] = def.method.split('.') as [string, string]
      expect(declared.get(ns)?.has(name), `${def.method} is missing from townsquare-sdk.d.ts`).toBe(true)
    }
  })

  it('declares every error code the SDK says a method can throw', () => {
    // Up to the next declaration, so it works with either line ending.
    const union = dts.match(/export type ErrorCode =([\s\S]*?)export /)?.[1] ?? ''
    const declared = new Set([...union.matchAll(/'(\w+)'/g)].map((m) => m[1]!))
    for (const def of SDK_TABLE) {
      for (const code of def.throws) {
        expect(declared.has(code), `${def.method} throws "${code}", which ErrorCode does not list`).toBe(true)
      }
    }
  })
})

describe('notes about the local shell stay true', () => {
  // The local shell stubs some town.* methods with empty answers. The demo
  // says so on exactly those methods, so a reader does not hunt for a bug.
  const townData = readFileSync(
    new URL('../../../../../apps/web/src/townData.ts', import.meta.url),
    'utf8',
  )
  const stubbed = new Set(
    [...townData.matchAll(/^\s+(\w+): async \(\) => (?:\(\{|null)/gm)].map((m) => `town.${m[1]}`),
  )

  it('finds the stubs it is checking', () => {
    expect(stubbed.size).toBeGreaterThan(0)
  })

  for (const method of METHODS.filter((m) => m.namespace === 'town')) {
    const explained = /townData\.ts/.test(method.note ?? '')
    it(`${method.id} ${stubbed.has(method.id) ? 'explains' : 'does not claim'} an empty local answer`, () => {
      expect(explained).toBe(stubbed.has(method.id))
    })
  }
})

describe('the demo manifest', () => {
  it('is valid', () => {
    expect(() => loadDemoManifest()).not.toThrow()
  })

  it('defines, reads and writes the record type the demo uses', () => {
    const manifest = loadDemoManifest()
    expect(manifest.defines.map((d) => d.type)).toContain(DEMO_RECORD_TYPE)
    expect(manifest.permissions.read).toContain(DEMO_RECORD_TYPE)
    expect(manifest.permissions.write).toContain(DEMO_RECORD_TYPE)
  })
})
