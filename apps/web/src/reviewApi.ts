/**
 * The shell's side of the review queue.
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
  const res = await fetch(`/api/review/submissions/${id}/decide`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, note }),
  })
  const parsed: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    return (parsed as ApiError | null) ?? { error: 'unavailable', message: 'Something went wrong.' }
  }
  return parsed as DecisionResult
}

export { isError }
