import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { vi } from 'vitest'
import { createApp } from '../../server/src/app'
import { openDb } from '../../server/src/db'

/** Routes the client's fetch calls to an in-process Phanki server. */
export function mockServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phanki-web-'))
  const app = createApp({ db: openDb(dataDir), dataDir, email: 'me@test.com', password: 'pw', jwtSecret: 'z'.repeat(32) })
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    return app.request(url.pathname + url.search, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { app, dataDir, fetchMock, cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true }) }
}
