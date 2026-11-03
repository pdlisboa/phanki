import { afterAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openDb } from '../src/db'
import { createApp } from '../src/app'

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phanki-app-'))
const webDir = path.join(dataDir, 'web')
fs.mkdirSync(path.join(webDir, 'assets'), { recursive: true })
fs.writeFileSync(path.join(webDir, 'index.html'), '<html>phanki-index</html>')
fs.writeFileSync(path.join(webDir, 'assets', 'app.js'), 'console.log(1)')
afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }))

const app = createApp({ db: openDb(dataDir), dataDir, webDir, email: 'Me@Test.com', password: 'pw', jwtSecret: 'y'.repeat(32) })
const login = (password: string, ip = '1.1.1.1', email = 'me@test.com') =>
  app.request('/api/login', { method: 'POST', headers: { 'x-forwarded-for': ip }, body: JSON.stringify({ email, password }) })
const auth = async () => ({ Authorization: `Bearer ${((await (await login('pw', '9.9.9.9')).json()) as any).token}` })

describe('app', () => {
  it('serves the SPA and static assets but 404s unknown api routes', async () => {
    expect(await (await app.request('/decks/123')).text()).toContain('phanki-index')
    expect(await (await app.request('/assets/app.js')).text()).toContain('console.log')
    expect((await app.request('/api/nope')).status).toBe(404)
    expect(await (await app.request('/api/health')).json()).toEqual({ ok: true })
  })

  it('emails are case-insensitive and bad JSON is a failed login', async () => {
    expect((await login('pw', '2.2.2.2', ' ME@test.COM ')).status).toBe(200)
    expect((await app.request('/api/login', { method: 'POST', body: 'not json' })).status).toBe(401)
  })

  it('locks an IP out after 10 failures, then lets it in again after the window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      for (let i = 0; i < 10; i++) expect((await login('wrong', '3.3.3.3')).status).toBe(401)
      expect((await login('pw', '3.3.3.3')).status).toBe(401)
      expect((await login('pw', '4.4.4.4')).status).toBe(200)
      vi.setSystemTime(Date.now() + 16 * 60_000)
      expect((await login('pw', '3.3.3.3')).status).toBe(200)
    } finally {
      vi.useRealTimers()
    }
  })

  it('validates sync payloads', async () => {
    const headers = await auth()
    const bad = await app.request('/api/sync', { method: 'POST', headers, body: JSON.stringify({ cursor: -1, changes: [] }) })
    expect(bad.status).toBe(400)
    const unknown = await app.request('/api/sync', { method: 'POST', headers, body: JSON.stringify({ cursor: 0, changes: [{ table: 'users', data: { id: 'x', updatedAt: 1 } }] }) })
    expect(unknown.status).toBe(400)
    expect((await app.request('/api/sync', { method: 'POST', headers, body: 'garbage' })).status).toBe(400)
  })

  it('paginates large pulls', async () => {
    const headers = await auth()
    const changes = Array.from({ length: 5000 }, (_x, i) => ({ table: 'notes', data: { id: `n${i}`, updatedAt: 1 } }))
    await app.request('/api/sync', { method: 'POST', headers, body: JSON.stringify({ cursor: 0, changes }) })
    await app.request('/api/sync', { method: 'POST', headers, body: JSON.stringify({ cursor: 0, changes: [{ table: 'notes', data: { id: 'last', updatedAt: 1 } }] }) })
    const page1 = (await (await app.request('/api/sync', { method: 'POST', headers, body: JSON.stringify({ cursor: 0, changes: [] }) })).json()) as any
    expect(page1.more).toBe(true)
    expect(page1.changes).toHaveLength(5000)
    const page2 = (await (await app.request('/api/sync', { method: 'POST', headers, body: JSON.stringify({ cursor: page1.cursor, changes: [] }) })).json()) as any
    expect(page2.more).toBe(false)
    expect(page2.changes.map((c: any) => c.data.id)).toContain('last')
  })

  it('rejects imports without a file or with a broken one, and unknown media', async () => {
    const headers = await auth()
    const empty = new FormData()
    expect((await app.request('/api/import', { method: 'POST', headers, body: empty })).status).toBe(400)
    const broken = new FormData()
    broken.append('file', new File([new Uint8Array([1, 2, 3])], 'x.apkg'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await app.request('/api/import', { method: 'POST', headers, body: broken })
    expect(res.status).toBe(400)
    expect(((await res.json()) as any).error).toBeTruthy()
    expect((await app.request('/api/media/nothing.png', { headers })).status).toBe(404)
    fs.mkdirSync(path.join(dataDir, 'media'), { recursive: true })
    fs.writeFileSync(path.join(dataDir, 'media', 'blob.xyz'), 'x')
    expect((await app.request('/api/media/blob.xyz', { headers })).headers.get('content-type')).toBe('application/octet-stream')
  })
})
