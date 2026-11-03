import type { Notetype } from './types'

export const BASIC_ID = 'nt-basic'
export const REVERSED_ID = 'nt-basic-reversed'
export const CLOZE_ID = 'nt-cloze'

const css = '.card { text-align: center; }'

/** Built-in notetypes. Fixed ids so every device creates the same rows. */
export const BUILTIN_NOTETYPES: Omit<Notetype, 'updatedAt'>[] = [
  {
    id: BASIC_ID,
    name: 'Basic',
    kind: 'normal',
    fields: ['Front', 'Back'],
    templates: [{ name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' }],
    css,
    ttsField: 0,
  },
  {
    id: REVERSED_ID,
    name: 'Basic (and reversed card)',
    kind: 'normal',
    fields: ['Front', 'Back'],
    templates: [
      { name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' },
      { name: 'Card 2', qfmt: '{{Back}}', afmt: '{{FrontSide}}<hr id=answer>{{Front}}' },
    ],
    css,
    ttsField: 0,
  },
  {
    id: CLOZE_ID,
    name: 'Cloze',
    kind: 'cloze',
    fields: ['Text', 'Back Extra'],
    templates: [{ name: 'Cloze', qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>{{Back Extra}}' }],
    css,
    ttsField: 0,
  },
]
