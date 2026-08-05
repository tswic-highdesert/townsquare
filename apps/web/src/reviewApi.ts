/**
 * The shell's side of everything a moderator does: the submission queue, the
 * report queue, and the creations that are already live.
 *
 * Same-origin and cookie-carrying, like the rest of `session.ts`. The API
 * answers 404 rather than 403 to a resident who is not on the committee, so
 * these calls simply come back empty for almost everyone, and the screen that
 * uses them is only ever rendered for a moderator anyway.
 */

import { isError, type ApiError } from './session.js'

export interface QueueItem {
  id: string
  handle: string
  name: string
  proposedSlug: string
  version: string
  kind: 'new' | 'update'
  escalates: boolean
  warningCount: number
  fileCount: number
  byteSize: number
  submittedAt: number
}

export interface PermissionChange {
  key: string
  added: string[]
  removed: string[]
}

export interface ManifestDiff {
  escalations: PermissionChange[]
  reductions: PermissionChange[]
  newRecordTypes: string[]
  renamed: { from: string; to: string } | null
  versionFrom: string
  versionTo: string
}

export interface Finding {
  path: string
  code: string
  message: string
}

export interface ReviewDetail {
  submission: {
    id: string
    handle: string
    name: string
    version: string
    proposedSlug: string
    manifest: Record<string, unknown>
    bundleDigest: string
    submittedAt: number
  }
  kind: 'new' | 'update'
  grants: PermissionChange[]
  diff: ManifestDiff | null
  warnings: Finding[]
  files: Array<{ path: string; text: string; bytes: number }>
  omitted: Array<{ path: string; bytes: number; reason: string }>
  live: { slug: string; version: string; originKey: string } | null
}

export interface DecisionResult {
  submission: { id: string; status: string; note: string | null }
  creation: { slug: string; originKey: string } | null
  url: string | null
}

export async function fetchQueue(): Promise<QueueItem[]> {
  const res = await fetch('/api/review/queue', { credentials: 'same-origin' })
  if (!res.ok) return []
  return ((await res.json()) as { items: QueueItem[] }).items
}

export async function fetchSubmission(id: string): Promise<ReviewDetail | ApiError> {
  const res = await fetch(`/api/review/submissions/${id}`, { credentials: 'same-origin' })
  const parsed: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    return (parsed as ApiError | null) ?? { error: 'unavailable', message: 'Could not load that.' }
  }
  return parsed as ReviewDetail
}

export async function decide(
  id: string,
  decision: 'approve' | 'reject' | 'request_changes',
  note: string,
): Promise<DecisionResult | ApiError> {
  return send(`/api/review/submissions/${id}/decide`, { decision, note })
}

// ── reports and live creations ───────────────────────────────────────────────

export interface Report {
  id: string
  reporterHandle: string
  targetId: string
  targetLabel: string
  targetVersion: string | null
  reason: string
  detail: string | null
  resolution: string | null
  resolutionNote: string | null
  resolvedAt: number | null
  createdAt: number
}

export interface ModeratedCreation {
  id: string
  slug: string
  name: string
  status: 'active' | 'hidden' | 'blocked'
  originKey: string
  activeVersion: string | null
  openReports: number
  updatedAt: number
}

export interface ModerationEntry {
  id: string
  action: 'hide' | 'block' | 'restore' | 'revert'
  actorHandle: string
  note: string | null
  createdAt: number
}

export interface ModerationDetail {
  creation: { id: string; slug: string; name: string; status: ModeratedCreation['status'] }
  versions: Array<{
    id: string
    version: string
    status: string
    bundleDigest: string
    revertedFromVersionId: string | null
    createdAt: number
    live: boolean
    revertable: boolean
  }>
  reports: Report[]
  log: ModerationEntry[]
}

export async function fetchReports(): Promise<Report[]> {
  const res = await fetch('/api/review/reports', { credentials: 'same-origin' })
  if (!res.ok) return []
  return ((await res.json()) as { items: Report[] }).items
}

export async function fetchModeratedCreations(): Promise<ModeratedCreation[]> {
  const res = await fetch('/api/review/creations', { credentials: 'same-origin' })
  if (!res.ok) return []
  return ((await res.json()) as { items: ModeratedCreation[] }).items
}

export async function fetchCreationDetail(id: string): Promise<ModerationDetail | ApiError> {
  const res = await fetch(`/api/review/creations/${id}`, { credentials: 'same-origin' })
  const parsed: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    return (parsed as ApiError | null) ?? { error: 'unavailable', message: 'Could not load that.' }
  }
  return parsed as ModerationDetail
}

export function resolveReport(
  id: string,
  resolution: 'upheld' | 'dismissed',
  note: string,
): Promise<Report | ApiError> {
  return send(`/api/review/reports/${id}/resolve`, { resolution, note })
}

export interface ModerationResult {
  creation: ModeratedCreation
  entry: ModerationEntry
  resolvedReports: Report[]
}

export function moderate(
  creationId: string,
  action: 'hide' | 'block' | 'restore' | 'revert',
  note: string,
  versionId?: string,
): Promise<ModerationResult | ApiError> {
  return send(`/api/review/creations/${creationId}/moderate`, {
    action,
    note,
    ...(versionId ? { versionId } : {}),
  })
}

async function send<T>(path: string, body: unknown): Promise<T | ApiError> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const parsed: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    return (parsed as ApiError | null) ?? { error: 'unavailable', message: 'Something went wrong.' }
  }
  return parsed as T
}

export { isError }
