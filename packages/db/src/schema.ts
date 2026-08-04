/**
 * The whole schema, in one migration.
 *
 * `records` and `record_versions` are here even though write-back does not ship
 * for a while, because retrofitting version history onto a live table is
 * miserable and so is retrofitting `origin_key`. Everything version-shaped is
 * shaped correctly from the first row.
 *
 * Carried over from v1: `towns`, `content_items` and `source_health`, including
 * the composite `(town_id, tsp_id)` key and the stale-never-delete convention.
 * Dropped from v1: `profiles`, `rsvps`, `notification_prefs`, `push_tokens`.
 * `profiles` stored `real_name`, which the identity design forbids, and the rest
 * hung off it.
 */

import {
  pgTable,
  text,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  integer,
  uuid,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'bytea',
})

// ── ingested town content (from v1) ─────────────────────────────────────────

export const towns = pgTable('towns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  state: text('state').notNull(),
  centerLat: doublePrecision('center_lat'),
  centerLng: doublePrecision('center_lng'),
  timezone: text('timezone').notNull().default('America/Chicago'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const contentItems = pgTable(
  'content_items',
  {
    townId: text('town_id').notNull(),
    tspId: text('tsp_id').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    source: text('source').notNull(),
    republishRule: text('republish_rule').notNull(),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    community: text('community').notNull(),
    geo: jsonb('geo').$type<Record<string, unknown> | null>(),
    canonicalUrl: text('canonical_url'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    location: text('location'),
    isAllDay: boolean('is_all_day'),
    recurrence: text('recurrence'),
    cost: text('cost'),
    severity: text('severity'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    isActive: boolean('is_active'),
    category: text('category'),
    address: text('address'),
    phone: text('phone'),
    website: text('website'),
    hours: text('hours'),
    author: text('author'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    imageUrl: text('image_url'),
    raw: jsonb('raw').$type<unknown>().notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    /** 'active' | 'stale'. Never deleted, so attached state cannot orphan. */
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.townId, t.tspId] }),
    // v1 declared no indexes at all; these are the three shapes the read API
    // actually queries by.
    byTypeIdx: index('content_items_town_type_idx').on(t.townId, t.type, t.status),
    byStartsIdx: index('content_items_town_starts_idx').on(t.townId, t.startsAt),
    bySeenIdx: index('content_items_town_seen_idx').on(t.townId, t.lastSeenAt),
  }),
)

export const sourceHealth = pgTable(
  'source_health',
  {
    townId: text('town_id').notNull(),
    source: text('source').notNull(),
    itemCount: integer('item_count').notNull().default(0),
    status: text('status').notNull().default('ok'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.townId, t.source] }) }),
)

// ── identity ────────────────────────────────────────────────────────────────

/**
 * Deliberately thin. No real name, no address, no phone. The verification
 * *result* is stored and the evidence never is, which is what keeps this table
 * from becoming something worth stealing or subpoenaing.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Public, pseudonymous. Verified does not mean publicly identified. */
    handle: text('handle').notNull(),
    /** Private. Used to sign in and to reach someone about a report. */
    email: text('email').notNull(),
    emailConfirmed: boolean('email_confirmed').notNull().default(false),
    /** 'user' | 'moderator' | 'admin'. A role, not an owner account. */
    role: text('role').notNull().default('user'),

    verifiedResident: boolean('verified_resident').notNull().default(false),
    /** 'vouch' | 'postcard' | 'manual'. Never the evidence itself. */
    verifiedMethod: text('verified_method'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),

    /** null means use the global default. */
    vouchBudgetOverride: integer('vouch_budget_override'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Case-insensitive: "TSwic" beside "tswic" is an impersonation hole, and a
    // town is exactly the setting where that would work.
    handleUq: uniqueIndex('users_handle_lower_uq').on(sql`lower(${t.handle})`),
    emailUq: uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
  }),
)

/**
 * Vouch chains are admin-visible, never public: they are a social graph, and
 * publishing one invites exactly the pressure that makes people stop vouching.
 *
 * Revoking does not cascade. It flags the branch for review, because a bad
 * actor's vouches are usually mostly legitimate and auto-nuking them costs the
 * town more than it saves.
 */
export const vouches = pgTable(
  'vouches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    voucherId: uuid('voucher_id').notNull(),
    voucheeId: uuid('vouchee_id').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by'),
  },
  (t) => ({
    pairUq: uniqueIndex('vouches_pair_uq').on(t.voucherId, t.voucheeId),
    // The rolling-window budget query: vouches I issued recently that still stand.
    voucherIdx: index('vouches_voucher_idx').on(t.voucherId, t.createdAt),
    voucheeIdx: index('vouches_vouchee_idx').on(t.voucheeId),
  }),
)

/**
 * Browser sessions, one row per sign-in.
 *
 * The row holds a hash, never the cookie value, for the same reason `api_keys`
 * does: a database dump should not be a set of working credentials. Sessions
 * are rows rather than a self-contained signed cookie because sign-out has to
 * mean something — a stateless token cannot be withdrawn, and "sign me out
 * everywhere" is the one account control a pseudonymous user actually has.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    hashUq: uniqueIndex('sessions_hash_uq').on(t.tokenHash),
    userIdx: index('sessions_user_idx').on(t.userId, t.expiresAt),
  }),
)

/**
 * One-time email challenges. The whole of authentication.
 *
 * There is no password column anywhere in this schema, on purpose. A password
 * is a secret this project would then be responsible for, and the account it
 * protects holds a handle and an email — proving control of the email is
 * exactly as strong as a password reset, which is the real floor of any
 * email-recoverable account.
 *
 * `purpose` distinguishes the first confirmation from later sign-ins, because
 * only the first one flips `email_confirmed` and the difference is worth
 * being able to audit.
 */
export const authChallenges = pgTable(
  'auth_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    /** 'confirm' | 'signin' */
    purpose: text('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Set on use. A challenge is single-use even before it expires. */
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    /** Wrong-token attempts against this challenge. Lock out, do not extend. */
    attempts: integer('attempts').notNull().default(0),
  },
  (t) => ({
    hashUq: uniqueIndex('auth_challenges_hash_uq').on(t.tokenHash),
    userIdx: index('auth_challenges_user_idx').on(t.userId, t.expiresAt),
  }),
)

/**
 * Act tokens are signed and stateless, so this table is the exception list
 * rather than the token store: a `jti` lands here only when something has to
 * be cut off inside its fifteen-minute life, which in practice means a
 * creation was blocked or a session was signed out mid-run.
 *
 * Rows are deletable once `expires_at` passes, because after that the
 * signature check rejects the token anyway.
 */
export const actTokenRevocations = pgTable(
  'act_token_revocations',
  {
    jti: text('jti').primaryKey(),
    reason: text('reason').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({ expiryIdx: index('act_token_revocations_expiry_idx').on(t.expiresAt) }),
)

// ── creations ───────────────────────────────────────────────────────────────

export const creations = pgTable(
  'creations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    townId: text('town_id').notNull(),
    ownerId: uuid('owner_id').notNull(),

    /**
     * Immutable, allocated once, never reused even after deletion. Origins are
     * keyed on this rather than the slug: if they were keyed on the slug,
     * renaming a creation and letting someone else take the freed slug would
     * hand them the previous app's localStorage.
     */
    originKey: text('origin_key').notNull(),

    /** Platform-assigned from the name. Never self-asserted in a manifest. */
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    tagline: text('tagline').notNull().default(''),
    description: text('description').notNull().default(''),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),

    /** 'embedded' (the flagship) | 'linked' (just a URL, the escape hatch). */
    kind: text('kind').notNull().default('embedded'),
    /** Only meaningful when kind = 'linked'. */
    url: text('url'),

    /** 'active' | 'hidden' | 'blocked'. Never hard deleted. */
    status: text('status').notNull().default('active'),

    /** The approved version residents actually run. */
    activeVersionId: uuid('active_version_id'),

    /** Source is public by default so residents can fork each other's work. */
    sourceVisibility: text('source_visibility').notNull().default('public'),
    forkedFromId: uuid('forked_from_id'),

    /** Liveness ping, for `kind = 'linked'`. A gallery of dead links is the
     * main way this gets embarrassing. */
    lastSeenOk: timestamp('last_seen_ok', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    originUq: uniqueIndex('creations_origin_key_uq').on(t.originKey),
    slugUq: uniqueIndex('creations_town_slug_uq').on(t.townId, t.slug),
    townIdx: index('creations_town_status_idx').on(t.townId, t.status),
    ownerIdx: index('creations_owner_idx').on(t.ownerId),
  }),
)

/**
 * Every submitted version, approved or not.
 *
 * Updates are reviewed, not just first submissions. The classic marketplace
 * attack is to publish something innocuous, get approved, build an audience,
 * then push a malicious update, so an unreviewed version never becomes active.
 */
export const creationVersions = pgTable(
  'creation_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creationId: uuid('creation_id').notNull(),
    version: text('version').notNull(),
    manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull(),

    /**
     * Compiled from the manifest at publish time and frozen here, then served
     * verbatim. Never recomputed per request: a human approved this exact
     * string, and a mutable input to a reviewed security decision is not a
     * security decision.
     */
    cspHeader: text('csp_header').notNull(),

    bundleSha256: text('bundle_sha256').notNull(),
    byteSize: integer('byte_size').notNull().default(0),
    fileCount: integer('file_count').notNull().default(0),

    /** 'draft' | 'submitted' | 'approved' | 'rejected' | 'superseded' */
    status: text('status').notNull().default('draft'),
    validationReport: jsonb('validation_report').$type<Record<string, unknown> | null>(),

    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNotes: text('review_notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    versionUq: uniqueIndex('creation_versions_uq').on(t.creationId, t.version),
    statusIdx: index('creation_versions_status_idx').on(t.status, t.submittedAt),
  }),
)

/**
 * Content-addressed blob storage, in Postgres rather than an object store.
 *
 * Dedupes across every version and every creation, which matters more than it
 * sounds: vendoring means the same map library ships inside dozens of bundles.
 */
export const creationBlobs = pgTable('creation_blobs', {
  sha256: text('sha256').primaryKey(),
  bytes: bytea('bytes').notNull(),
  byteSize: integer('byte_size').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** The file table a request path resolves against. No filesystem is involved. */
export const creationFiles = pgTable(
  'creation_files',
  {
    versionId: uuid('version_id').notNull(),
    path: text('path').notNull(),
    sha256: text('sha256').notNull(),
    byteSize: integer('byte_size').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.versionId, t.path] }) }),
)

/** Staging area between `create_bundle_upload` and `finalize_bundle`. */
export const creationBundles = pgTable(
  'creation_bundles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    townId: text('town_id').notNull(),
    /** 'staged' | 'uploaded' | 'finalized' | 'expired' */
    status: text('status').notNull().default('staged'),
    manifest: jsonb('manifest').$type<Record<string, unknown> | null>(),
    /** Declared path + sha inventory. The audit primitive: an uploaded file
     * absent from this list is a rejection, which is what makes "everything
     * vendored" enforceable rather than aspirational. */
    inventory: jsonb('inventory').$type<Array<{ path: string; sha256: string; bytes: number }>>(),
    validationReport: jsonb('validation_report').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({ userIdx: index('creation_bundles_user_idx').on(t.userId, t.status) }),
)

// ── shared town records (write-back) ────────────────────────────────────────

/**
 * Types are town-wide and the definer holds no claim. Ownership of a shared
 * fact is a strange thing to assert, and a claim would let an abandoned
 * creation hold a town's data hostage.
 */
export const recordTypes = pgTable(
  'record_types',
  {
    townId: text('town_id').notNull(),
    type: text('type').notNull(),
    label: text('label').notNull(),
    schema: jsonb('schema').$type<Record<string, unknown>>().notNull(),
    definedByCreationId: uuid('defined_by_creation_id'),
    definedByVersionId: uuid('defined_by_version_id'),
    writeOpen: boolean('write_open').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.townId, t.type] }) }),
)

export const records = pgTable(
  'records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    townId: text('town_id').notNull(),
    type: text('type').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    currentVersion: integer('current_version').notNull().default(1),
    /** 'active' | 'stale' | 'hidden'. There is no delete. */
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    typeIdx: index('records_town_type_idx').on(t.townId, t.type, t.status),
    updatedIdx: index('records_town_type_updated_idx').on(t.townId, t.type, t.updatedAt),
  }),
)

/**
 * Full immutable history. Revert is a forward operation: it writes a new
 * version copying an old one and sets `reverted_from`, so nothing is ever
 * destroyed. That is the mechanism that makes light-touch moderation viable,
 * because undoing a bad edit costs one click and loses nothing.
 *
 * Dual attribution is the other half: both the acting user and the creation
 * they used are recorded, so a misbehaving creation can be cut off without
 * punishing the residents who used it.
 */
export const recordVersions = pgTable(
  'record_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recordId: uuid('record_id').notNull(),
    version: integer('version').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    authorUserId: uuid('author_user_id'),
    authorCreationId: uuid('author_creation_id'),
    revertedFrom: integer('reverted_from'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    versionUq: uniqueIndex('record_versions_uq').on(t.recordId, t.version),
    authorIdx: index('record_versions_author_idx').on(t.authorUserId),
    creationIdx: index('record_versions_creation_idx').on(t.authorCreationId),
  }),
)

/** Per creation, per user. Preferences, not data. Quota enforced in code. */
export const creationStorage = pgTable(
  'creation_storage',
  {
    creationId: uuid('creation_id').notNull(),
    userId: uuid('user_id').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').$type<unknown>().notNull(),
    byteSize: integer('byte_size').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.creationId, t.userId, t.key] }) }),
)

// ── moderation ──────────────────────────────────────────────────────────────

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    townId: text('town_id').notNull(),
    /** Must be a verified resident. */
    reporterId: uuid('reporter_id').notNull(),
    /** 'creation' | 'record' | 'user' */
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason').notNull(),
    detail: text('detail'),
    /** 'upheld' | 'dismissed' | 'reverted' */
    resolution: text('resolution'),
    resolvedBy: uuid('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    openIdx: index('reports_open_idx').on(t.townId, t.resolvedAt),
    targetIdx: index('reports_target_idx').on(t.targetType, t.targetId),
  }),
)

// ── credentials ─────────────────────────────────────────────────────────────

/**
 * MCP tokens and, later, OAuth grants, in one table distinguished by `kind`, so
 * the resolver has exactly one code path. Only the hash is stored; the prefix is
 * non-secret and is the only fragment ever logged.
 */
export const mcpTokens = pgTable(
  'mcp_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    /** 'pat' | 'oauth_access' | 'oauth_refresh' */
    kind: text('kind').notNull().default('pat'),
    tokenHash: text('token_hash').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    label: text('label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    hashUq: uniqueIndex('mcp_tokens_hash_uq').on(t.tokenHash),
    userIdx: index('mcp_tokens_user_idx').on(t.userId),
  }),
)

/** API keys serve `kind='linked'` creations and external integrations only.
 * An embedded creation never holds one: it reads through the bridge under the
 * acting user's session, and handing a credential to sandboxed untrusted code
 * is the one thing the security model forbids. */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creationId: uuid('creation_id').notNull(),
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({ hashUq: uniqueIndex('api_keys_hash_uq').on(t.keyHash) }),
)

// ── row types ───────────────────────────────────────────────────────────────

export type TownRow = typeof towns.$inferSelect
export type NewTown = typeof towns.$inferInsert
export type ContentItemRow = typeof contentItems.$inferSelect
export type NewContentItem = typeof contentItems.$inferInsert
export type UserRow = typeof users.$inferSelect
export type VouchRow = typeof vouches.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type AuthChallengeRow = typeof authChallenges.$inferSelect
export type CreationRow = typeof creations.$inferSelect
export type CreationVersionRow = typeof creationVersions.$inferSelect
export type RecordRow = typeof records.$inferSelect
export type RecordVersionRow = typeof recordVersions.$inferSelect
export type ReportRow = typeof reports.$inferSelect
export type McpTokenRow = typeof mcpTokens.$inferSelect
