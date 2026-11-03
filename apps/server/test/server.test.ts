import { afterAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import JSZip from 'jszip'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openDb } from '../src/db'
import { createApp } from '../src/app'

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phanki-test-'))
afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }))

const app = createApp({ db: openDb(dataDir), dataDir, email: 'me@test.com', password: 'secret', jwtSecret: 'x'.repeat(32) })

async function token() {
  const res = await app.request('/api/login', { method: 'POST', body: JSON.stringify({ email: 'me@test.com', password: 'secret' }) })
  return ((await res.json()) as { token: string }).token
}

async function syncReq(t: string, cursor: number, changes: unknown[]) {
  const res = await app.request('/api/sync', { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: JSON.stringify({ cursor, changes }) })
  return { status: res.status, body: (await res.json()) as any }
}

/** Builds a legacy-format .apkg (collection.anki2 + JSON media map). */
async function makeApkg() {
  const file = path.join(dataDir, `col-${Math.random()}.anki2`)
  const db = new Database(file)
  db.exec(`
    CREATE TABLE col (id integer primary key, crt integer, models text, decks text);
    CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, tags text, flds text);
    CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, odue integer, odid integer, data text);
    CREATE TABLE revlog (id integer primary key, cid integer, ease integer, ivl integer, lastIvl integer, factor integer, time integer, type integer);
  `)
  const models = { 111: { id: 111, name: 'Vocab', type: 0, css: '', flds: [{ name: 'Word', ord: 0 }, { name: 'Meaning', ord: 1 }], tmpls: [{ name: 'C1', ord: 0, qfmt: '{{Word}}', afmt: '{{Meaning}}' }] } }
  const decks = { 1: { id: 1, name: 'Default' }, 5: { id: 5, name: 'English::Verbs' } }
  const crt = Math.floor(Date.now() / 1000) - 10 * 86400
  db.prepare('INSERT INTO col VALUES (1, ?, ?, ?)').run(crt, JSON.stringify(models), JSON.stringify(decks))
  db.prepare("INSERT INTO notes VALUES (10, 'g1', 111, 0, ' verbs ', ?)").run("run<img src='run.png'>\x1fcorrer")
  db.prepare("INSERT INTO notes VALUES (11, 'g2', 111, 0, '', ?)").run('eat\x1fcomer')
  db.prepare("INSERT INTO cards VALUES (100, 10, 5, 0, 2, 2, 12, 5, 2500, 4, 0, 0, 0, '')").run()
  db.prepare("INSERT INTO cards VALUES (101, 11, 5, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, '')").run()
  db.prepare('INSERT INTO revlog VALUES (?, 100, 3, 5, 1, 2500, 4000, 1)').run(Date.now() - 86400000)
  db.close()
  const zip = new JSZip()
  zip.file('collection.anki2', fs.readFileSync(file))
  zip.file('media', JSON.stringify({ 0: 'run.png' }))
  zip.file('0', new Uint8Array([137, 80, 78, 71]))
  return zip.generateAsync({ type: 'uint8array' })
}

describe('server', () => {
  it('rejects bad credentials and unauthenticated sync', async () => {
    const bad = await app.request('/api/login', { method: 'POST', body: JSON.stringify({ email: 'me@test.com', password: 'nope' }) })
    expect(bad.status).toBe(401)
    expect((await syncReq('bogus', 0, [])).status).toBe(401)
  })

  it('syncs with last-write-wins between two devices', async () => {
    const t = await token()
    const first = await syncReq(t, 0, [])
    expect(first.body.changes.some((c: any) => c.table === 'notetypes')).toBe(true)
    const deck = { id: 'd1', name: 'A', updatedAt: 100 }
    const a = await syncReq(t, first.body.cursor, [{ table: 'decks', data: deck }])
    // Older edit from device B loses
    const b = await syncReq(t, 0, [{ table: 'decks', data: { ...deck, name: 'old', updatedAt: 50 } }])
    expect(b.body.changes.find((c: any) => c.data.id === 'd1').data.name).toBe('A')
    // Newer edit wins and is pulled by A
    await syncReq(t, 0, [{ table: 'decks', data: { ...deck, name: 'B', updatedAt: 200 } }])
    const a2 = await syncReq(t, a.body.cursor, [])
    expect(a2.body.changes.map((c: any) => c.data.name)).toEqual(['B'])
  })

  it('imports an .apkg with scheduling, history and media', async () => {
    const t = await token()
    const form = new FormData()
    form.append('file', new File([(await makeApkg()) as Uint8Array<ArrayBuffer>], 'deck.apkg'))
    const res = await app.request('/api/import', { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: form })
    const result = (await res.json()) as any
    expect(result).toMatchObject({ decks: 1, notes: 2, cards: 2, revlogs: 1, media: 1 })

    const pulled = (await syncReq(t, 0, [])).body.changes as any[]
    const deck = pulled.find((c) => c.table === 'decks' && c.data.name === 'English::Verbs')
    expect(deck).toBeTruthy()
    const review = pulled.find((c) => c.table === 'cards' && c.data.id === 'anki-c-g1-0').data
    expect(review.state).toBe(2)
    expect(review.stability).toBe(5)
    expect(Math.round((review.due - Date.now()) / 86400000)).toBe(2)
    expect(pulled.find((c) => c.table === 'notes' && c.data.id === 'anki-n-g1').data.tags).toEqual(['verbs'])

    const media = await app.request('/api/media/run.png', { headers: { Authorization: `Bearer ${t}` } })
    expect(media.status).toBe(200)
    expect(media.headers.get('content-type')).toBe('image/png')

    // Re-import does not duplicate cards
    const form2 = new FormData()
    form2.append('file', new File([(await makeApkg()) as Uint8Array<ArrayBuffer>], 'deck.apkg'))
    const again = (await (await app.request('/api/import', { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: form2 })).json()) as any
    expect(again).toMatchObject({ decks: 0, cards: 0 })
  })

  it('refuses media path traversal', async () => {
    const t = await token()
    const res = await app.request('/api/media/..%2Fphanki.db', { headers: { Authorization: `Bearer ${t}` } })
    expect(res.status).not.toBe(200)
  })
})
