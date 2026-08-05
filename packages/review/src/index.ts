/**
 * Review: the gate between "a resident built something" and "the town runs it".
 *
 * Publishing is reviewed because a creation runs inside Town Square with
 * whatever it declared, and **updates are reviewed too** — approval is of one
 * exact version, never of a person. That is in tension with the light-touch
 * moderation stance on purpose, so the burden is kept bounded: an automated
 * pass runs first, the reviewer reads source rather than bundles, and an update
 * arrives as a permission diff rather than a block to re-read.
 */

export * from './model.js'
export * from './diff.js'
export * from './service.js'
export * from './memory.js'
