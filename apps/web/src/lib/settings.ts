import { useSyncExternalStore } from 'react'

export interface Settings {
  serverUrl: string
  token: string
  /** Last server seq we pulled; tied to serverUrl */
  cursor: number
  autoplay: 'off' | 'question' | 'answer'
  ttsRate: number
  theme: 'system' | 'light' | 'dark'
}

const KEY = 'phanki.settings'
const defaults: Settings = { serverUrl: '', token: '', cursor: 0, autoplay: 'question', ttsRate: 0.9, theme: 'system' }

function load(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return defaults
  }
}

let current = load()
const listeners = new Set<() => void>()

export function getSettings() {
  return current
}

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Storage unavailable (private mode): settings live for this session only.
  }
  listeners.forEach((l) => l())
}

export function useSettings() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
