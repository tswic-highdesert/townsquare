/**
 * The builder door.
 *
 * A resident points their own AI tool at this service, describes the app they
 * want, and their agent builds it against the real SDK, previews it in the real
 * sandbox, and submits it for review. The generation cost is theirs, which is
 * the whole reason in-app AI generation was cut from launch: Town Square pays
 * nothing per creation, so the number of creations is not a budget line.
 */

export * from './tokens.js'
export * from './drafts.js'
export * from './context.js'
export * from './scaffold.js'
export * from './tools.js'
export * from './handler.js'
export * from './server.js'
export * from './memory.js'
