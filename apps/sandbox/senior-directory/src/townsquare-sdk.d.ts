/**
 * Types for the guest runtime, `@townsquare/sdk`.
 *
 * The import resolves only inside Town Square, through the import map the
 * sandbox injects, so there is no package for TypeScript to read. These
 * declarations follow `packages/sdk/runtime/sdk.js` and
 * `packages/sdk/generated/AGENTS.md`; extend them as the app uses more of the
 * SDK. Typed loosely on purpose where the reference does not pin a shape.
 */

declare module '@townsquare/sdk' {
  export type ErrorCode =
    | 'not_verified'
    | 'unauthenticated'
    | 'permission_denied'
    | 'rate_limited'
    | 'not_found'
    | 'invalid_record'
    | 'invalid_request'
    | 'conflict'
    | 'too_large'
    | 'unavailable'

  export class TownSquareError extends Error {
    readonly code: ErrorCode
  }

  export interface TownInfo {
    id: string
    name: string
    timezone: string
  }

  export interface Page<T> {
    items: T[]
    nextCursor?: string | null
  }

  export interface User {
    handle: string
    verified: boolean
  }

  export const app: {
    ready(): void
    setHeight(px: number): void
    setTitle(text: string): void
  }

  export const town: {
    info(): Promise<TownInfo>
    thisWeek(): Promise<{ today: unknown[]; weekend: unknown[]; comingUp: unknown[]; notices: unknown[] }>
    items(opts?: Record<string, unknown>): Promise<Page<unknown>>
    item(id: string): Promise<unknown | null>
    businesses(opts?: Record<string, unknown>): Promise<Page<unknown>>
  }

  export const user: {
    current(): Promise<User | null>
  }

  export const records: {
    list(type: string, opts?: Record<string, unknown>): Promise<Page<unknown>>
    get(type: string, id: string): Promise<unknown | null>
    create(type: string, data: object): Promise<unknown>
    update(type: string, id: string, patch: object): Promise<unknown>
    history(type: string, id: string): Promise<unknown[]>
  }

  export const storage: {
    get(key: string): Promise<unknown>
    set(key: string, value: unknown): Promise<void>
  }
}
