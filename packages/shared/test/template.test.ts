import { describe, expect, it } from 'vitest'
import { BUILTIN_NOTETYPES, cardOrds, clozeNumbers, renderCard, shouldApply, stripHtml } from '../src'

const [basic, reversed, cloze] = BUILTIN_NOTETYPES

describe('templates', () => {
  it('renders basic front and back', () => {
    const r = renderCard({ notetype: basic, fields: ['dog', 'cachorro'], ord: 0 })
    expect(r.question).toBe('dog')
    expect(r.answer).toBe('dog<hr id=answer>cachorro')
  })

  it('reversed notetype makes two cards, skipping empty fronts', () => {
    expect(cardOrds(reversed, ['dog', 'cachorro'])).toEqual([0, 1])
    expect(cardOrds(reversed, ['dog', ''])).toEqual([0])
    expect(renderCard({ notetype: reversed, fields: ['dog', 'cachorro'], ord: 1 }).question).toBe('cachorro')
  })

  it('cloze hides only the active deletion', () => {
    const text = 'I {{c1::have been}} here {{c2::since::time}} 2020'
    expect(clozeNumbers(text)).toEqual([1, 2])
    expect(cardOrds(cloze, [text, ''])).toEqual([0, 1])
    const q = renderCard({ notetype: cloze, fields: [text, ''], ord: 1 }).question
    expect(stripHtml(q)).toBe('I have been here [time] 2020')
    const a = renderCard({ notetype: cloze, fields: [text, 'extra'], ord: 0 }).answer
    expect(stripHtml(a)).toBe('I have been here since 2020 extra')
  })

  it('supports conditional sections and filters', () => {
    const nt = { kind: 'normal' as const, fields: ['Word', 'Example'], templates: [{ name: 'c', qfmt: '{{Word}}{{#Example}}<i>{{text:Example}}</i>{{/Example}}{{^Example}}none{{/Example}}', afmt: '' }] }
    expect(renderCard({ notetype: nt, fields: ['run', '<b>I run</b>'], ord: 0 }).question).toBe('run<i>I run</i>')
    expect(renderCard({ notetype: nt, fields: ['run', ''], ord: 0 }).question).toBe('runnone')
  })
})

describe('shouldApply', () => {
  it('uses last-write-wins and never replaces revlogs', () => {
    expect(shouldApply('cards', undefined, { id: 'a', updatedAt: 1 })).toBe(true)
    expect(shouldApply('cards', { id: 'a', updatedAt: 5 }, { id: 'a', updatedAt: 4 })).toBe(false)
    expect(shouldApply('cards', { id: 'a', updatedAt: 5 }, { id: 'a', updatedAt: 6 })).toBe(true)
    expect(shouldApply('revlogs', { id: 'r', updatedAt: 5 }, { id: 'r', updatedAt: 9 })).toBe(false)
    expect(shouldApply('revlogs', { id: 'r', updatedAt: 5 }, { id: 'r', updatedAt: 9, deleted: 1 })).toBe(true)
  })
})

describe('template details', () => {
  const nt = (qfmt: string) => ({ kind: 'normal' as const, fields: ['Word'], templates: [{ name: 'c', qfmt, afmt: '{{FrontSide}}!' }] })
  it('handles hint, type, tts, Tags and Deck', () => {
    expect(renderCard({ notetype: nt('{{hint:Word}}'), fields: ['x'], ord: 0 }).question).toContain('<details class="hint">')
    expect(renderCard({ notetype: nt('{{hint:Word}}'), fields: [''], ord: 0 }).question).toBe('')
    expect(renderCard({ notetype: nt('[{{type:Word}}]'), fields: ['x'], ord: 0 }).question).toBe('[]')
    expect(renderCard({ notetype: nt('{{tts en_US:Word}}'), fields: ['<b>hi you</b>'], ord: 0 }).question).toBe('<span data-tts="hi%20you"></span>')
    expect(renderCard({ notetype: nt('{{Tags}}|{{Deck}}|{{Missing}}'), fields: ['x'], ord: 0, tags: ['a', 'b'], deckName: 'D' }).question).toBe('a b|D|')
    expect(renderCard({ notetype: nt('{{Word}}'), fields: ['x'], ord: 3 })).toEqual({ question: '', answer: '' })
  })

  it('counts an image-only field as non-empty', () => {
    const t = nt('{{#Word}}yes{{/Word}}')
    expect(renderCard({ notetype: t, fields: ['<img src="a.png">'], ord: 0 }).question).toBe('yes')
    const img = { kind: 'normal' as const, fields: ['A', 'B'], templates: [{ name: '1', qfmt: '{{A}}', afmt: '' }, { name: '2', qfmt: '{{B}}', afmt: '' }] }
    expect(cardOrds(img, ['', '<img src="x.png">'])).toEqual([1])
    expect(cardOrds(img, ['', ''])).toEqual([0])
  })

  it('strips html and entities', () => {
    expect(stripHtml('a<br>b&nbsp;&amp;&lt;&gt;&quot;&#39; [sound:x.mp3] <i>c</i>')).toBe(`a b &<>"' c`)
  })
})
