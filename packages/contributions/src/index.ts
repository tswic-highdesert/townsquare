/**
 * Contribution: how a resident adds to the town's own record.
 *
 * Everything Town Square shows today was scraped. Residents can read it and
 * they can build sandboxed apps on it, but they cannot put anything into the
 * record itself, which means the town's information is only ever as good as
 * whoever last updated a website. This package is the other direction.
 *
 * The thing that makes it survivable in a town with one moderator who has a day
 * job is not moderation, it is **versioning**. A record you can fix cheaply
 * does not need to be policed expensively: because a version is never
 * destroyed, a correction from a stranger is low stakes, so corrections can be
 * open to any verified resident rather than to owners only; because a revert is
 * a forward write, undoing a call costs one more write and can therefore be
 * done promptly and described kindly; because attribution is dual, a creation
 * writing on somebody's behalf can be cut off without deleting the work of the
 * residents who used it.
 *
 * Read `policy.ts` first. It is the publish-gate matrix, it is the whole
 * moderation policy for contributions, and it is one table on purpose.
 */

export * from './errors.js'
export * from './model.js'
export * from './policy.js'
export * from './content.js'
export * from './when.js'
export * from './rate.js'
export * from './drafts.js'
export * from './service.js'
export * from './memory.js'
