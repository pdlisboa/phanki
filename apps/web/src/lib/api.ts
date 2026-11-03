import { getSettings, setSettings } from './settings'
import { isNative } from './platform'

export class AuthError extends Error {}

export function serverUrl(): string {
  const s = getSettings().serverUrl.trim().replace(/\/+$/, '')
  if (s) return s
  return isNative ? '' : window.location.origin
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = serverUrl()
  if (!base) throw new Error('Configure a URL do servidor nas configurações')
  const headers = new Headers(init.headers)
  const { token } = getSettings()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json')
  const res = await fetch(base + path, { ...init, headers })
  if (res.status === 401) {
    if (token) setSettings({ token: '' })
    const body = await res.json().catch(() => ({}))
    throw new AuthError(body.error ?? 'Sessão expirada')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Erro ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function login(url: string, email: string, password: string) {
  const prev = getSettings()
  const normalized = url.trim().replace(/\/+$/, '')
  // Switching servers invalidates the pull cursor.
  if (normalized !== prev.serverUrl) setSettings({ serverUrl: normalized, cursor: 0 })
  const { token } = await api<{ token: string }>('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  setSettings({ token })
}

export async function fetchMedia(name: string): Promise<Blob> {
  const res = await fetch(`${serverUrl()}/api/media/${encodeURIComponent(name)}`, {
    headers: { Authorization: `Bearer ${getSettings().token}` },
  })
  if (!res.ok) throw new Error(`media ${res.status}`)
  return res.blob()
}
