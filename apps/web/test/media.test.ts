import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { db } from '@/lib/db'
import { login } from '@/lib/api'
import { playSound, soundsIn, useCardHtml } from '@/lib/media'
import { mockServer } from './server'

const server = mockServer()
afterAll(server.cleanup)
fs.mkdirSync(path.join(server.dataDir, 'media'), { recursive: true })
fs.writeFileSync(path.join(server.dataDir, 'media', 'cat.png'), Buffer.from([137, 80, 78, 71]))
fs.writeFileSync(path.join(server.dataDir, 'media', 'cat.mp3'), Buffer.from([1, 2, 3]))

const play = vi.fn(() => Promise.resolve())
const pause = vi.fn()
vi.stubGlobal('Audio', vi.fn(function (this: any, src: string) {
  this.src = src
  this.play = play
  this.pause = pause
}))

beforeEach(async () => {
  await login('http://phanki.test', 'me@test.com', 'pw')
})

describe('media', () => {
  it('lists sounds', () => {
    expect(soundsIn('a [sound:x.mp3] b [sound:y.ogg]')).toEqual(['x.mp3', 'y.ogg'])
  })

  it('swaps local images for cached blobs, keeps remote ones and sanitizes html', async () => {
    const html = `<img src="cat.png"><img src='missing.png'><img src="https://example.com/a.png">[sound:cat.mp3]<script>alert(1)</script><span data-tts="hi">x</span>`
    const { result } = renderHook(() => useCardHtml(html))
    await waitFor(() => expect(result.current).not.toBe(''))
    expect(result.current).toMatch(/<img src="blob:/)
    expect(result.current).toContain('https://example.com/a.png')
    expect(result.current).toContain('data-sound="cat.mp3"')
    expect(result.current).toContain('data-tts="hi"')
    expect(result.current).not.toContain('<script')
    expect(await db.media.get('cat.png')).toBeTruthy()

    // Second render uses the in-memory URL cache (no network)
    server.fetchMock.mockClear()
    const again = renderHook(() => useCardHtml('<img src="cat.png">'))
    await waitFor(() => expect(again.result.current).toMatch(/blob:/))
    expect(server.fetchMock).not.toHaveBeenCalled()
  })

  it('cancels a stale render', async () => {
    const { result, rerender, unmount } = renderHook(({ h }) => useCardHtml(h), { initialProps: { h: 'one' } })
    rerender({ h: 'two' })
    await waitFor(() => expect(result.current).toBe('two'))
    unmount()
  })

  it('plays sounds from the offline cache and skips unknown files', async () => {
    await playSound('cat.mp3')
    await playSound('cat.mp3')
    expect(play).toHaveBeenCalledTimes(2)
    expect(pause).toHaveBeenCalledTimes(1)
    await playSound('nope.mp3')
    expect(play).toHaveBeenCalledTimes(2)
  })
})
