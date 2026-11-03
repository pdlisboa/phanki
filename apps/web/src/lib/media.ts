import { useEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import { db } from './db'
import { fetchMedia } from './api'

const urls = new Map<string, string>()

async function mediaUrl(name: string): Promise<string | undefined> {
  const hit = urls.get(name)
  if (hit) return hit
  let row = await db.media.get(name)
  if (!row) {
    try {
      row = { name, blob: await fetchMedia(name) }
      await db.media.put(row)
    } catch {
      return undefined
    }
  }
  const url = URL.createObjectURL(row.blob)
  urls.set(name, url)
  return url
}

const SOUND_RE = /\[sound:([^\]]+)\]/g
const SRC_RE = /<img[^>]+src=["']([^"']+)["']/gi

function isLocal(src: string) {
  return !/^(https?:|data:|blob:)/i.test(src)
}

/** Names of [sound:] files referenced by an HTML fragment. */
export function soundsIn(html: string): string[] {
  return [...html.matchAll(SOUND_RE)].map((m) => m[1])
}

/**
 * Sanitizes card HTML and swaps local media references for cached blob URLs
 * (fetched from the server once and kept in IndexedDB for offline use).
 */
export function useCardHtml(html: string): string {
  const [out, setOut] = useState('')
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let result = html.replace(SOUND_RE, (_m, name: string) => `<button type="button" class="sound-btn" data-sound="${encodeURIComponent(name)}">🔊</button>`)
      const names = [...new Set([...result.matchAll(SRC_RE)].map((m) => m[1]).filter(isLocal))]
      for (const name of names) {
        const url = await mediaUrl(decodeURIComponent(name))
        if (url) result = result.split(`"${name}"`).join(`"${url}"`).split(`'${name}'`).join(`'${url}'`)
      }
      const clean = DOMPurify.sanitize(result, { ADD_ATTR: ['data-sound', 'data-tts'], ALLOWED_URI_REGEXP: /^(?:https?:|blob:|data:image\/)/i })
      if (!cancelled) setOut(clean)
    })()
    return () => {
      cancelled = true
    }
  }, [html])
  return out
}

let audio: HTMLAudioElement | undefined
export async function playSound(name: string) {
  const url = await mediaUrl(name)
  if (!url) return
  audio?.pause()
  audio = new Audio(url)
  await audio.play().catch(() => {})
}
