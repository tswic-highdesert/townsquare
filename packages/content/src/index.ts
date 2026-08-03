/**
 * Contracts for ingested town content.
 *
 * Ported from v1's `@rvts/shared`, minus `identity.ts`: that module modelled
 * profiles with a `real_name` field, which the new identity design forbids
 * outright. Nothing here describes a person.
 */
export * from './feed.js'
export * from './content.js'
