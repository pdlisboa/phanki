import { useSyncExternalStore } from 'react'
import { TABLES, shouldApply, type SyncRecord, type SyncResponse, type TableName } from '@phanki/shared'
import { db, setWriteListener, table } from './db'
import { api, AuthError } from './api'
import { getSettings, setSettings } from './settings'

export type SyncState = { status: 'idle' | 'syncing' | 'error' | 'offline'; lastSync?: number; error?: string; pending: number }

let state: SyncState = { status: 'idle', pending: 0 }
const listeners = new Set<() => void>()
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function useSyncState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

const BATCH = 2000

async function collectDirty(): Promise<SyncRecord[]> {
  const out: SyncRecord[] = []
  for (const name of TABLES) {
    if (out.length >= BATCH) break
    const rows = await table(name).where('dirty').equals(1).limit(BATCH - out.length).toArray()
    for (const { dirty: _d, ...data } of rows) out.push({ table: name, data: data as SyncRecord['data'] })
  }
  return out
}

async function countDirty() {
  let n = 0
  for (const name of TABLES) n += await table(name).where('dirty').equals(1).count()
  return n
}

async function applyResponse(pushed: SyncRecord[], res: SyncResponse) {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    // Acknowledge pushed rows that were not edited again while the request was in flight.
    for (const { table: name, data } of pushed) {
      const local = await table(name).get(data.id)
      if (local && local.updatedAt === data.updatedAt) await table(name).update(data.id, { dirty: 0 } as never)
    }
    const byTable = new Map<TableName, SyncRecord['data'][]>()
    for (const c of res.changes) byTable.set(c.table, [...(byTable.get(c.table) ?? []), c.data])
    for (const [name, rows] of byTable) {
      const existing = await table(name).bulkGet(rows.map((r) => r.id))
      const accepted = rows.filter((r, i) => shouldApply(name, existing[i], r)).map((r) => ({ ...r, dirty: 0 as const }))
      if (accepted.length) await table(name).bulkPut(accepted as never[])
    }
  })
  setSettings({ cursor: res.cursor })
}

let running: Promise<void> | null = null
let again = false

export function sync(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        await runOnce()
      } while (again)
    } finally {
      running = null
    }
  })()
  return running
}

async function runOnce() {
  if (!getSettings().token) return
  if (!navigator.onLine) {
    setState({ status: 'offline', pending: await countDirty() })
    return
  }
  setState({ status: 'syncing' })
  try {
    for (let guard = 0; guard < 1000; guard++) {
      const pushed = await collectDirty()
      const res = await api<SyncResponse>('/api/sync', { method: 'POST', body: JSON.stringify({ cursor: getSettings().cursor, changes: pushed }) })
      await applyResponse(pushed, res)
      if (!res.more && pushed.length < BATCH) break
    }
    setState({ status: 'idle', lastSync: Date.now(), error: undefined, pending: await countDirty() })
  } catch (e) {
    if (e instanceof AuthError) setState({ status: 'error', error: 'Faça login novamente' })
    else setState({ status: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : String(e), pending: await countDirty() })
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
/** Debounced sync after local edits. */
export function scheduleSync(delay = 8000) {
  clearTimeout(timer)
  timer = setTimeout(() => void sync(), delay)
}

export function startSyncLoop() {
  setWriteListener(() => {
    setState({ pending: state.pending + 1 })
    scheduleSync()
  })
  window.addEventListener('online', () => void sync())
  window.addEventListener('offline', () => setState({ status: 'offline' }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync()
    else if (state.pending) void sync()
  })
  setInterval(() => void sync(), 5 * 60_000)
  void sync()
}

/** Re-download everything from the server (local unsynced edits are still pushed first). */
export async function fullResync() {
  setSettings({ cursor: 0 })
  await sync()
}
