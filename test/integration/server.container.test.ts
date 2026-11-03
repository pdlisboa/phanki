import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import JSZip from 'jszip'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { StartedTestContainer } from 'testcontainers'
import { loginToken, startPhanki } from './phanki'

let container: StartedTestContainer
let url: () => string
let token: string

beforeAll(async () => {
  ;({ container, url } = await startPhanki())
  token = await loginToken(url())
})
afterAll(() => container?.stop())

const sync = async (cursor: number, changes: unknown[] = []) => {
  const res = await fetch(`${url()}/api/sync`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor, changes }) })
  expect(res.status).toBe(200)
  return (await res.json()) as { cursor: number; more: boolean; changes: { table: string; data: any }[] }
}

async function apkg() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phanki-it-'))
  const file = path.join(dir, 'c.anki2')
  const db = new Database(file)
  db.exec(`
    CREATE TABLE col (crt integer, models text, decks text);
    CREATE TABLE notes (id integer primary key, guid text, mid integer, tags text, flds text);
    CREATE TABLE cards (id integer primary key, nid integer, did integer, odid integer, ord integer, type integer, queue integer, due integer, odue integer, ivl integer, factor integer, reps integer, lapses integer, data text);
    CREATE TABLE revlog (id integer primary key, cid integer, ease integer, ivl integer, time integer, type integer);
  `)
  const models = { 7: { id: 7, name: 'Basic', type: 0, flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }], tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }] } }
  db.prepare('INSERT INTO col VALUES (?, ?, ?)').run(Math.floor(Date.now() / 1000), JSON.stringify(models), JSON.stringify({ 3: { id: 3, name: 'IT::Words' } }))
  db.prepare("INSERT INTO notes VALUES (1, 'it-1', 7, '', ?)").run('apple [sound:apple.mp3]\x1fmaçã')
  db.prepare("INSERT INTO cards VALUES (1, 1, 3, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, '')").run()
  db.close()
  const zip = new JSZip()
  zip.file('collection.anki2', fs.readFileSync(file))
  zip.file('media', JSON.stringify({ 0: 'apple.mp3' }))
  zip.file('0', new Uint8Array([0xff, 0xfb, 0x90]))
  fs.rmSync(dir, { recursive: true, force: true })
  return zip.generateAsync({ type: 'uint8array' })
}

describe('Phanki container', () => {
  it('serves the web app with SPA fallback and the PWA assets', async () => {
    const index = await fetch(`${url()}/study/anything`)
    expect(index.status).toBe(200)
    const html = await index.text()
    expect(html).toContain('<div id="root">')
    const script = html.match(/src="(\/assets\/[^"]+\.js)"/)![1]
    expect((await fetch(url() + script)).headers.get('content-type')).toMatch(/javascript/)
    expect((await fetch(`${url()}/manifest.webmanifest`)).status).toBe(200)
  })

  it('requires authentication', async () => {
    expect((await fetch(`${url()}/api/sync`, { method: 'POST', body: '{}' })).status).toBe(401)
    const bad = await fetch(`${url()}/api/login`, { method: 'POST', body: JSON.stringify({ email: 'it@phanki.test', password: 'x' }) })
    expect(bad.status).toBe(401)
  })

  it('converges two devices with last-write-wins', async () => {
    const start = await sync(0)
    expect(start.changes.filter((c) => c.table === 'notetypes')).toHaveLength(3)
    const a = await sync(start.cursor, [{ table: 'decks', data: { id: 'it-deck', name: 'from A', updatedAt: 1000 } }])
    const b = await sync(start.cursor, [{ table: 'decks', data: { id: 'it-deck', name: 'stale B', updatedAt: 500 } }])
    expect(b.changes.find((c) => c.data.id === 'it-deck')!.data.name).toBe('from A')
    await sync(b.cursor, [{ table: 'decks', data: { id: 'it-deck', name: 'newer B', updatedAt: 2000 } }])
    const a2 = await sync(a.cursor)
    expect(a2.changes.map((c) => c.data.name)).toEqual(['newer B'])
  })

  it('imports an .apkg and serves its media', async () => {
    const form = new FormData()
    form.append('file', new File([(await apkg()) as Uint8Array<ArrayBuffer>], 'it.apkg'))
    const res = await fetch(`${url()}/api/import`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    expect(await res.json()).toMatchObject({ decks: 1, notes: 1, cards: 1, media: 1 })
    const media = await fetch(`${url()}/api/media/apple.mp3`, { headers: { Authorization: `Bearer ${token}` } })
    expect(media.headers.get('content-type')).toBe('audio/mpeg')
    expect(new Uint8Array(await media.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xfb, 0x90]))
  })

  it('keeps data, media and sessions across a container restart', async () => {
    await container.restart()
    const all = await sync(0)
    expect(all.changes.find((c) => c.data.id === 'it-deck')!.data.name).toBe('newer B')
    expect(all.changes.some((c) => c.table === 'cards' && c.data.id === 'anki-c-it-1-0')).toBe(true)
    expect((await fetch(`${url()}/api/media/apple.mp3`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200)
  })

  it('runs as a non-root user and reports healthy', async () => {
    const { output } = await container.exec(['id', '-u'])
    expect(output.trim()).not.toBe('0')
    const { output: health } = await container.exec(['node', '-e', "fetch('http://127.0.0.1:3500/api/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"])
    expect(health).toContain('"ok":true')
  })
})
