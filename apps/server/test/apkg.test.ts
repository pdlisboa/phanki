import { afterAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import JSZip from 'jszip'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { CardState } from '@phanki/shared'
import { createStore, openDb } from '../src/db'
import { importApkg, mapCard, safeMediaName } from '../src/apkg'
import { protoInt, protoString, readProto } from '../src/proto'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phanki-apkg-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

// Minimal protobuf encoder (varint + length-delimited) for building Anki fixtures.
function varint(n: number): number[] {
  const out: number[] = []
  while (n > 127) {
    out.push((n & 0x7f) | 0x80)
    n = Math.floor(n / 128)
  }
  out.push(n)
  return out
}
function pbInt(field: number, n: number) {
  return [...varint(field * 8), ...varint(n)]
}
function pbBytes(field: number, bytes: Uint8Array | number[] | string) {
  const b = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  return [...varint(field * 8 + 2), ...varint(b.length), ...b]
}
const zstd = (b: Uint8Array) => new Uint8Array(zlib.zstdCompressSync(b))

/** Anki 23.10+ export: zstd-compressed schema-18 collection and protobuf media list. */
function modernCollection() {
  const file = path.join(dir, `modern-${Math.random()}.anki21b`)
  const db = new Database(file)
  db.exec(`
    CREATE TABLE col (id integer primary key, crt integer);
    CREATE TABLE notetypes (id integer primary key, name text, config blob);
    CREATE TABLE fields (ntid integer, ord integer, name text);
    CREATE TABLE templates (ntid integer, ord integer, name text, config blob);
    CREATE TABLE decks (id integer primary key, name text);
    CREATE TABLE notes (id integer primary key, guid text, mid integer, tags text, flds text);
    CREATE TABLE cards (id integer primary key, nid integer, did integer, odid integer, ord integer, type integer, queue integer, due integer, odue integer, ivl integer, factor integer, reps integer, lapses integer, data text);
    CREATE TABLE revlog (id integer primary key, cid integer, ease integer, ivl integer, time integer, type integer);
  `)
  const now = Math.floor(Date.now() / 1000)
  db.prepare('INSERT INTO col VALUES (1, ?)').run(now - 100 * 86400)
  db.prepare('INSERT INTO notetypes VALUES (1, ?, ?)').run('Cloze+', Buffer.from([...pbInt(1, 1), ...pbBytes(3, '.card{}')]))
  db.prepare('INSERT INTO notetypes VALUES (2, ?, ?)').run('Basic', Buffer.from(pbInt(2, 0)))
  db.prepare("INSERT INTO fields VALUES (1, 0, 'Text'), (1, 1, 'Extra'), (2, 0, 'Front'), (2, 1, 'Back')").run()
  db.prepare('INSERT INTO templates VALUES (1, 0, ?, ?)').run('Cloze', Buffer.from([...pbBytes(1, '{{cloze:Text}}'), ...pbBytes(2, '{{cloze:Text}}<br>{{Extra}}')]))
  db.prepare('INSERT INTO templates VALUES (2, 0, ?, ?)').run('Card 1', Buffer.from([...pbBytes(1, '{{Front}}'), ...pbBytes(2, '{{Back}}')]))
  db.prepare('INSERT INTO decks VALUES (1, ?), (2, ?), (3, ?)').run('English\x1fGrammar', 'Filtered', 'Unused')
  db.prepare("INSERT INTO notes VALUES (1, 'cz', 1, '', ?)").run('I {{c1::have}} {{c2::been}}\x1fextra')
  db.prepare("INSERT INTO notes VALUES (2, 'bs', 2, 'a b', ?)").run('hello\x1folá')
  db.prepare("INSERT INTO notes VALUES (3, 'orphan', 99, '', 'x')").run()
  // c1: learning card -> new; c2: review in a filtered deck with FSRS memory; c3: suspended relearning with bad data
  db.prepare("INSERT INTO cards VALUES (10, 1, 1, 0, 0, 1, 1, ?, 0, 0, 2500, 2, 0, '')").run(now)
  db.prepare(`INSERT INTO cards VALUES (11, 1, 2, 1, 1, 2, 2, 0, 105, 20, 2500, 5, 1, '{"s":42.5,"d":6.1}')`).run()
  db.prepare("INSERT INTO cards VALUES (12, 2, 1, 0, 0, 3, -1, 0, 0, 3, 1300, 9, 3, '{bad json')").run()
  db.prepare('INSERT INTO revlog VALUES (1000, 11, 1, -600, 9000, 0), (2000, 12, 2, 3, 1000, 2), (3000, 999, 3, 1, 1, 1)').run()
  db.close()
  return zstd(fs.readFileSync(file))
}

async function modernApkg() {
  const zip = new JSZip()
  zip.file('collection.anki21b', modernCollection())
  zip.file('collection.anki2', new Uint8Array([1, 2, 3])) // legacy stub Anki also includes
  const entries = [pbBytes(1, [...pbBytes(1, 'have.mp3'), ...pbInt(2, 3)]), pbBytes(1, pbBytes(1, '../evil.png')), pbBytes(1, pbBytes(1, 'missing.png'))]
  zip.file('media', zstd(new Uint8Array(entries.flat())))
  zip.file('0', zstd(new Uint8Array([1, 2, 3])))
  zip.file('1', new Uint8Array([9]))
  return zip.generateAsync({ type: 'uint8array' })
}

describe('modern .apkg import', () => {
  it('reads schema-18 notetypes, nested decks, filtered cards and zstd media', async () => {
    const store = createStore(openDb(path.join(dir, `db-${Math.random()}`)))
    const mediaDir = path.join(dir, 'media')
    const now = Date.now()
    const res = await importApkg(await modernApkg(), { store, mediaDir, resetProgress: false, now })
    // The filtered deck is not recreated: its card goes back to its home deck.
    expect(res).toEqual({ decks: 1, notes: 2, cards: 3, revlogs: 2, media: 2 })
    expect(store.findDeckByName('Filtered')).toBeUndefined()

    const nt = store.get<any>('notetypes', 'anki-nt-1')
    expect(nt).toMatchObject({ kind: 'cloze', fields: ['Text', 'Extra'], css: '.card{}' })
    expect(store.findDeckByName('English::Grammar')).toBeTruthy()
    expect(store.findDeckByName('Unused')).toBeUndefined()

    const learning = store.get<any>('cards', 'anki-c-cz-0')
    expect(learning).toMatchObject({ state: CardState.New, reps: 2 })
    const review = store.get<any>('cards', 'anki-c-cz-1')
    expect(review).toMatchObject({ state: CardState.Review, stability: 42.5, difficulty: 6.1, scheduledDays: 20 })
    expect(review.deckId).toBe(store.findDeckByName('English::Grammar')!.id)
    const relearn = store.get<any>('cards', 'anki-c-bs-0')
    expect(relearn).toMatchObject({ state: CardState.Review, suspended: 1, stability: 3, difficulty: 10, due: now })
    expect(store.get<any>('notes', 'anki-n-bs').tags).toEqual(['a', 'b'])
    
    expect(store.get<any>('revlogs', 'anki-r-1000')).toMatchObject({ state: CardState.Learning, rating: 1, scheduledDays: 0 })
    expect(store.get<any>('revlogs', 'anki-r-2000')).toMatchObject({ state: CardState.Relearning })
    expect(fs.readFileSync(path.join(mediaDir, 'have.mp3'))).toEqual(Buffer.from([1, 2, 3]))
    expect(fs.existsSync(path.join(mediaDir, 'evil.png'))).toBe(true)
  })

  it('resetProgress makes everything new and skips history', async () => {
    const store = createStore(openDb(path.join(dir, `db-${Math.random()}`)))
    const res = await importApkg(await modernApkg(), { store, mediaDir: path.join(dir, 'm2'), resetProgress: true })
    expect(res.revlogs).toBe(0)
    expect(store.get<any>('cards', 'anki-c-cz-1')).toMatchObject({ state: CardState.New, reps: 0 })
  })

  it('rejects files without a collection', async () => {
    const zip = new JSZip()
    zip.file('readme.txt', 'nope')
    const store = createStore(openDb(path.join(dir, `db-${Math.random()}`)))
    await expect(importApkg(await zip.generateAsync({ type: 'uint8array' }), { store, mediaDir: dir, resetProgress: false })).rejects.toThrow(/inválido/)
  })
})

describe('helpers', () => {
  it('sanitizes media names', () => {
    expect(safeMediaName('../../etc/passwd')).toBe('passwd')
    expect(safeMediaName('.hidden')).toBeNull()
    expect(safeMediaName('')).toBeNull()
    expect(safeMediaName('a b.mp3')).toBe('a b.mp3')
  })

  it('maps SM-2 ease factor to difficulty', () => {
    const base = { queue: 0, type: 2, due: 1, odue: 0, odid: 0, ivl: 10, reps: 1, lapses: 0, data: '' }
    expect(mapCard({ ...base, factor: 2500 }, 0, 0, false).difficulty).toBe(5)
    expect(mapCard({ ...base, factor: 3500 }, 0, 0, false).difficulty).toBe(1)
    expect(mapCard({ ...base, factor: 0 }, 0, 0, false).difficulty).toBe(5)
  })

  it('reads protobuf fields, skipping fixed-width ones', () => {
    const buf = new Uint8Array([...pbInt(1, 300), 0x11, 1, 2, 3, 4, 5, 6, 7, 8, 0x1d, 1, 2, 3, 4, ...pbBytes(5, 'hi')])
    const fields = readProto(buf)
    expect(protoInt(fields, 1)).toBe(300)
    expect(protoString(fields, 5)).toBe('hi')
    expect(protoString(fields, 9)).toBeUndefined()
    expect(readProto(new Uint8Array([0x0b, 1]))).toEqual([]) // unknown wire type stops parsing
  })
})
