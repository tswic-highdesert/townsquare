/**
 * The tool table. Declarative, frozen, and the only place a capability exists.
 *
 * Same shape as the StateLeg MCP for the same reasons: one array a reviewer can
 * read top to bottom, a uniform gate chain in front of every handler, and no
 * tool that quietly does more than its entry says. A capability that is not in
 * this table cannot be reached, and a capability in this table cannot skip the
 * gate.
 *
 * The spec sketched seven tools. There are seventeen here, and the additions
 * are not padding:
 *
 *   `whoami` — so an unverified resident learns they cannot submit *before*
 *   they build, not after. That one tool call is the difference between a
 *   disappointing afternoon and a five-minute detour to ask a neighbour for a
 *   vouch.
 *
 *   `list_record_types` — without it the whole `defines` compounding story is
 *   unreachable. An agent that cannot see that `flock_camera` already exists
 *   will define `flock_cameras` beside it and split the town's data in half,
 *   permanently, in a way no later cleanup can fully undo.
 *
 *   the bundle transfer tools — because bytes must not travel through a model's
 *   context. See `drafts.ts` for why that is a security property and not a
 *   performance one.
 *
 *   `list_drafts` — the seventeenth, and the one that keeps the other six
 *   draft-scoped tools usable: an agent that loses a `draft_id` mid-session
 *   would otherwise have to start the upload over.
 *
 * **Ordering matters in one place.** `validate` and `submit` call the *same*
 * function, so there is no gap between what the agent was told and what the
 * queue enforces. A validator that is advisory at authoring time and real at
 * submit time teaches builders that the advice is optional.
 */

import { z } from 'zod'
import { SDK_DOCS } from '@townsquare/sdk'
import { manifestSchema, MANIFEST_VERSION, SDK_MAJOR, STORAGE_QUOTA_BYTES } from '@townsquare/manifest'
import { validateBundle, hashFiles, bundleDigest, BUNDLE_LIMITS, type ValidationReport } from '@townsquare/bundle'
import { compileCsp } from '@townsquare/shared'
import type { McpContext, Principal } from './context.js'
import {
  UPLOAD_TICKET_TTL_MS,
  MAX_DRAFTS_PER_USER,
  checkInventory,
  draftFiles,
  missingPaths,
  newUploadTicket,
  type Draft,
  type InventoryEntry,
} from './drafts.js'
import { scaffold, type Template } from './scaffold.js'

/**
 * What a tool needs before it runs.
 *
 * `verified` is the only gate that exists, and it guards exactly one thing:
 * putting something in front of the town. Everything else — learning,
 * scaffolding, uploading, previewing — is open to any resident with a token,
 * because a platform that will not let you *try* until you are vouched for has
 * no way to earn a vouch.
 */
export type ToolRequirement = 'none' | 'verified'

export interface ToolDef {
  name: string
  title: string
  /** Written for a model to read. Says what it does and when to reach for it. */
  description: string
  inputSchema: z.ZodRawShape
  requires: ToolRequirement
  /** Advertised to the client; also a real claim this file has to keep. */
  readOnly: boolean
  handler(ctx: McpContext, principal: Principal, args: Record<string, unknown>): Promise<unknown>
}

/** Thrown by a handler when the caller asked for something impossible. */
export class ToolError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message)
    this.name = 'ToolError'
  }
}

// ── shared helpers ───────────────────────────────────────────────────────────

/**
 * Fetch a draft the caller is allowed to touch.
 *
 * Ownership is checked here, once, rather than in each of the six tools that
 * take a `draft_id`. An unknown id and someone else's id return the *same*
 * message on purpose: the difference is an enumeration oracle over other
 * residents' work.
 */
async function ownedDraft(ctx: McpContext, principal: Principal, id: unknown): Promise<Draft> {
  if (typeof id !== 'string' || id.length === 0) throw new ToolError('draft_id is required')
  const draft = await ctx.drafts.draftById(id)
  if (!draft || draft.userId !== principal.userId) {
    throw new ToolError(`no draft "${id}"`, 'Call list_drafts to see the drafts you own.')
  }
  return draft
}

/**
 * The one validation path.
 *
 * `validate`, `preview` and `submit` all land here. If they did not, the queue
 * would enforce something the agent was never told, which is precisely the gap
 * this function exists to close.
 */
async function validateDraft(
  ctx: McpContext,
  draft: Draft,
): Promise<{ report: ValidationReport; missing: string[] }> {
  const missing = missingPaths(draft)
  const files = draftFiles(draft)
  const existingTypes = new Map(
    (await ctx.recordTypes.list()).map((t) => [
      t.type,
      { type: t.type, label: t.type, schema: t.schema as never },
    ]),
  )
  const report = validateBundle(files, { hashes: hashFiles(files), existingTypes })
  return { report, missing }
}

function reportPayload(report: ValidationReport, missing: string[]) {
  const base = {
    complete: missing.length === 0,
    missing_files: missing,
    warnings: report.warnings,
  }
  if (report.ok) {
    return {
      ...base,
      ok: missing.length === 0,
      manifest: report.manifest,
      entry: report.entry,
      errors: [] as unknown[],
    }
  }
  return { ...base, ok: false, errors: report.errors }
}

const inventoryEntry = z.object({
  path: z.string().min(1).max(255),
  sha256: z.string().length(64),
  bytes: z.number().int().min(0),
})

// ── the table ────────────────────────────────────────────────────────────────

const DEFS: ToolDef[] = [
  // ── orientation ───────────────────────────────────────────────────────────
  {
    name: 'whoami',
    title: 'Who you are building as',
    description:
      'Your handle, whether you are a verified resident, and exactly which of these tools you can ' +
      'use. **Call this first.** Anyone can build and preview a creation, but only a verified ' +
      'resident can submit one for review, and finding that out before you write code is worth one ' +
      'tool call.',
    inputSchema: {},
    requires: 'none',
    readOnly: true,
    async handler(ctx, principal) {
      const town = await ctx.town.info()
      return {
        handle: principal.handle,
        verified: principal.verified,
        role: principal.role,
        town,
        can_build: true,
        can_preview: true,
        can_submit: principal.verified,
        ...(principal.verified
          ? {}
          : {
              why_not:
                'Submitting a creation to the town requires being a verified resident. Verification ' +
                'is by vouch: ask neighbours who are already verified to vouch for you at ' +
                `${ctx.shellOrigin}/settings. You can build and preview in the meantime, and nothing ` +
                'you build now is wasted.',
            }),
      }
    },
  },
  {
    name: 'get_sdk_docs',
    title: 'The SDK contract',
    description:
      'The full `@townsquare/sdk` reference: every method, what it needs declared, what it returns, ' +
      'and the rules no tool can enforce for you. **Read this before writing SDK calls.** These docs ' +
      'are generated from the same table the host enforces at runtime, so they cannot drift from ' +
      'what actually happens in the sandbox.',
    inputSchema: {
      section: z
        .enum(['all', 'overview', 'rules', 'reference'])
        .optional()
        .describe('Defaults to all. Use "reference" when you only need method signatures.'),
    },
    requires: 'none',
    readOnly: true,
    async handler(_ctx, _principal, args) {
      const section = (args['section'] as string) ?? 'all'
      const sections =
        section === 'all'
          ? SDK_DOCS.sections
          : { [section]: SDK_DOCS.sections[section as keyof typeof SDK_DOCS.sections] }
      return {
        sdk_major: SDK_DOCS.sdkMajor,
        manifest_version: SDK_DOCS.manifestVersion,
        content_sha256: SDK_DOCS.contentSha256,
        sections,
        symbols: SDK_DOCS.symbols,
      }
    },
  },
  {
    name: 'get_manifest_reference',
    title: 'How to write townsquare.json',
    description:
      'Every manifest field, the permission model, and a worked example. The `permissions` block is ' +
      'default-deny and is the entire job of the human who reviews your creation, so declare exactly ' +
      'what you use: an unused permission is not harmless, it is noise a reviewer has to rule out. ' +
      'Note that `town.*` reads need no declaration at all, and that `author` and `id` are assigned ' +
      'by the platform and are rejected if you write them yourself.',
    inputSchema: {},
    requires: 'none',
    readOnly: true,
    async handler() {
      return {
        manifest_version: MANIFEST_VERSION,
        sdk: SDK_MAJOR,
        limits: {
          total_bytes: BUNDLE_LIMITS.totalBytes,
          file_bytes: BUNDLE_LIMITS.fileBytes,
          entry_bytes: BUNDLE_LIMITS.entryBytes,
          file_count: BUNDLE_LIMITS.fileCount,
          storage_quota_bytes: STORAGE_QUOTA_BYTES,
        },
        fields: MANIFEST_FIELD_DOCS,
        permissions: PERMISSION_DOCS,
        example: EXAMPLE_MANIFEST,
      }
    },
  },
  {
    name: 'list_record_types',
    title: 'Record types the town already has',
    description:
      'Every shared record type, its field schema, which creation defined it, and how many records ' +
      'exist. **Call this before you put anything in `defines`.** Records are town-wide and reusable: ' +
      'if a type for your fact already exists, read and write that one. Defining a near-duplicate ' +
      'splits the town\'s data between two types forever, and there is no merge. Type evolution is ' +
      'additive only, so you can add a field to an existing type but never change or remove one.',
    inputSchema: {},
    requires: 'none',
    readOnly: true,
    async handler(ctx) {
      const types = await ctx.recordTypes.list()
      return {
        types,
        note:
          types.length === 0
            ? 'No record types yet. Yours would be the first, which means you are choosing the name ' +
              'everyone else builds against.'
            : 'Reuse before you define. `permissions.read`/`write` take these type names.',
      }
    },
  },
  {
    name: 'list_creations',
    title: 'What the town already has',
    description:
      'Creations already published, so you can see what exists before building it again and read how ' +
      'other residents solved things. Use `get_creation_source` to read one in full.',
    inputSchema: {
      q: z.string().max(200).optional().describe('Substring match on name, tagline and tags.'),
    },
    requires: 'none',
    readOnly: true,
    async handler(ctx, _principal, args) {
      const q = typeof args['q'] === 'string' ? args['q'].toLowerCase() : null
      const all = await ctx.creations.list()
      const items = q
        ? all.filter((c) =>
            [c.name, c.tagline ?? '', ...c.tags].join(' ').toLowerCase().includes(q),
          )
        : all
      return { items, count: items.length }
    },
  },
  {
    name: 'get_creation_source',
    title: 'Read a creation’s source',
    description:
      'The full source of a published creation, so you can learn from it or fork it. Source is stored ' +
      'and readable on purpose: creations are meant to be remixed, and a town where you can read the ' +
      'app someone built is a town where the second app is easier than the first.',
    inputSchema: { slug: z.string().min(1).max(64) },
    requires: 'none',
    readOnly: true,
    async handler(ctx, _principal, args) {
      const slug = String(args['slug'])
      const detail = await ctx.creations.get(slug)
      if (!detail) throw new ToolError(`no creation "${slug}"`, 'Call list_creations for the slugs.')
      return { slug: detail.slug, manifest: detail.manifest, files: detail.files }
    },
  },
  {
    name: 'query_town_data',
    title: 'The real town data',
    description:
      'The same data your creation will read through `town.*` at runtime: town info, ingested items ' +
      '(events, notices, stories) and the business directory. Query it while designing so you build ' +
      'against real field names and real values instead of guessing a shape and fixing it later. ' +
      'This needs no permission declaration, here or in your manifest.',
    inputSchema: {
      dataset: z.enum(['info', 'items', 'businesses']),
      type: z.enum(['event', 'notice', 'story']).optional().describe('Only for dataset "items".'),
      tag: z.string().max(60).optional().describe('Only for dataset "businesses".'),
      q: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(50).optional().describe('Capped at 50 here; the SDK allows 200.'),
    },
    requires: 'none',
    readOnly: true,
    async handler(ctx, _principal, args) {
      const dataset = args['dataset'] as 'info' | 'items' | 'businesses'
      // Capped low deliberately: this is for *shaping* an app, and 700 business
      // rows in a tool result buys nothing a sample of 20 does not.
      const limit = Math.min(50, Number(args['limit'] ?? 20) || 20)
      if (dataset === 'info') return await ctx.town.info()
      if (dataset === 'items') {
        return await ctx.town.items({
          ...(args['type'] ? { type: args['type'] as 'event' } : {}),
          ...(args['q'] ? { q: String(args['q']) } : {}),
          limit,
        })
      }
      return await ctx.town.businesses({
        ...(args['tag'] ? { tag: String(args['tag']) } : {}),
        ...(args['q'] ? { q: String(args['q']) } : {}),
        limit,
      })
    },
  },

  // ── building ──────────────────────────────────────────────────────────────
  {
    name: 'scaffold',
    title: 'Start a creation',
    description:
      'A minimal, working creation you write to an empty directory: manifest, entry document and a ' +
      'placeholder icon. Pick the template closest to your idea — `directory` reads the town business ' +
      'directory, `records` defines and edits a shared record type, `blank` is a bare page. The ' +
      'permissions it emits are exactly what its code uses, which is the standard to hold yourself to.',
    inputSchema: {
      name: z.string().min(1).max(60),
      tagline: z.string().min(1).max(100),
      description: z.string().min(1).max(2000),
      template: z.enum(['blank', 'directory', 'records']).default('blank'),
      record_type: z
        .string()
        .max(40)
        .optional()
        .describe('snake_case type name, for the records template. Check list_record_types first.'),
      record_label: z.string().max(60).optional(),
    },
    requires: 'none',
    readOnly: true,
    async handler(_ctx, _principal, args) {
      try {
        return scaffold({
          name: String(args['name']),
          tagline: String(args['tagline']),
          description: String(args['description']),
          template: (args['template'] as Template) ?? 'blank',
          ...(args['record_type'] ? { recordType: String(args['record_type']) } : {}),
          ...(args['record_label'] ? { recordLabel: String(args['record_label']) } : {}),
        })
      } catch (e) {
        throw new ToolError((e as Error).message)
      }
    },
  },
  {
    name: 'begin_upload',
    title: 'Declare a bundle and get an upload ticket',
    description:
      'Declares every file in your creation by path, sha256 and byte length, and returns a one-time ' +
      'ticket for uploading the actual bytes over HTTP. **Do not paste file contents into a tool ' +
      'call.** Run the returned shell command instead: it POSTs each file, and the server rejects ' +
      'anything whose bytes do not match what you declared here. The inventory is the contract — a ' +
      'path you did not declare cannot be added later, which is what makes "everything is vendored" ' +
      'a fact rather than a promise.',
    inputSchema: {
      slug: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'lowercase, digits and hyphens')
        .describe('Your proposed URL slug. The platform assigns the final one.'),
      inventory: z.array(inventoryEntry).min(1).max(BUNDLE_LIMITS.fileCount),
      draft_id: z
        .string()
        .optional()
        .describe('Re-declare an existing draft, e.g. after changing files. Files are re-uploaded.'),
    },
    requires: 'none',
    readOnly: false,
    async handler(ctx, principal, args) {
      const now = ctx.now()
      const inventory = args['inventory'] as InventoryEntry[]
      const problems = checkInventory(inventory)
      if (problems.length > 0) {
        throw new ToolError(
          `the declared inventory cannot be accepted:\n` +
            problems.map((p) => `  ${p.path}: ${p.message}`).join('\n'),
        )
      }

      // Re-declaring replaces the old draft outright rather than merging. A
      // merge would leave files from a previous inventory sitting in a bundle
      // nobody declared, which is the exact hole the inventory closes.
      const existingId = args['draft_id']
      if (existingId !== undefined) {
        const previous = await ownedDraft(ctx, principal, existingId)
        if (previous.status === 'submitted') {
          throw new ToolError(
            'that draft has been submitted and is frozen',
            'Call begin_upload without draft_id to start the next version.',
          )
        }
        await ctx.drafts.deleteDraft(previous.id)
      } else {
        const mine = await ctx.drafts.draftsForUser(principal.userId)
        if (mine.length >= MAX_DRAFTS_PER_USER) {
          throw new ToolError(
            `you have ${mine.length} drafts, the limit is ${MAX_DRAFTS_PER_USER}`,
            'Call discard_draft on one you are finished with.',
          )
        }
      }

      const ticket = newUploadTicket()
      const draft = await ctx.drafts.createDraft(
        {
          userId: principal.userId,
          slug: String(args['slug']),
          inventory,
          uploadTokenHash: ticket.hash,
          uploadExpiresAt: now + UPLOAD_TICKET_TTL_MS,
        },
        now,
      )

      const url = `${ctx.publicUrl}/upload/${draft.id}`
      return {
        draft_id: draft.id,
        upload_url: url,
        upload_token: ticket.token,
        expires_at: new Date(draft.uploadExpiresAt).toISOString(),
        files_expected: inventory.length,
        how_to_upload:
          'One POST per file, raw bytes as the body, the path as a query parameter. ' +
          'Run this from the directory holding your creation:',
        shell_command: uploadScript(url, ticket.token, inventory),
        then: 'Call upload_status to confirm every file landed, then validate.',
      }
    },
  },
  {
    name: 'upload_status',
    title: 'What has landed',
    description:
      'Which declared files have arrived and which are still missing. Call this after uploading. A ' +
      'file that is missing here either failed its hash check or was never sent, and the upload ' +
      'response said which.',
    inputSchema: { draft_id: z.string() },
    requires: 'none',
    readOnly: true,
    async handler(ctx, principal, args) {
      const draft = await ownedDraft(ctx, principal, args['draft_id'])
      const missing = missingPaths(draft)
      return {
        draft_id: draft.id,
        slug: draft.slug,
        status: draft.status,
        declared: draft.inventory.length,
        received: draft.inventory.length - missing.length,
        missing_files: missing,
        upload_expires_at: new Date(draft.uploadExpiresAt).toISOString(),
        ticket_expired: draft.uploadExpiresAt <= ctx.now(),
      }
    },
  },
  {
    name: 'validate',
    title: 'Check a draft before anyone sees it',
    description:
      'Runs the publish checks against your uploaded draft: manifest schema, declared-vs-used ' +
      'permissions, record-type compatibility, path legality, size limits, minification, and pasted ' +
      'secrets. **This is the same function `submit` runs server side**, so a clean result here means ' +
      'the queue will accept it. Errors block publishing; warnings are for the human reviewer and are ' +
      'worth reading, since a reviewer who has to chase one is a reviewer who is slower to approve.',
    inputSchema: { draft_id: z.string() },
    requires: 'none',
    readOnly: true,
    async handler(ctx, principal, args) {
      const draft = await ownedDraft(ctx, principal, args['draft_id'])
      const { report, missing } = await validateDraft(ctx, draft)
      return { draft_id: draft.id, ...reportPayload(report, missing) }
    },
  },
  {
    name: 'preview',
    title: 'Run it in a real sandbox',
    description:
      'Publishes the draft to a private preview origin and returns a URL you can open. It runs under ' +
      'the *same* sandbox, the same compiled CSP and the same bridge as a published creation, so ' +
      'anything that works here works after approval and anything blocked here would have been blocked ' +
      'there. Nobody else can see it. Re-run after re-uploading to refresh.',
    inputSchema: { draft_id: z.string() },
    requires: 'none',
    readOnly: false,
    async handler(ctx, principal, args) {
      const draft = await ownedDraft(ctx, principal, args['draft_id'])
      const { report, missing } = await validateDraft(ctx, draft)
      if (missing.length > 0) {
        throw new ToolError(
          `${missing.length} declared file(s) have not been uploaded`,
          'Call upload_status to see which.',
        )
      }
      if (!report.ok) {
        throw new ToolError(
          'this draft does not pass validation, so there is nothing to serve',
          'Call validate to see the errors.',
        )
      }
      const published = await ctx.publisher.publishPreview({
        draft,
        manifest: report.manifest,
        entry: report.entry,
      })
      await ctx.drafts.updateDraft(draft.id, { previewKey: published.previewKey }, ctx.now())
      return {
        draft_id: draft.id,
        preview_url: published.url,
        expires_at: new Date(published.expiresAt).toISOString(),
        warnings: report.warnings,
        note: 'Open this in a browser. Console errors from your app show up there, not here.',
      }
    },
  },
  {
    name: 'submit',
    title: 'Send it for review',
    description:
      'Queues the draft for a human reviewer. Requires being a verified resident. Publishing is ' +
      'reviewed because a creation runs inside Town Square with whatever it declared, and **updates ' +
      'are reviewed too** — approval is of one exact version, not of you. Re-running validation ' +
      'server side here is not ceremony: it is what makes the check you ran and the check the queue ' +
      'runs the same check.',
    inputSchema: {
      draft_id: z.string(),
      note: z.string().max(1000).optional().describe('Anything the reviewer should know.'),
    },
    requires: 'verified',
    readOnly: false,
    async handler(ctx, principal, args) {
      const draft = await ownedDraft(ctx, principal, args['draft_id'])
      if (draft.submissionId) {
        throw new ToolError(
          'this draft is already in the queue',
          'Call submission_status for where it stands.',
        )
      }
      const { report, missing } = await validateDraft(ctx, draft)
      if (missing.length > 0) {
        throw new ToolError(`${missing.length} declared file(s) have not been uploaded`)
      }
      if (!report.ok) {
        throw new ToolError(
          'validation failed, so this was not queued:\n' +
            report.errors.map((e) => `  ${e.path}: ${e.code} — ${e.message}`).join('\n'),
        )
      }

      const submission = await ctx.review.submit({
        draft,
        manifest: report.manifest,
        warnings: report.warnings,
        now: ctx.now(),
      })
      await ctx.drafts.updateDraft(
        draft.id,
        { submissionId: submission.id, status: 'submitted' },
        ctx.now(),
      )
      const hashes = hashFiles(draftFiles(draft))
      return {
        submission_id: submission.id,
        status: submission.status,
        bundle_digest: bundleDigest(hashes),
        warnings: report.warnings,
        what_happens_next:
          'A reviewer reads your source and your permissions block. The bundle is pinned by digest, ' +
          'so what they approve is exactly what runs. You will see the outcome on submission_status.',
      }
    },
  },
  {
    name: 'submission_status',
    title: 'Where a submission stands',
    description:
      'The review state of something you submitted, and the reviewer’s note once there is one. ' +
      'Queued means nobody has looked yet; changes_requested means the note tells you what to fix ' +
      'before re-submitting. You only ever see your own submissions.',
    inputSchema: { submission_id: z.string() },
    requires: 'none',
    readOnly: true,
    async handler(ctx, principal, args) {
      const submission = await ctx.review.submissionById(String(args['submission_id']))
      if (!submission || submission.userId !== principal.userId) {
        throw new ToolError(`no submission "${String(args['submission_id'])}"`)
      }
      return submission
    },
  },
  {
    name: 'list_drafts',
    title: 'Your drafts',
    description:
      'Every draft you own, newest first, with how complete each one is and whether it has been ' +
      'submitted. Use it when you have lost a `draft_id` mid-session, or to check what is still ' +
      'sitting around before starting something new.',
    inputSchema: {},
    requires: 'none',
    readOnly: true,
    async handler(ctx, principal) {
      const drafts = await ctx.drafts.draftsForUser(principal.userId)
      return {
        items: drafts.map((d) => ({
          draft_id: d.id,
          slug: d.slug,
          status: d.status,
          declared: d.inventory.length,
          received: d.inventory.length - missingPaths(d).length,
          submission_id: d.submissionId,
          updated_at: new Date(d.updatedAt).toISOString(),
        })),
      }
    },
  },
  {
    name: 'list_my_creations',
    title: 'Your published creations',
    description:
      'Creations of yours the town can see, with their status. Use this before starting an update, so ' +
      'you are working from the version that is actually live.',
    inputSchema: {},
    requires: 'none',
    readOnly: true,
    async handler(ctx, principal) {
      const items = await ctx.creations.listForUser(principal.userId)
      const submissions = await ctx.review.submissionsForUser(principal.userId)
      return { items, submissions }
    },
  },
  {
    name: 'discard_draft',
    title: 'Throw a draft away',
    description:
      'Deletes a draft and its uploaded files. Submitted drafts cannot be discarded, because the ' +
      'reviewer is looking at one. Use it to stay under the per-resident draft limit, or when an ' +
      'experiment did not go anywhere.',
    inputSchema: { draft_id: z.string() },
    requires: 'none',
    readOnly: false,
    async handler(ctx, principal, args) {
      const draft = await ownedDraft(ctx, principal, args['draft_id'])
      if (draft.status === 'submitted') {
        throw new ToolError('a submitted draft cannot be discarded while it is in review')
      }
      await ctx.drafts.deleteDraft(draft.id)
      return { discarded: draft.id }
    },
  },
]

export const TOOL_DEFS: ReadonlyArray<Readonly<ToolDef>> = Object.freeze(DEFS)

export const TOOL_MAP: ReadonlyMap<string, Readonly<ToolDef>> = new Map(
  TOOL_DEFS.map((t) => [t.name, t]),
)

/**
 * The gate, and the only way a tool is ever called.
 *
 * One function rather than a check inside each handler: a tool cannot forget to
 * gate itself because a tool never gates itself. The transport calls this, and
 * so do the tests, so what the tests prove is what the transport does.
 */
export async function runTool(
  ctx: McpContext,
  principal: Principal,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const tool = TOOL_MAP.get(name)
  if (!tool) throw new ToolError(`no tool "${name}"`)
  if (tool.requires === 'verified' && !principal.verified) {
    throw new ToolError(
      `${tool.name} is for verified residents, and you are not verified yet`,
      `Verification is by vouch. Ask neighbours who are already verified to vouch for you at ` +
        `${ctx.shellOrigin}/settings. Everything else here works in the meantime.`,
    )
  }
  return tool.handler(ctx, principal, args)
}

/**
 * Fail at import time rather than shipping a half-described tool.
 *
 * The description length floor is not style policing. A model picks a tool off
 * its description alone, and a thin one produces an agent that calls `submit`
 * before `validate` and then explains the failure to a resident who cannot fix
 * it.
 */
export function assertToolTable(): void {
  const seen = new Set<string>()
  for (const tool of TOOL_DEFS) {
    if (seen.has(tool.name)) throw new Error(`duplicate tool: ${tool.name}`)
    seen.add(tool.name)
    if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) throw new Error(`bad tool name: ${tool.name}`)
    if (tool.description.length < 120) {
      throw new Error(`${tool.name}: description is too thin for a model to route on`)
    }
  }
}

// ── the shell command handed to the agent ───────────────────────────────────

/**
 * A copy-pasteable upload loop.
 *
 * Handed over as one command because the alternative is a model inventing a
 * curl invocation per file and getting the `--data-binary` versus `-d`
 * distinction wrong, which silently mangles every newline in the bundle and
 * fails the hash check with no clue why.
 */
function uploadScript(url: string, token: string, inventory: readonly InventoryEntry[]): string {
  const paths = inventory.map((e) => `  '${e.path.replace(/'/g, "'\\''")}'`).join('\n')
  return `for f in \\
${paths}
do
  curl -sS -X POST "${url}?path=$f" \\
    -H "Authorization: Bearer ${token}" \\
    -H "Content-Type: application/octet-stream" \\
    --data-binary "@$f" && echo " <- $f"
done`
}

// ── reference material, kept next to the tool that serves it ────────────────

const MANIFEST_FIELD_DOCS: ReadonlyArray<{ field: string; required: boolean; notes: string }> =
  Object.freeze([
    { field: 'manifest_version', required: true, notes: `Always ${MANIFEST_VERSION}.` },
    { field: 'sdk', required: true, notes: `Always ${SDK_MAJOR}. SDK 1 will not break.` },
    { field: 'name', required: true, notes: 'Up to 60 characters. What the town sees.' },
    { field: 'tagline', required: true, notes: 'One line, up to 100 characters.' },
    { field: 'description', required: true, notes: 'Up to 2000 characters. The reviewer reads this first.' },
    { field: 'version', required: true, notes: 'semver, e.g. 1.0.0. Bump it for every submission.' },
    { field: 'tags', required: false, notes: 'Up to 5 lowercase tags for discovery.' },
    { field: 'entry', required: true, notes: 'Relative path to your HTML entry document.' },
    { field: 'icon', required: true, notes: 'Relative path to a square .png, .svg or .webp.' },
    {
      field: 'display',
      required: false,
      notes: '{ surface: "full" | "card", height: "auto" | 200-4000 }. Default auto, which measures you.',
    },
    { field: 'permissions', required: false, notes: 'Default-deny. See the permissions section.' },
    {
      field: 'defines',
      required: false,
      notes:
        'Record types you introduce, up to 5. Check list_record_types first; additive evolution only, ' +
        'first definer wins and owns nothing.',
    },
    {
      field: 'author / id',
      required: false,
      notes: 'Never write these. They are platform-assigned and a manifest containing either is rejected.',
    },
  ])

const PERMISSION_DOCS: ReadonlyArray<{ key: string; notes: string }> = Object.freeze([
  {
    key: 'identity',
    notes:
      '"none" (default) or "handle". "handle" lets `user.current()` return { handle, verified }. There ' +
      'is no level above it: email and real names are not reachable from a creation at all.',
  },
  {
    key: 'read / write',
    notes:
      'Record type names only. Ingested town content is read through `town.*` and needs no ' +
      'declaration. Writing a type means any verified resident using your app can edit it.',
  },
  {
    key: 'network',
    notes:
      'Bare hostnames, no scheme or port or wildcard, up to 10. Compiled into your CSP for ' +
      'connect-src, img-src, media-src and font-src. `script-src` is always \'self\', ' +
      'unconditionally, which is why every script must be vendored into your bundle.',
  },
  { key: 'storage', notes: `true to use storage.get/set. ${STORAGE_QUOTA_BYTES} bytes per user.` },
  { key: 'device', notes: 'Reserved. Must be empty.' },
])

const EXAMPLE_MANIFEST = Object.freeze({
  manifest_version: MANIFEST_VERSION,
  sdk: SDK_MAJOR,
  name: 'Flock Camera Map',
  tagline: 'Every automated licence plate reader residents have found',
  description:
    'Maps the Flock cameras around town from records residents contribute, so anyone can see what ' +
    'is watching which intersection.',
  version: '1.0.0',
  tags: ['civic', 'map'],
  entry: 'index.html',
  icon: 'icon.svg',
  display: { surface: 'full', height: 'auto' },
  permissions: {
    identity: 'handle',
    read: ['flock_camera'],
    write: ['flock_camera'],
    network: ['tile.openstreetmap.org'],
    storage: false,
    device: [],
  },
  defines: [
    {
      type: 'flock_camera',
      label: 'Flock camera',
      schema: {
        lat: { type: 'number', required: true },
        lng: { type: 'number', required: true },
        note: { type: 'string', maxLength: 500 },
      },
    },
  ],
})

/** Proof the example is not aspirational. Asserted in tests, not at import. */
export function exampleManifestParses(): boolean {
  return manifestSchema.safeParse(EXAMPLE_MANIFEST).success
}

/** Exported so the review UI and the tests can compile the same CSP. */
export { compileCsp }
