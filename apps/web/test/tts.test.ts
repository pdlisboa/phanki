import { describe, expect, it, vi, beforeEach } from 'vitest'

const native = { speak: vi.fn(() => Promise.resolve()), stop: vi.fn(() => Promise.resolve()) }
vi.mock('@capacitor-community/text-to-speech', () => ({ TextToSpeech: native }))

const spoken: any[] = []
const synth = {
  speak: vi.fn((u: any) => spoken.push(u)),
  cancel: vi.fn(),
  getVoices: vi.fn(() => [
    { lang: 'pt-BR', name: 'Luciana' },
    { lang: 'en-GB', name: 'Daniel' },
  ]),
  onvoiceschanged: null as null | (() => void),
}

beforeEach(() => {
  vi.resetModules()
  spoken.length = 0
  vi.clearAllMocks()
})

describe('tts on the web', () => {
  it('speaks English with the configured rate and an English voice', async () => {
    vi.stubGlobal('speechSynthesis', synth)
    vi.stubGlobal('SpeechSynthesisUtterance', function (this: any, text: string) {
      this.text = text
    })
    const { speak, stopSpeaking } = await import('@/lib/tts')
    const { setSettings } = await import('@/lib/settings')
    setSettings({ ttsRate: 1.2 })
    await speak('  hello  ')
    await speak('   ')
    expect(spoken).toHaveLength(1)
    expect(spoken[0]).toMatchObject({ text: 'hello', lang: 'en-US', rate: 1.2, voice: { name: 'Daniel' } })
    synth.onvoiceschanged?.()
    stopSpeaking()
    expect(synth.cancel).toHaveBeenCalled()
    expect(native.speak).not.toHaveBeenCalled()
  })

  it('is a no-op without speech synthesis', async () => {
    vi.stubGlobal('speechSynthesis', undefined)
    const { speak, stopSpeaking } = await import('@/lib/tts')
    await speak('hello')
    stopSpeaking()
    expect(spoken).toHaveLength(0)
  })
})

describe('tts on Android', () => {
  it('uses the native engine', async () => {
    vi.doMock('@/lib/platform', () => ({ isNative: true }))
    const { speak, stopSpeaking } = await import('@/lib/tts')
    await speak('hello')
    stopSpeaking()
    expect(native.stop).toHaveBeenCalledTimes(2)
    expect(native.speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello', lang: 'en-US', category: 'playback' }))
    vi.doUnmock('@/lib/platform')
  })

  it('needs an explicit server url on Android', async () => {
    vi.doMock('@/lib/platform', () => ({ isNative: true }))
    const { api, serverUrl } = await import('@/lib/api')
    const { setSettings } = await import('@/lib/settings')
    setSettings({ serverUrl: '' })
    expect(serverUrl()).toBe('')
    await expect(api('/api/health')).rejects.toThrow(/URL do servidor/)
    vi.doUnmock('@/lib/platform')
  })
})

describe('settings storage', () => {
  it('survives corrupt or unavailable localStorage', async () => {
    localStorage.setItem('phanki.settings', '{not json')
    const { getSettings, setSettings } = await import('@/lib/settings')
    expect(getSettings().autoplay).toBe('question')
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    setSettings({ theme: 'light' })
    expect(getSettings().theme).toBe('light')
    spy.mockRestore()
  })
})
