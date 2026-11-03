import Database from 'better-sqlite3'
import JSZip from 'jszip'
import { decompress } from 'fzstd'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CardState, type Card, type Deck, type Note, type Notetype, type Revlog, type SyncRecord } from '@phanki/shared'
import { protoInt, protoString, readProto } from './proto'
import type { Store } from './db'

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
const DAY = 86_400_000

function maybeZstd(buf: Uint8Array): Uint8Array {
  return ZSTD_MAGIC.every((b, i) => buf[i] === b) ? decompress(buf) : buf
}

export function safeMediaName(name: string): string | null {
  const base = path.basename(name)
  if (!base || base === '.' || base === '..' || base.startsWith('.')) return null
  return base
}

function hasTable(db: Database.Database, name: string) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)
}

interface AnkiNotetype {
  id: string
  name: string
  kind: 'normal' | 'cloze'
  fields: string[]
  templates: { name: string; qfmt: string; afmt: string }[]
  css: string
}

function readNotetypes(db: Database.Database): AnkiNotetype[] {
  if (hasTable(db, 'notetypes')) {
    const nts = db.prepare('SELECT id, name, config FROM notetypes').all() as { id: number; name: string; config: Buffer }[]
    return nts.map((nt) => {
      const cfg = readProto(nt.config)
      const fields = (db.prepare('SELECT name FROM fields WHERE ntid = ? ORDER BY ord').all(nt.id) as { name: string }[]).map((f) => f.name)
      const templates = (db.prepare('SELECT name, config FROM templates WHERE ntid = ? ORDER BY ord').all(nt.id) as { name: string; config: Buffer }[]).map(
        (t) => {
          const tc = readProto(t.config)
          return { name: t.name, qfmt: protoString(tc, 1) ?? '', afmt: protoString(tc, 2) ?? '' }
        },
      )
      return { id: String(nt.id), name: nt.name, kind: protoInt(cfg, 1) === 1 ? 'cloze' : 'normal', fields, templates, css: protoString(cfg, 3) ?? '' }
    })
  }
  const { models } = db.prepare('SELECT models FROM col').get() as { models: string }
  return Object.values(JSON.parse(models) as Record<string, any>).map((m) => ({
    id: String(m.id),
    name: m.name,
    kind: m.type === 1 ? 'cloze' : 'normal',
    fields: (m.flds as any[]).sort((a, b) => a.ord - b.ord).map((f) => f.name),
    templates: (m.tmpls as any[]).sort((a, b) => a.ord - b.ord).map((t) => ({ name: t.name, qfmt: t.qfmt, afmt: t.afmt })),
    css: m.css ?? '',
  }))
}

function readDecks(db: Database.Database): Map<number, string> {
  const map = new Map<number, string>()
  if (hasTable(db, 'decks')) {
    for (const d of db.prepare('SELECT id, name FROM decks').all() as { id: number; name: string }[]) map.set(d.id, d.name.split('\x1f').join('::'))
  } else {
    const { decks } = db.prepare('SELECT decks FROM col').get() as { decks: string }
    for (const d of Object.values(JSON.parse(decks) as Record<string, any>)) map.set(Number(d.id), d.name)
  }
  return map
}

function readMediaMap(zip: JSZip, raw: Uint8Array | undefined): Map<string, string> {
  const map = new Map<string, string>()
  if (!raw) return map
  const buf = maybeZstd(raw)
  const text = new TextDecoder().decode(buf)
  if (text.trimStart().startsWith('{')) {
    for (const [k, v] of Object.entries(JSON.parse(text) as Record<string, string>)) map.set(k, v)
    return map
  }
  // New format: MediaEntries { repeated MediaEntry entries = 1 }, entry name = field 1, index = position
  readProto(buf)
    .filter((f) => f.field === 1 && f.bytes)
    .forEach((f, i) => {
      const name = protoString(readProto(f.bytes!), 1)
      if (name && zip.file(String(i))) map.set(String(i), name)
    })
  return map
}

export interface ImportResult {
  decks: number
  notes: number
  cards: number
  revlogs: number
  media: number
}

export async function importApkg(
  file: Uint8Array,
  opts: { store: Store; mediaDir: string; resetProgress: boolean; now?: number },
): Promise<ImportResult> {
  const now = opts.now ?? Date.now()
  const zip = await JSZip.loadAsync(file)
  const entry = zip.file('collection.anki21b') ?? zip.file('collection.anki21') ?? zip.file('collection.anki2')
  if (!entry) throw new Error('Arquivo .apkg inválido: coleção não encontrada')
  const colBytes = maybeZstd(await entry.async('uint8array'))

  const tmp = path.join(os.tmpdir(), `phanki-import-${crypto.randomUUID()}.db`)
  fs.writeFileSync(tmp, colBytes)
  const db = new Database(tmp, { readonly: true })
  try {
    const { crt } = db.prepare('SELECT crt FROM col').get() as { crt: number }
    const changes: SyncRecord[] = []
    const push = (table: SyncRecord['table'], data: object) => changes.push({ table, data: data as SyncRecord['data'] })

    // Notetypes
    const notetypes = new Map<string, Notetype>()
    for (const nt of readNotetypes(db)) {
      const rec: Notetype = { ...nt, id: `anki-nt-${nt.id}`, ttsField: 0, updatedAt: now }
      notetypes.set(nt.id, rec)
      push('notetypes', rec)
    }

    // Decks: reuse an existing deck with the same name
    const deckIds = new Map<number, string>()
    let deckCount = 0
    const usedDecks = new Set((db.prepare('SELECT DISTINCT CASE WHEN odid != 0 THEN odid ELSE did END AS d FROM cards').all() as { d: number }[]).map((r) => r.d))
    for (const [ankiId, name] of readDecks(db)) {
      if (!usedDecks.has(ankiId)) continue
      const existing = opts.store.findDeckByName(name)
      const id = existing?.id ?? `deck-${crypto.randomUUID()}`
      deckIds.set(ankiId, id)
      if (!existing) {
        push('decks', { id, name, updatedAt: now } satisfies Deck)
        deckCount++
      }
    }

    // Notes
    const noteRows = db.prepare('SELECT id, guid, mid, tags, flds FROM notes').all() as { id: number; guid: string; mid: number; tags: string; flds: string }[]
    const noteIds = new Map<number, string>()
    const cardRows = db.prepare('SELECT id, nid, did, odid, ord, type, queue, due, odue, ivl, factor, reps, lapses, data FROM cards').all() as any[]
    const noteDeck = new Map<number, number>()
    for (const c of cardRows) if (!noteDeck.has(c.nid)) noteDeck.set(c.nid, c.odid || c.did)
    for (const n of noteRows) {
      const nt = notetypes.get(String(n.mid))
      if (!nt) continue
      const id = `anki-n-${n.guid}`
      noteIds.set(n.id, id)
      push('notes', {
        id,
        notetypeId: nt.id,
        deckId: deckIds.get(noteDeck.get(n.id) ?? -1) ?? [...deckIds.values()][0],
        fields: n.flds.split('\x1f'),
        tags: n.tags.trim() ? n.tags.trim().split(/\s+/) : [],
        updatedAt: now,
      } satisfies Note)
    }

    // Cards (never overwrite scheduling of a card already in Phanki)
    const cardIds = new Map<number, { id: string; deckId: string }>()
    let cardCount = 0
    for (const c of cardRows) {
      const noteId = noteIds.get(c.nid)
      const deckId = deckIds.get(c.odid || c.did)
      if (!noteId || !deckId) continue
      const id = `anki-c-${noteId.slice(7)}-${c.ord}`
      cardIds.set(c.id, { id, deckId })
      if (opts.store.get('cards', id)) continue
      push('cards', { ...mapCard(c, crt, now, opts.resetProgress), id, noteId, deckId, ord: c.ord, updatedAt: now } satisfies Card)
      cardCount++
    }

    // Review history (for stats)
    let revCount = 0
    if (!opts.resetProgress) {
      const revs = db.prepare('SELECT id, cid, ease, ivl, time, type FROM revlog WHERE ease BETWEEN 1 AND 4 AND type IN (0,1,2)').all() as any[]
      for (const r of revs) {
        const card = cardIds.get(r.cid)
        if (!card) continue
        push('revlogs', {
          id: `anki-r-${r.id}`,
          cardId: card.id,
          deckId: card.deckId,
          rating: r.ease,
          state: r.type === 0 ? CardState.Learning : r.type === 1 ? CardState.Review : CardState.Relearning,
          review: r.id,
          scheduledDays: Math.max(0, r.ivl),
          stability: 0,
          difficulty: 0,
          duration: r.time,
          updatedAt: now,
        } satisfies Revlog)
        revCount++
      }
    }

    // Media
    fs.mkdirSync(opts.mediaDir, { recursive: true })
    const mediaRaw = await zip.file('media')?.async('uint8array')
    let mediaCount = 0
    for (const [idx, name] of readMediaMap(zip, mediaRaw)) {
      const safe = safeMediaName(name)
      const f = zip.file(idx)
      if (!safe || !f) continue
      fs.writeFileSync(path.join(opts.mediaDir, safe), maybeZstd(await f.async('uint8array')))
      mediaCount++
    }

    for (let i = 0; i < changes.length; i += 2000) opts.store.apply(changes.slice(i, i + 2000))
    return { decks: deckCount, notes: noteIds.size, cards: cardCount, revlogs: revCount, media: mediaCount }
  } finally {
    db.close()
    fs.rmSync(tmp, { force: true })
  }
}

type Sched = Omit<Card, 'id' | 'noteId' | 'deckId' | 'ord' | 'updatedAt'>

/** Convert Anki SM-2 (or FSRS memory, when present) scheduling into an FSRS card state. */
export function mapCard(c: any, crt: number, now: number, reset: boolean): Sched {
  const suspended = c.queue === -1 ? 1 : 0
  const fresh: Sched = { due: now, stability: 0, difficulty: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, state: CardState.New, suspended }
  if (reset || c.type === 0 || c.type === 1) return { ...fresh, reps: reset ? 0 : c.reps }

  let mem: { s?: number; d?: number } = {}
  try {
    mem = c.data ? JSON.parse(c.data) : {}
  } catch {
    // Unreadable card data: fall back to the SM-2 values below.
  }
  const ivl = Math.max(1, c.ivl)
  const dueDay = c.odid ? c.odue : c.due
  const due = c.type === 2 ? (crt + dueDay * 86400) * 1000 : now
  const difficulty = mem.d ?? Math.min(10, Math.max(1, 5 + (2500 - (c.factor || 2500)) / 200))
  return {
    due,
    stability: mem.s ?? ivl,
    difficulty,
    scheduledDays: ivl,
    learningSteps: 0,
    reps: c.reps,
    lapses: c.lapses,
    state: CardState.Review,
    lastReview: due - ivl * DAY,
    suspended,
  }
}
