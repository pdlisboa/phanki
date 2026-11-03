import type { Notetype } from './types'

/**
 * Minimal Anki template renderer: {{Field}}, {{FrontSide}}, {{#F}}…{{/F}}, {{^F}}…{{/F}},
 * filters (text:, cloze:, type:, hint:, tts …:) and {{Tags}}/{{Deck}}.
 */

const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\[sound:[^\]]+\]/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cloze numbers (1-based) present in a text, sorted. */
export function clozeNumbers(text: string): number[] {
  const set = new Set<number>()
  for (const m of text.matchAll(CLOZE_RE)) set.add(Number(m[1]))
  return [...set].sort((a, b) => a - b)
}

export function renderCloze(text: string, ord: number, side: 'q' | 'a'): string {
  return text.replace(CLOZE_RE, (_all, n: string, answer: string, hint?: string) => {
    if (Number(n) !== ord) return answer
    if (side === 'a') return `<span class="cloze">${answer}</span>`
    return `<span class="cloze">[${hint ?? '...'}]</span>`
  })
}

interface Ctx {
  values: Map<string, string>
  ord: number
  side: 'q' | 'a'
  frontSide: string
}

function applyFilters(name: string, ctx: Ctx): string {
  const parts = name.split(':')
  const field = parts.pop()!.trim()
  if (field === 'FrontSide') return ctx.frontSide
  let value = ctx.values.get(field) ?? ''
  for (const raw of parts.reverse()) {
    const filter = raw.trim()
    if (filter === 'text') value = stripHtml(value)
    else if (filter === 'cloze') value = renderCloze(value, ctx.ord, ctx.side)
    else if (filter === 'type') value = ''
    else if (filter === 'hint') value = value ? `<details class="hint"><summary>Hint</summary>${value}</details>` : ''
    else if (filter.startsWith('tts')) value = `<span data-tts="${encodeURIComponent(stripHtml(value))}"></span>`
  }
  return value
}

function renderSections(tpl: string, ctx: Ctx): string {
  // Conditional sections, innermost-first by repeating until stable.
  const SECTION = /\{\{([#^])\s*([^}]+?)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/
  let out = tpl
  for (let i = 0; i < 50; i++) {
    const m = SECTION.exec(out)
    if (!m) break
    const [all, kind, field, body] = m
    const nonEmpty = stripHtml(ctx.values.get(field) ?? '') !== '' || /<img/i.test(ctx.values.get(field) ?? '')
    const keep = kind === '#' ? nonEmpty : !nonEmpty
    out = out.slice(0, m.index) + (keep ? body : '') + out.slice(m.index + all.length)
  }
  return out.replace(/\{\{([^#^/][^}]*?)\}\}/g, (_a, name: string) => applyFilters(name, ctx))
}

export interface RenderInput {
  notetype: Pick<Notetype, 'kind' | 'fields' | 'templates'>
  fields: string[]
  ord: number
  tags?: string[]
  deckName?: string
}

export function renderCard({ notetype, fields, ord, tags = [], deckName = '' }: RenderInput) {
  const values = new Map(notetype.fields.map((f, i) => [f, fields[i] ?? '']))
  values.set('Tags', tags.join(' '))
  values.set('Deck', deckName)
  const tpl = notetype.kind === 'cloze' ? notetype.templates[0] : notetype.templates[ord]
  if (!tpl) return { question: '', answer: '' }
  const clozeOrd = notetype.kind === 'cloze' ? ord + 1 : 0
  const question = renderSections(tpl.qfmt, { values, ord: clozeOrd, side: 'q', frontSide: '' })
  const answer = renderSections(tpl.afmt, { values, ord: clozeOrd, side: 'a', frontSide: question })
  return { question, answer }
}

/** Which card ords a note should have, following Anki's "front not empty" rule. */
export function cardOrds(notetype: Pick<Notetype, 'kind' | 'fields' | 'templates'>, fields: string[]): number[] {
  if (notetype.kind === 'cloze') {
    const nums = new Set<number>()
    notetype.fields.forEach((_f, i) => clozeNumbers(fields[i] ?? '').forEach((n) => nums.add(n)))
    return [...nums].sort((a, b) => a - b).map((n) => n - 1)
  }
  const ords: number[] = []
  const empty = notetype.fields.map(() => '')
  notetype.templates.forEach((_t, ord) => {
    const q = renderCard({ notetype, fields, ord }).question
    const blank = renderCard({ notetype, fields: empty, ord }).question
    if (stripHtml(q) !== stripHtml(blank) || (/<img/i.test(q) && !/<img/i.test(blank))) ords.push(ord)
  })
  return ords.length ? ords : [0]
}
