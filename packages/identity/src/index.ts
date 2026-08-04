/**
 * Identity for Town Square.
 *
 * A handle, an email, and whether someone is a verified resident. That is the
 * whole model, and everything here exists to keep it that small: no real
 * names, no addresses, no phone numbers, no password to be responsible for,
 * and no evidence of verification retained after the answer is known.
 */

export * from './handles.js'
export * from './tokens.js'
export * from './actToken.js'
export * from './vouch.js'
export * from './providers.js'
export * from './store.js'
export * from './service.js'
export * from './delivery.js'
export * from './seed.js'
