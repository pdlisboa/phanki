import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { shouldApply, type SyncRecord, type TableName } from '@phanki/shared'

/**
 * The server stores every synced row as JSON in one table. Clients own the schema;
 * the server only orders changes (seq) and applies last-write-wins.
 */
export function openDb(dataDir: string) {
  fs.mkdirSync(dataDir, { recursive: true })
  const db = new Database(path.join(dataDir, 'phanki.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      tbl TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      PRIMARY KEY (tbl, id)
    );
    CREATE INDEX IF NOT EXISTS records_seq ON records(seq);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
  return db
}

export type Db = ReturnType<typeof openDb>

export function createStore(db: Db) {
  const getStmt = db.prepare<[string, string], { data: string }>('SELECT data FROM records WHERE tbl = ? AND id = ?')
  const maxSeqStmt = db.prepare<[], { s: number | null }>('SELECT MAX(seq) AS s FROM records')
  const upsertStmt = db.prepare(
    `INSERT INTO records (tbl, id, data, updated_at, seq) VALUES (@tbl, @id, @data, @updatedAt, @seq)
     ON CONFLICT(tbl, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, seq = excluded.seq`,
  )
  const sinceStmt = db.prepare<[number, number], { tbl: string; data: string; seq: number }>(
    'SELECT tbl, data, seq FROM records WHERE seq > ? ORDER BY seq LIMIT ?',
  )

  let seq = maxSeqStmt.get()?.s ?? 0

  function get<T = Record<string, unknown>>(table: TableName, id: string): T | undefined {
    const row = getStmt.get(table, id)
    return row ? (JSON.parse(row.data) as T) : undefined
  }

  /** Apply changes inside one transaction; returns how many were accepted. */
  const apply = db.transaction((changes: SyncRecord[]) => {
    let accepted = 0
    for (const { table, data } of changes) {
      const existing = get<{ id: string; updatedAt: number; deleted?: 0 | 1 }>(table, data.id)
      if (!shouldApply(table, existing, data)) continue
      upsertStmt.run({ tbl: table, id: data.id, data: JSON.stringify(data), updatedAt: data.updatedAt, seq: ++seq })
      accepted++
    }
    return accepted
  })

  function since(cursor: number, limit: number) {
    const rows = sinceStmt.all(cursor, limit + 1)
    const more = rows.length > limit
    const page = rows.slice(0, limit)
    return {
      changes: page.map((r) => ({ table: r.tbl as TableName, data: JSON.parse(r.data) })),
      cursor: page.length ? page[page.length - 1].seq : cursor,
      more,
    }
  }

  function findDeckByName(name: string) {
    const row = db
      .prepare<[string], { data: string }>(
        `SELECT data FROM records WHERE tbl = 'decks' AND json_extract(data, '$.name') = ? AND coalesce(json_extract(data, '$.deleted'), 0) = 0`,
      )
      .get(name)
    return row ? (JSON.parse(row.data) as { id: string }) : undefined
  }

  return { get, apply, since, findDeckByName }
}

export type Store = ReturnType<typeof createStore>
