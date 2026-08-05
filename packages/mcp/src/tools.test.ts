import { beforeEach, describe, expect, it } from 'vitest'
import { SDK_DOCS } from '@townsquare/sdk'
import {
  TOOL_DEFS,
  ToolError,
  assertToolTable,
  exampleManifestParses,
  runTool,
} from './tools.js'
import { acceptFile, sha256Hex, type InventoryEntry } from './drafts.js'
import { makeFixture, makeResident, helloBundle, type Fixture } from './fixtures.js'
import type { Principal } from './context.js'

const enc = new TextEncoder()

/** The whole upload path, driven the way an agent would drive it. */
async function uploadBundle(
  fixture: Fixture,
  principal: Principal,
  files: Array<{ path: string; text: string }>,
  slug = 'hello',
): Promise<string> {
  const inventory: InventoryEntry[] = files.map((f) => {
    const bytes = enc.encode(f.text)
    return { path: f.path, sha256: sha256Hex(bytes), bytes: bytes.byteLength }
  })
  const begun = (await runTool(fixture.ctx, principal, 'begin_upload', { slug, inventory })) as {
    draft_id: string
    upload_token: string
  }

  for (const file of files) {
    const bytes = enc.encode(file.text)
    const draft = (await fixture.drafts.draftById(begun.draft_id))!
    const verdict = acceptFile(draft, begun.upload_token, file.path, bytes, fixture.clock.now)
    expect(verdict, file.path).toEqual({ ok: true })
    await fixture.drafts.putFile(begun.draft_id, file.path, bytes, fixture.clock.now)
  }
  return begun.draft_id
}

describe('the tool table', () => {
  it('is internally consistent', () => {
    expect(() => assertToolTable()).not.toThrow()
  })

  it('has the seventeen tools this phase ships', () => {
    expect(TOOL_DEFS).toHaveLength(17)
  })

  it('describes every tool well enough for a model to route on', () => {
    for (const tool of TOOL_DEFS) {
      expect(tool.description.length, tool.name).toBeGreaterThan(120)
    }
  })

  it('ships an example manifest that actually parses', () => {
    // A reference manifest that would be rejected teaches every agent that
    // reads it to write a rejected manifest.
    expect(exampleManifestParses()).toBe(true)
  })

  it('marks the read-only tools honestly', () => {
    const mutating = TOOL_DEFS.filter((t) => !t.readOnly).map((t) => t.name)
    expect(mutating.sort()).toEqual(['begin_upload', 'discard_draft', 'preview', 'submit'])
  })
})

describe('orientation', () => {
  let fixture: Fixture

  beforeEach(() => {
    fixture = makeFixture()
  })

  it('tells an unverified resident they cannot submit, and why', async () => {
    const me = await makeResident(fixture, 'newcomer')
    const result = (await runTool(fixture.ctx, me, 'whoami', {})) as Record<string, unknown>
    expect(result['verified']).toBe(false)
    expect(result['can_build']).toBe(true)
    expect(result['can_submit']).toBe(false)
    expect(String(result['why_not'])).toContain('vouch')
  })

  it('serves the docs artifact the SDK generated', async () => {
    const me = await makeResident(fixture, 'newcomer')
    const result = (await runTool(fixture.ctx, me, 'get_sdk_docs', {})) as Record<string, unknown>
    expect(result['content_sha256']).toBe(SDK_DOCS.contentSha256)
    expect(result['sdk_major']).toBe(SDK_DOCS.sdkMajor)
  })

  it('serves the real town data, capped', async () => {
    const me = await makeResident(fixture, 'newcomer')
    const info = (await runTool(fixture.ctx, me, 'query_town_data', { dataset: 'info' })) as {
      name: string
    }
    expect(info.name).toBe('Russellville')

    const businesses = (await runTool(fixture.ctx, me, 'query_town_data', {
      dataset: 'businesses',
      limit: 500,
    })) as { items: unknown[] }
    expect(businesses.items.length).toBeLessThanOrEqual(50)
  })

  it('points at existing record types so a builder reuses rather than forks', async () => {
    fixture.recordTypes.define({
      type: 'flock_camera',
      schema: { lat: { type: 'number' } },
      definedBy: 'flock-map',
      recordCount: 12,
    })
    const me = await makeResident(fixture, 'newcomer')
    const result = (await runTool(fixture.ctx, me, 'list_record_types', {})) as {
      types: Array<{ type: string }>
      note: string
    }
    expect(result.types.map((t) => t.type)).toEqual(['flock_camera'])
    expect(result.note).toContain('Reuse')
  })
})

describe('the build loop', () => {
  let fixture: Fixture

  beforeEach(() => {
    fixture = makeFixture()
  })

  it('scaffolds something the validator accepts once uploaded', async () => {
    const me = await makeResident(fixture, 'builder', { verified: true })
    const scaffolded = (await runTool(fixture.ctx, me, 'scaffold', {
      name: 'Trail Conditions',
      tagline: 'Whether the river trail is under water',
      description: 'Reads nothing and renders a page, as a starting point.',
      template: 'directory',
    })) as { files: Array<{ path: string; text: string }> }

    const draftId = await uploadBundle(fixture, me, scaffolded.files, 'trail-conditions')
    const report = (await runTool(fixture.ctx, me, 'validate', { draft_id: draftId })) as {
      ok: boolean
      errors: unknown[]
    }
    expect(report.errors).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('runs the whole path from begin_upload to a live preview URL', async () => {
    const me = await makeResident(fixture, 'builder', { verified: true })
    const draftId = await uploadBundle(fixture, me, helloBundle())

    const status = (await runTool(fixture.ctx, me, 'upload_status', { draft_id: draftId })) as {
      missing_files: string[]
      received: number
    }
    expect(status.missing_files).toEqual([])
    expect(status.received).toBe(3)

    const preview = (await runTool(fixture.ctx, me, 'preview', { draft_id: draftId })) as {
      preview_url: string
    }
    expect(preview.preview_url).toMatch(/^http:\/\/p-[0-9a-f]{16}\.tsq-apps\.localhost:3031$/)

    // The preview is not a simulation: it is resolvable through the same store
    // the sandbox serves from, with a frozen CSP compiled at publish time.
    const key = /p-([0-9a-f]{16})/.exec(preview.preview_url)![1]!
    const resolved = await fixture.bundles.resolveOrigin('preview', key)
    expect(resolved?.entryPath).toBe('index.html')
    expect(resolved?.cspHeader).toContain("script-src 'self'")
  })

  it('refuses to preview a draft that is missing declared files', async () => {
    const me = await makeResident(fixture, 'builder', { verified: true })
    const files = helloBundle()
    const inventory: InventoryEntry[] = files.map((f) => {
      const bytes = enc.encode(f.text)
      return { path: f.path, sha256: sha256Hex(bytes), bytes: bytes.byteLength }
    })
    const begun = (await runTool(fixture.ctx, me, 'begin_upload', {
      slug: 'hello',
      inventory,
    })) as { draft_id: string }

    await expect(
      runTool(fixture.ctx, me, 'preview', { draft_id: begun.draft_id }),
    ).rejects.toThrow(/have not been uploaded/)
  })

  it('rejects a minified bundle at validate and again at submit', async () => {
    const me = await makeResident(fixture, 'builder', { verified: true })
    const files = helloBundle()
    files.push({ path: 'app.js', text: `const a=1;${'x'.repeat(3000)}` })

    const draftId = await uploadBundle(fixture, me, files)
    const report = (await runTool(fixture.ctx, me, 'validate', { draft_id: draftId })) as {
      ok: boolean
      errors: Array<{ code: string }>
    }
    expect(report.ok).toBe(false)
    expect(report.errors.some((e) => e.code === 'minified')).toBe(true)

    // Same function, so the queue cannot accept what the agent was told to fix.
    await expect(runTool(fixture.ctx, me, 'submit', { draft_id: draftId })).rejects.toThrow(
      /validation failed/,
    )
  })

  it('queues a clean bundle and pins it by digest', async () => {
    const me = await makeResident(fixture, 'builder', { verified: true })
    const draftId = await uploadBundle(fixture, me, helloBundle())
    const result = (await runTool(fixture.ctx, me, 'submit', { draft_id: draftId })) as {
      submission_id: string
      bundle_digest: string
      status: string
    }
    expect(result.status).toBe('queued')
    expect(result.bundle_digest).toMatch(/^[0-9a-f]{64}$/)

    const status = (await runTool(fixture.ctx, me, 'submission_status', {
      submission_id: result.submission_id,
    })) as { status: string }
    expect(status.status).toBe('queued')
  })

  it('freezes a submitted draft against further uploads', async () => {
    const me = await makeResident(fixture, 'builder', { verified: true })
    const draftId = await uploadBundle(fixture, me, helloBundle())
    await runTool(fixture.ctx, me, 'submit', { draft_id: draftId })

    await expect(runTool(fixture.ctx, me, 'submit', { draft_id: draftId })).rejects.toThrow(
      /already in the queue/,
    )
    await expect(runTool(fixture.ctx, me, 'discard_draft', { draft_id: draftId })).rejects.toThrow(
      /in review/,
    )
  })

  it('replaces rather than merges when an inventory is re-declared', async () => {
    const me = await makeResident(fixture, 'builder', { verified: true })
    const first = await uploadBundle(fixture, me, helloBundle())

    const files = helloBundle()
    const inventory: InventoryEntry[] = files.map((f) => {
      const bytes = enc.encode(f.text)
      return { path: f.path, sha256: sha256Hex(bytes), bytes: bytes.byteLength }
    })
    const again = (await runTool(fixture.ctx, me, 'begin_upload', {
      slug: 'hello',
      inventory,
      draft_id: first,
    })) as { draft_id: string }

    // The old draft is gone, not merged into: no file from a superseded
    // inventory can survive into the bundle a reviewer reads.
    expect(await fixture.drafts.draftById(first)).toBeNull()
    expect(again.draft_id).not.toBe(first)
  })

  it('refuses an oversized inventory before a byte moves', async () => {
    const me = await makeResident(fixture, 'builder', { verified: true })
    await expect(
      runTool(fixture.ctx, me, 'begin_upload', {
        slug: 'huge',
        inventory: [
          { path: 'townsquare.json', sha256: 'a'.repeat(64), bytes: 10 },
          { path: 'big.js', sha256: 'b'.repeat(64), bytes: 99_000_000 },
        ],
      }),
    ).rejects.toThrow(ToolError)
  })

  it('hands back a shell command rather than inviting a paste', async () => {
    const me = await makeResident(fixture, 'builder', { verified: true })
    const bytes = enc.encode('{}')
    const begun = (await runTool(fixture.ctx, me, 'begin_upload', {
      slug: 'hello',
      inventory: [{ path: 'townsquare.json', sha256: sha256Hex(bytes), bytes: bytes.byteLength }],
    })) as { shell_command: string; upload_url: string }
    expect(begun.shell_command).toContain('--data-binary')
    expect(begun.shell_command).toContain(begun.upload_url)
  })
})

describe('what one resident can reach of another', () => {
  let fixture: Fixture

  beforeEach(() => {
    fixture = makeFixture()
  })

  it('answers a neighbour’s draft id exactly like a draft that does not exist', async () => {
    const mine = await makeResident(fixture, 'builder', { verified: true })
    const theirs = await makeResident(fixture, 'neighbour', { verified: true })
    const draftId = await uploadBundle(fixture, mine, helloBundle())

    const real = await runTool(fixture.ctx, theirs, 'validate', { draft_id: draftId }).catch(
      (e: Error) => e.message,
    )
    const invented = await runTool(fixture.ctx, theirs, 'validate', {
      draft_id: 'not-a-real-draft',
    }).catch((e: Error) => e.message)

    expect(real).toBe(`no draft "${draftId}"`)
    expect(invented).toBe('no draft "not-a-real-draft"')
  })

  it('does not list a neighbour’s drafts', async () => {
    const mine = await makeResident(fixture, 'builder', { verified: true })
    const theirs = await makeResident(fixture, 'neighbour', { verified: true })
    await uploadBundle(fixture, mine, helloBundle())

    const listed = (await runTool(fixture.ctx, theirs, 'list_drafts', {})) as { items: unknown[] }
    expect(listed.items).toEqual([])
  })

  it('does not reveal a neighbour’s submission', async () => {
    const mine = await makeResident(fixture, 'builder', { verified: true })
    const theirs = await makeResident(fixture, 'neighbour', { verified: true })
    const draftId = await uploadBundle(fixture, mine, helloBundle())
    const submitted = (await runTool(fixture.ctx, mine, 'submit', { draft_id: draftId })) as {
      submission_id: string
    }

    await expect(
      runTool(fixture.ctx, theirs, 'submission_status', {
        submission_id: submitted.submission_id,
      }),
    ).rejects.toThrow(/no submission/)
  })
})

describe('the verified gate', () => {
  let fixture: Fixture

  beforeEach(() => {
    fixture = makeFixture()
  })

  it('lets an unverified resident build and preview but not submit', async () => {
    const me = await makeResident(fixture, 'newcomer')
    const draftId = await uploadBundle(fixture, me, helloBundle())

    // Everything up to the town seeing it works.
    await runTool(fixture.ctx, me, 'validate', { draft_id: draftId })
    await runTool(fixture.ctx, me, 'preview', { draft_id: draftId })

    await expect(runTool(fixture.ctx, me, 'submit', { draft_id: draftId })).rejects.toThrow(
      /verified residents/,
    )
  })

  it('applies the gate from the table, not from inside a handler', async () => {
    const me = await makeResident(fixture, 'newcomer')
    const gated = TOOL_DEFS.filter((t) => t.requires === 'verified').map((t) => t.name)
    expect(gated).toEqual(['submit'])

    for (const name of gated) {
      await expect(runTool(fixture.ctx, me, name, { draft_id: 'x' })).rejects.toThrow(
        /verified residents/,
      )
    }
  })

  it('reads verification fresh, so a vouch granted after minting counts', async () => {
    const me = await makeResident(fixture, 'newcomer')
    const draftId = await uploadBundle(fixture, me, helloBundle())

    // The principal is rebuilt per request from the store, which is what makes
    // this true in the service and not only in the test.
    const verified = { ...me, verified: true }
    const result = (await runTool(fixture.ctx, verified, 'submit', { draft_id: draftId })) as {
      status: string
    }
    expect(result.status).toBe('queued')
  })
})
