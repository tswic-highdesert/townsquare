/**
 * `storage.*` — per creation, per user, private to both.
 *
 * The smallest capability in the SDK and the first one builders ask for after
 * identity. Everything here is scoped by the act token's claims, so an app can
 * only ever reach its own rows for the person currently using it.
 */

export * from './limits.js'
export * from './store.js'
export * from './service.js'
