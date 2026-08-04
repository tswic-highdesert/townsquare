/**
 * The seed cohort: the first verified residents.
 *
 * Vouching is a closure — only a verified resident can vouch — so somebody has
 * to be verified without one, and this is that somebody. It runs from a
 * configured list at boot rather than from an endpoint, because "who is a
 * resident by fiat" is a deployment decision and should be visible in the
 * deployment, not reachable over HTTP.
 *
 * Idempotent. Re-running promotes an existing account rather than failing or
 * creating a second one, so the list can be edited and the process restarted
 * without anyone thinking about migrations.
 */

import { normalizeEmail, normalizeHandle } from './handles.js'
import type { IdentityStore, User } from './store.js'

export interface SeedEntry {
  handle: string
  email: string
  role?: User['role']
}

export interface SeedOutcome {
  handle: string
  action: 'created' | 'promoted' | 'unchanged' | 'skipped'
  reason?: string
}

/**
 * Seeded accounts arrive with `email_confirmed` already true.
 *
 * They are entered by hand by an operator who knows the person, so requiring
 * them to click a link to prove an address the operator just typed adds a step
 * and proves nothing new.
 */
export async function seedCohort(
  store: IdentityStore,
  entries: readonly SeedEntry[],
  now: number,
): Promise<SeedOutcome[]> {
  const outcomes: SeedOutcome[] = []

  for (const entry of entries) {
    const handle = normalizeHandle(entry.handle)
    const email = normalizeEmail(entry.email)
    if (!handle.ok) {
      outcomes.push({ handle: entry.handle, action: 'skipped', reason: handle.message })
      continue
    }
    if (!email.ok) {
      outcomes.push({ handle: entry.handle, action: 'skipped', reason: email.message })
      continue
    }

    const existing =
      (await store.userByHandle(handle.handle)) ?? (await store.userByEmail(email.email))

    if (!existing) {
      const created = await store.createUser(
        { handle: handle.handle, email: email.email, emailConfirmed: true, role: entry.role },
        now,
      )
      await store.updateUser(
        created.id,
        { verifiedResident: true, verifiedMethod: 'manual', verifiedAt: now },
        now,
      )
      outcomes.push({ handle: handle.handle, action: 'created' })
      continue
    }

    const needsWork =
      !existing.verifiedResident ||
      !existing.emailConfirmed ||
      (entry.role !== undefined && existing.role !== entry.role)

    if (!needsWork) {
      outcomes.push({ handle: existing.handle, action: 'unchanged' })
      continue
    }

    await store.updateUser(
      existing.id,
      {
        emailConfirmed: true,
        verifiedResident: true,
        // Do not overwrite a vouch that already happened. How someone became a
        // resident is history, and rewriting it would break the chain a
        // moderator walks.
        verifiedMethod: existing.verifiedMethod ?? 'manual',
        verifiedAt: existing.verifiedAt ?? now,
        ...(entry.role === undefined ? {} : { role: entry.role }),
      },
      now,
    )
    outcomes.push({ handle: existing.handle, action: 'promoted' })
  }

  return outcomes
}

/**
 * Parse the seed list from an environment variable.
 *
 * `handle:email` pairs, comma or newline separated, with an optional `:role`.
 * A config file would be tidier and would also be a file of real email
 * addresses sitting in the repository, which this format avoids by living in
 * the environment where the rest of the deployment's secrets already are.
 */
export function parseSeedList(raw: string | undefined): SeedEntry[] {
  if (!raw?.trim()) return []
  return raw
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [handle, email, role] = line.split(':').map((p) => p.trim())
      if (!handle || !email) return []
      const entry: SeedEntry = { handle, email }
      if (role === 'admin' || role === 'moderator' || role === 'user') entry.role = role
      return [entry]
    })
}
