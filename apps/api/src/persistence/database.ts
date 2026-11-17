import { createRequire } from 'node:module'
import type { DatabaseSync as DatabaseType } from 'node:sqlite'
// Vite 5 (used by Vitest 2) predates node:sqlite's built-in module registry.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
import { mkdirSync, chmodSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'

/** Refuse an ephemeral database in deployments instead of silently losing accounts. */
export function databasePathForEnvironment(env: NodeJS.ProcessEnv = process.env): string {
  const production = env['NODE_ENV'] === 'production' || env['SHELL_ORIGIN']?.startsWith('https://')
  const path = env['TOWNSQUARE_DB_PATH']
  if (production && (!path || !isAbsolute(path) || path === '/tmp' || path.startsWith('/tmp/'))) {
    throw new Error('Production requires an absolute TOWNSQUARE_DB_PATH on a persistent volume, outside /tmp')
  }
  return path ?? '/tmp/townsquare-data/residents.sqlite'
}

/** One API replica owns this database on a persistent Railway volume. */
export class LocalDatabase {
  readonly db: DatabaseType

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path)
    if (path !== ':memory:') chmodSync(path, 0o600)
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS town_square_rows (
        namespace TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
        PRIMARY KEY (namespace, key)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS town_square_handle_unique
        ON town_square_rows (lower(json_extract(value, '$.handle')))
        WHERE namespace = 'identity.users';
      CREATE UNIQUE INDEX IF NOT EXISTS town_square_email_unique
        ON town_square_rows (lower(json_extract(value, '$.email')))
        WHERE namespace = 'identity.users';
    `)
  }

  /** Callback must be synchronous: no transaction remains open across an await. */
  transaction<T>(write: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = write()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  close(): void { this.db.close() }
}

/** Synchronous row storage; each read returns a fresh value, never a shared object. */
export class SqliteMap<T> {
  constructor(private readonly database: LocalDatabase, private readonly namespace: string) {}

  get(key: string): T | undefined {
    const row = this.database.db.prepare('SELECT value FROM town_square_rows WHERE namespace=? AND key=?')
      .get(this.namespace, key) as { value: string } | undefined
    return row ? JSON.parse(row.value) as T : undefined
  }

  set(key: string, value: T): this {
    this.database.db.prepare('INSERT INTO town_square_rows(namespace,key,value) VALUES(?,?,?) ON CONFLICT(namespace,key) DO UPDATE SET value=excluded.value')
      .run(this.namespace, key, JSON.stringify(value))
    return this
  }

  has(key: string): boolean { return this.get(key) !== undefined }
  delete(key: string): boolean {
    return this.database.db.prepare('DELETE FROM town_square_rows WHERE namespace=? AND key=?').run(this.namespace, key).changes > 0
  }
  *entries(): Generator<[string, T]> {
    const rows = this.database.db.prepare('SELECT key,value FROM town_square_rows WHERE namespace=? ORDER BY rowid')
      .all(this.namespace) as Array<{ key: string; value: string }>
    for (const row of rows) yield [row.key, JSON.parse(row.value) as T]
  }
  *values(): Generator<T> { for (const [, value] of this.entries()) yield value }
  [Symbol.iterator](): Generator<[string, T]> { return this.entries() }
}
