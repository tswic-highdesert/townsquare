import { randomUUID } from 'node:crypto'
import type { SaveStore, Save, SaveKind, NewSave } from '@townsquare/saves'
import { LocalDatabase, SqliteMap } from './database.js'

export class SqliteSaveStore implements SaveStore {
  private readonly rows: SqliteMap<Save[]>
  constructor(database: LocalDatabase) { this.rows = new SqliteMap(database, 'saves') }

  /** Built here and nowhere else, so a scoping mistake has one place to live. */
  private key(townId: string, userId: string): string {
    return `${townId} ${userId}`
  }

  async list(townId: string, userId: string): Promise<Save[]> {
    const mine = this.rows.get(this.key(townId, userId)) ?? []
    return [...mine].sort((a, b) => b.savedAt - a.savedAt).map((s) => ({ ...s }))
  }

  async find(
    townId: string,
    userId: string,
    kind: SaveKind,
    refId: string,
  ): Promise<Save | null> {
    const mine = this.rows.get(this.key(townId, userId)) ?? []
    const found = mine.find((s) => s.kind === kind && s.refId === refId)
    return found ? { ...found } : null
  }

  async count(townId: string, userId: string): Promise<number> {
    return (this.rows.get(this.key(townId, userId)) ?? []).length
  }

  async create(input: NewSave, now: number): Promise<Save> {
    const key = this.key(input.townId, input.userId)
    const mine = this.rows.get(key) ?? []
    const existing = mine.find((row) => row.kind === input.kind && row.refId === input.refId)
    if (existing) return { ...existing }
    const save: Save = { id: randomUUID(), ...input, savedAt: now }
    mine.push(save)
    this.rows.set(key, mine)
    return { ...save }
  }

  async remove(
    townId: string,
    userId: string,
    kind: SaveKind,
    refId: string,
  ): Promise<boolean> {
    const key = this.key(townId, userId)
    const mine = this.rows.get(key) ?? []
    const at = mine.findIndex((s) => s.kind === kind && s.refId === refId)
    if (at === -1) return false
    mine.splice(at, 1)
    this.rows.set(key, mine)
    return true
  }
}
