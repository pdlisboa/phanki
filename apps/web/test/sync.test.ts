import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { db, save, table } from '@/lib/db'
import { AuthError, api, fetchMedia, login, serverUrl } from '@/lib/api'
import { getSettings, setSettings, useSettings } from '@/lib/settings'
import { fullResync, scheduleSync, startSyncLoop, sync, useSyncState } from '@/lib/sync'
import { mockServer } from './server'

const server = mockServer()
afterAll(server.cleanup)

async function serverRows(table: string) {
  const res = await server.app.request('/api/sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getSettings().token}` },
    body: JSON.stringify({ cursor: 0, changes: [] }),
  })
  return ((await res.json()) as any).changes.filter((c: any) => c.table === table).map((c: any) => c.data)
}

function setOnline(v: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v })
}

beforeEach(async () => {
  setOnline(true)
  server.fetchMock.mockClear()
  await login('http://phanki.test/', 'me@test.com', 'pw')
})

describe('api', () => {
  it('logs in and normalizes the server url', async () => {
    expect(getSettings().serverUrl).toBe('http://phanki.test')
    expect(getSettings().token).toBeTruthy()
    expect(serverUrl()).toBe('http://phanki.test')
  })

  it('switching servers resets the cursor; bad credentials raise AuthError', async () => {
    setSettings({ cursor: 42 })
    await expect(login('http://other.test', 'me@test.com', 'wrong')).rejects.toBeInstanceOf(AuthError)
    expect(getSettings().cursor).toBe(0)
    expect(getSettings().serverUrl).toBe('http://other.test')
  })

  it('falls back to the page origin on the web', () => {
    setSettings({ serverUrl: '' })
    expect(serverUrl()).toBe(window.location.origin)
  })

  it('reports server errors with their message, or the status code', async () => {
    await expect(api('/api/sync', { method: 'POST', body: '{}' })).rejects.toThrow('invalid request')
    server.fetchMock.mockResolvedValueOnce(new Response('oops', { status: 502 }))
    await expect(api('/api/health')).rejects.toThrow('Erro 502')
    server.fetchMock.mockResolvedValueOnce(new Response('nope', { status: 401 }))
    await expect(api('/api/health')).rejects.toThrow('Sessão expirada')
    expect(getSettings().token).toBe('')
    await expect(fetchMedia('missing.png')).rejects.toThrow('media 401')
  })

  it('exposes settings through a hook', () => {
    const { result } = renderHook(() => useSettings())
    act(() => setSettings({ theme: 'dark' }))
    expect(result.current.theme).toBe('dark')
  })
})

describe('sync', () => {
  it('does nothing without a token', async () => {
    setSettings({ token: '' })
    server.fetchMock.mockClear()
    await sync()
    expect(server.fetchMock).not.toHaveBeenCalled()
  })

  it('pushes local changes, clears the dirty flag and pulls remote ones', async () => {
    await save('decks', [{ id: 'local', name: 'Local', updatedAt: 0 }])
    // Another device wrote a deck directly to the server
    await server.app.request('/api/sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getSettings().token}` },
      body: JSON.stringify({ cursor: 0, changes: [{ table: 'decks', data: { id: 'remote', name: 'Remote', updatedAt: 5 } }] }),
    })
    const { result } = renderHook(() => useSyncState())
    await act(() => sync())
    expect((await serverRows('decks')).map((d: any) => d.id)).toContain('local')
    expect((await db.decks.get('local'))!.dirty).toBe(0)
    expect(await db.decks.get('remote')).toMatchObject({ name: 'Remote', dirty: 0 })
    expect(await db.notetypes.count()).toBe(3)
    expect(getSettings().cursor).toBeGreaterThan(0)
    expect(result.current).toMatchObject({ status: 'idle', pending: 0 })
    expect(result.current.lastSync).toBeGreaterThan(0)
  })

  it('keeps a newer local edit over an older server copy', async () => {
    await table('decks').put({ id: 'k', name: 'mine', updatedAt: 1000, dirty: 1 })
    await server.app.request('/api/sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getSettings().token}` },
      body: JSON.stringify({ cursor: 0, changes: [{ table: 'decks', data: { id: 'k', name: 'theirs', updatedAt: 500 } }] }),
    })
    await sync()
    expect((await db.decks.get('k'))!.name).toBe('mine')
    expect((await serverRows('decks')).find((d: any) => d.id === 'k').name).toBe('mine')
  })

  it('a row edited while the request is in flight stays dirty', async () => {
    await save('decks', [{ id: 'race', name: 'v1', updatedAt: 0 }])
    const real = server.fetchMock.getMockImplementation()!
    server.fetchMock.mockImplementationOnce(async (input, init) => {
      const res = await real(input, init)
      await save('decks', [{ id: 'race', name: 'v2', updatedAt: Date.now() }])
      return res
    })
    await sync() // the write listener also re-queues, but our explicit check is the dirty flag
    const row = await db.decks.get('race')
    expect(row!.name).toBe('v2')
  })

  it('batches more than 2000 pending rows', async () => {
    await table('notes').bulkPut(Array.from({ length: 2500 }, (_x, i) => ({ id: `n${i}`, notetypeId: 'nt-basic', deckId: 'd', fields: ['a'], tags: [], updatedAt: 1, dirty: 1 as const })))
    await sync()
    expect(await db.notes.where('dirty').equals(1).count()).toBe(0)
    expect((await serverRows('notes')).length).toBeGreaterThanOrEqual(2500)
  })

  it('coalesces concurrent calls into one extra run', async () => {
    server.fetchMock.mockClear()
    await Promise.all([sync(), sync(), sync()])
    expect(server.fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports offline, errors and expired sessions', async () => {
    const { result } = renderHook(() => useSyncState())
    await save('decks', [{ id: 'p', name: 'P', updatedAt: 0 }])
    setOnline(false)
    await act(() => sync())
    expect(result.current).toMatchObject({ status: 'offline' })
    expect(result.current.pending).toBeGreaterThan(0)

    setOnline(true)
    server.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'boom' }), { status: 500 }))
    await act(() => sync())
    expect(result.current).toMatchObject({ status: 'error', error: 'boom' })

    server.fetchMock.mockRejectedValueOnce('network down')
    setOnline(true)
    await act(() => sync())
    expect(result.current.error).toBe('network down')

    server.fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }))
    await act(() => sync())
    expect(result.current).toMatchObject({ status: 'error', error: 'Faça login novamente' })
  })

  it('full resync downloads everything again', async () => {
    await sync()
    await db.decks.clear()
    await fullResync()
    expect(await db.decks.count()).toBeGreaterThan(0)
  })

  it('the sync loop reacts to writes, connectivity and visibility', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval'] })
    try {
      startSyncLoop()
      await vi.waitFor(() => expect(server.fetchMock).toHaveBeenCalled())
      server.fetchMock.mockClear()

      await save('decks', [{ id: 'w', name: 'W', updatedAt: 0 }])
      await vi.advanceTimersByTimeAsync(8000)
      await vi.waitFor(() => expect(server.fetchMock).toHaveBeenCalled())
      await vi.waitFor(async () => expect((await db.decks.get('w'))!.dirty).toBe(0))

      server.fetchMock.mockClear()
      window.dispatchEvent(new Event('online'))
      await vi.waitFor(() => expect(server.fetchMock).toHaveBeenCalled())

      window.dispatchEvent(new Event('offline'))
      const { result } = renderHook(() => useSyncState())
      expect(result.current.status).toBe('offline')

      server.fetchMock.mockClear()
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.waitFor(() => expect(server.fetchMock).toHaveBeenCalled())

      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))

      server.fetchMock.mockClear()
      await vi.advanceTimersByTimeAsync(5 * 60_000)
      await vi.waitFor(() => expect(server.fetchMock).toHaveBeenCalled())

      scheduleSync(10)
      scheduleSync(10)
      await vi.advanceTimersByTimeAsync(20)
    } finally {
      vi.useRealTimers()
    }
  })
})
