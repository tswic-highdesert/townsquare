/**
 * The `townsquare.json` contract.
 *
 * This schema is the reviewer's whole job: reading a valid manifest should tell
 * you what a creation can reach without reading a line of its code. Everything
 * is default-deny and must be declared, and the runtime bridge enforces the
 * declaration, so an undeclared capability fails closed no matter what the code
 * says.
 *
 * Authoritative spec: docs `spec-manifest-and-sdk.md`.
 */

import { z } from 'zod'

export const MANIFEST_VERSION = 1
export const SDK_MAJOR = 1

/** Per creation, per user. Small on purpose: this is for preferences, not data. */
export const STORAGE_QUOTA_BYTES = 64 * 1024

/**
 * Reserved so a map app has somewhere to ask later without breaking SDK 1.
 * Must be empty at launch.
 */
export const DEVICE_PERMISSIONS = ['geolocation'] as const

const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
const RECORD_TYPE = /^[a-z][a-z0-9_]{2,39}$/
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

/**
 * A bare hostname. Deliberately strict: no scheme, no port, no path, no
 * wildcard. A declared host is only reviewable if it is unambiguous, and every
 * one of those affordances is a way to smuggle a broader grant past a reviewer.
 *
 * The final label must be alphabetic, which is what rejects a bare IP literal
 * such as `127.0.0.1`. Without that clause an IP parses as a valid hostname and
 * slips past a denylist that only knows the string `localhost`.
 */
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/**
 * Hosts a creation may never declare. Loopback and internal-only suffixes are
 * refused because a creation that can reach them is reaching something the
 * reviewer cannot see, and `.onion` because we will not proxy for it.
 */
const DENIED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.home.arpa',
  '.onion',
  '.test',
  '.invalid',
]
const DENIED_HOSTS = new Set(['localhost', 'metadata.google.internal'])

/** Relative POSIX path inside the bundle. No traversal, no absolute, no dotfiles. */
const bundlePath = z
  .string()
  .min(1)
  .max(255)
  .refine((p) => !p.startsWith('/'), { message: 'must be relative, not absolute' })
  .refine((p) => !p.split('/').includes('..'), { message: 'must not contain ".."' })
  .refine((p) => !p.split('/').some((seg) => seg.startsWith('.')), {
    message: 'must not contain dotfiles',
  })
  .refine((p) => !p.includes('\\'), { message: 'must use POSIX separators' })

const fieldSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'date', 'url']),
  required: z.boolean().optional(),
  maxLength: z.number().int().positive().max(10_000).optional(),
})

/**
 * A record type this creation introduces to the town.
 *
 * Types are town-wide and the definer holds no claim over them: ownership of a
 * shared fact is a strange thing to assert, and a claim would let an abandoned
 * creation hold a town's data hostage. Evolution is additive only, enforced
 * outside this schema where the existing town types are known.
 */
const definesSchema = z.object({
  type: z.string().regex(RECORD_TYPE, 'snake_case, 3 to 40 chars'),
  label: z.string().min(1).max(60),
  schema: z.record(fieldSchema).refine((s) => Object.keys(s).length > 0, {
    message: 'a defined type needs at least one field',
  }),
})

const permissionsSchema = z
  .object({
    /**
     * There is deliberately no level above `handle`. An email or a real name
     * should not be reachable from a creation at all, so the escalation simply
     * does not exist rather than being guarded.
     */
    identity: z.enum(['none', 'handle']).default('none'),

    /**
     * Record types only, and note what is absent: ingested town content
     * (events, notices, businesses) is read through `town.*` and needs no
     * declaration. An earlier draft mixed both namespaces here, which matters
     * because models copy examples.
     */
    read: z.array(z.string().regex(RECORD_TYPE)).max(20).default([]),
    write: z.array(z.string().regex(RECORD_TYPE)).max(10).default([]),

    network: z
      .array(
        z
          .string()
          .regex(HOSTNAME, 'bare https hostname: no scheme, port, path or wildcard')
          .refine((h) => !DENIED_HOSTS.has(h), { message: 'host is not allowed' })
          .refine((h) => !DENIED_HOST_SUFFIXES.some((s) => h.endsWith(s)), {
            message: 'internal and loopback hosts are not allowed',
          }),
      )
      .max(10)
      .default([]),

    storage: z.boolean().default(false),

    device: z
      .array(z.enum(DEVICE_PERMISSIONS))
      .max(0, 'device permissions are reserved and must be empty at launch')
      .default([]),
  })
  .strict()

/**
 * Note `.strict()` on every object. A typo'd `permisions` block must fail loudly
 * rather than silently mean "no permissions", which would look like a
 * well-behaved app to both the validator and the reviewer.
 */
export const manifestSchema = z
  .object({
    manifest_version: z.literal(MANIFEST_VERSION),
    sdk: z.literal(SDK_MAJOR),

    name: z.string().min(1).max(60),
    tagline: z.string().min(1).max(100),
    description: z.string().min(1).max(2000),
    version: z.string().regex(SEMVER, 'semver, e.g. 1.2.0'),
    tags: z.array(z.string().regex(/^[a-z][a-z0-9-]{1,23}$/)).max(5).default([]),

    entry: bundlePath,
    icon: bundlePath,

    display: z
      .object({
        surface: z.enum(['full', 'card']).default('full'),
        height: z.union([z.literal('auto'), z.number().int().min(200).max(4000)]).default('auto'),
      })
      .strict()
      .default({ surface: 'full', height: 'auto' }),

    permissions: permissionsSchema.default({}),

    defines: z.array(definesSchema).max(5).default([]),

    /**
     * Echoed back by the platform on versions after the first. Present so a
     * builder can confirm which creation they are updating; never used as the
     * source of truth.
     */
    slug: z.string().regex(SLUG).optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    // `author` and `id` are impersonation holes wearing different hats: one
    // claims who made it, the other claims which creation it *is*. Both are
    // platform-assigned. A manifest asserting either is an attempt, not a typo,
    // so this is an error rather than a stripped field.
    for (const forbidden of ['author', 'id'] as const) {
      if (forbidden in (m as Record<string, unknown>)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [forbidden],
          message: `\`${forbidden}\` is assigned by the platform and must not appear in the manifest`,
        })
      }
    }

    // Writing a type you neither define nor declare readable is almost always a
    // mistake in generated code, and it is cheap to catch here.
    const defined = new Set(m.defines.map((d) => d.type))
    for (const t of m.permissions.write) {
      if (!defined.has(t) && !m.permissions.read.includes(t)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['permissions', 'write'],
          message: `writes "${t}" but neither defines it nor declares it under read`,
        })
      }
    }

    // A defined type nobody can reach is dead weight in the review.
    for (const d of m.defines) {
      if (!m.permissions.read.includes(d.type) && !m.permissions.write.includes(d.type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['defines'],
          message: `defines "${d.type}" but never reads or writes it`,
        })
      }
    }
  })

export type Manifest = z.infer<typeof manifestSchema>
export type Permissions = Manifest['permissions']
export type Defines = Manifest['defines'][number]

export type ParseResult =
  | { ok: true; manifest: Manifest }
  | { ok: false; issues: Array<{ path: string; message: string }> }

/** Parse without throwing, because every caller wants the issue list. */
export function parseManifest(input: unknown): ParseResult {
  const result = manifestSchema.safeParse(input)
  if (result.success) return { ok: true, manifest: result.data }
  return {
    ok: false,
    issues: result.error.issues.map((i) => ({
      path: i.path.join('.') || '(root)',
      message: i.message,
    })),
  }
}

/**
 * Additive-only evolution against the types a town already has.
 *
 * First definer wins on the original shape. A later creation may add optional
 * fields and may never retype, narrow, or remove an existing one, so an app
 * built against the old shape keeps working. Residents will not maintain their
 * creations, which is exactly why the platform has to guarantee this.
 */
export function checkDefinesCompatible(
  proposed: Defines,
  existing: Defines | undefined,
): Array<{ path: string; message: string }> {
  if (!existing) return []
  const issues: Array<{ path: string; message: string }> = []

  for (const [field, prev] of Object.entries(existing.schema)) {
    const next = proposed.schema[field]
    if (!next) {
      issues.push({
        path: `defines.${proposed.type}.${field}`,
        message: `removes existing field "${field}"; town types are additive only`,
      })
      continue
    }
    if (next.type !== prev.type) {
      issues.push({
        path: `defines.${proposed.type}.${field}`,
        message: `retypes "${field}" from ${prev.type} to ${next.type}; town types are additive only`,
      })
    }
    if (next.required && !prev.required) {
      issues.push({
        path: `defines.${proposed.type}.${field}`,
        message: `makes existing field "${field}" required, which invalidates existing rows`,
      })
    }
    if (prev.maxLength !== undefined && (next.maxLength ?? Infinity) < prev.maxLength) {
      issues.push({
        path: `defines.${proposed.type}.${field}`,
        message: `narrows maxLength on "${field}" from ${prev.maxLength}; existing rows may not fit`,
      })
    }
  }

  // New fields must be optional, or every existing row is instantly invalid.
  for (const [field, next] of Object.entries(proposed.schema)) {
    if (!existing.schema[field] && next.required) {
      issues.push({
        path: `defines.${proposed.type}.${field}`,
        message: `adds required field "${field}"; new fields on an existing type must be optional`,
      })
    }
  }

  return issues
}
