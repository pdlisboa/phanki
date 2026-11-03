import Dexie, { type EntityTable } from 'dexie'
import { BUILTIN_NOTETYPES, type Card, type Deck, type Note, type Notetype, type Revlog, type TableName, type TableMap } from '@phanki/shared'

/** Local rows carry a dirty flag until the server has acknowledged them. */
export type Local<T> = T & { dirty?: 0 | 1 }

export interface MediaBlob {
  name: string
  blob: Blob
}

class PhankiDB extends Dexie {
  decks!: EntityTable<Local<Deck>, 'id'>
  notetypes!: EntityTable<Local<Notetype>, 'id'>
  notes!: EntityTable<Local<Note>, 'id'>
  cards!: EntityTable<Local<Card>, 'id'>
  revlogs!: EntityTable<Local<Revlog>, 'id'>
  media!: EntityTable<MediaBlob, 'name'>

  constructor() {
    super('phanki')
    this.version(1).stores({
      decks: 'id, name, dirty',
      notetypes: 'id, dirty',
      notes: 'id, deckId, notetypeId, dirty, updatedAt',
      cards: 'id, noteId, deckId, due, state, dirty',
      revlogs: 'id, cardId, deckId, review, dirty',
      media: 'name',
    })
  }
}

export const db = new PhankiDB()

export function table<T extends TableName>(name: T) {
  return db.table(name) as unknown as EntityTable<Local<TableMap[T]>, 'id'>
}

let onWrite: (() => void) | undefined
export function setWriteListener(fn: () => void) {
  onWrite = fn
}

/** Save rows as local changes: bumps updatedAt and marks them for sync. */
export async function save<T extends TableName>(name: T, rows: TableMap[T][]) {
  const now = Date.now()
  await table(name).bulkPut(rows.map((r) => ({ ...r, updatedAt: Math.max(now, r.updatedAt + 1), dirty: 1 as const })))
  onWrite?.()
}

export async function ensureBuiltins() {
  const existing = await db.notetypes.bulkGet(BUILTIN_NOTETYPES.map((n) => n.id))
  const missing = BUILTIN_NOTETYPES.filter((_n, i) => !existing[i])
  // updatedAt 0 and not dirty: the server's copy always wins.
  if (missing.length) await db.notetypes.bulkPut(missing.map((n) => ({ ...n, updatedAt: 0 })))
  // Same id on every device, so first syncs converge instead of duplicating.
  if ((await db.decks.count()) === 0) await db.decks.put({ id: 'deck-default', name: 'Default', updatedAt: 0, dirty: 1 })
}

export function alive<T extends { deleted?: 0 | 1 }>(row: T | undefined): row is T {
  return !!row && !row.deleted
}
