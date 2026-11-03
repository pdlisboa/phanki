import 'fake-indexeddb/auto'
import { afterEach, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { setSettings } from '@/lib/settings'

beforeEach(async () => {
  await db.delete()
  await db.open()
  setSettings({ serverUrl: 'http://phanki.test', token: '', cursor: 0, autoplay: 'question', ttsRate: 0.9, theme: 'system' })
})

afterEach(() => {
  localStorage.clear()
})

// jsdom has no object URLs
let blobId = 0
URL.createObjectURL ??= () => `blob:http://phanki.test/${++blobId}`
