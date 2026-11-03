import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { isNative } from './platform'
import { getSettings } from './settings'

let voice: SpeechSynthesisVoice | undefined

function pickVoice() {
  if (voice || typeof speechSynthesis === 'undefined') return voice
  const voices = speechSynthesis.getVoices()
  voice = voices.find((v) => v.lang === 'en-US' && /natural|google|samantha/i.test(v.name)) ?? voices.find((v) => v.lang.startsWith('en'))
  return voice
}

export async function speak(text: string, lang = 'en-US') {
  const clean = text.trim()
  if (!clean) return
  const rate = getSettings().ttsRate
  if (isNative) {
    await TextToSpeech.stop().catch(() => {})
    await TextToSpeech.speak({ text: clean, lang, rate, category: 'playback' })
    return
  }
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(clean)
  u.lang = lang
  u.rate = rate
  const v = pickVoice()
  if (v) u.voice = v
  speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (isNative) void TextToSpeech.stop().catch(() => {})
  else if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = () => (voice = undefined)
