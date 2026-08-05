/**
 * Review: the gate between "a resident built something" and "the town runs it".
 *
 * Publishing is reviewed because a creation runs inside Town Square with
 * whatever it declared, and **updates are reviewed too** — approval is of one
 * exact version, never of a person. That is in tension with the light-touch
 * moderation stance on purpose, so the burden is kept bounded: an automated
 * pass runs first, the reviewer reads source rather than bundles, and an update
 * arrives as a permission diff rather than a block to re-read.
 *
 * `reports` and `moderation` are the other side of the same gate: what happens
 * once something is live and a resident says something about it. Reporting is
 * built to be light and hard to weaponise; the actions on the far side of it are
 * built so that every one of them can be undone by writing forward.
 */

export * from './model.js'
export * from './diff.js'
export * from './service.js'
export * from './reports.js'
export * from './moderation.js'
export * from './memory.js'
