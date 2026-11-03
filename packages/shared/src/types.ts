/** Every synced row carries these fields. Timestamps are epoch milliseconds. */
export interface SyncFields {
  id: string
  updatedAt: number
  deleted?: 0 | 1
}

export interface DeckConfig {
  newPerDay: number
  reviewsPerDay: number
  /** FSRS desired retention, 0.7–0.99 */
  retention: number
  maxInterval: number
  learningSteps: string[]
  relearningSteps: string[]
}

export const DEFAULT_DECK_CONFIG: DeckConfig = {
  newPerDay: 20,
  reviewsPerDay: 200,
  retention: 0.9,
  maxInterval: 36500,
  learningSteps: ['1m', '10m'],
  relearningSteps: ['10m'],
}

export interface Deck extends SyncFields {
  /** Hierarchy uses Anki's "Parent::Child" convention */
  name: string
  config?: Partial<DeckConfig>
}

export interface Template {
  name: string
  qfmt: string
  afmt: string
}

export interface Notetype extends SyncFields {
  name: string
  kind: 'normal' | 'cloze'
  fields: string[]
  templates: Template[]
  css?: string
  /** Index of the field read aloud by TTS (usually the English word) */
  ttsField?: number
}

export interface Note extends SyncFields {
  notetypeId: string
  deckId: string
  fields: string[]
  tags: string[]
}

/** FSRS states, same numbering as ts-fsrs */
export const CardState = { New: 0, Learning: 1, Review: 2, Relearning: 3 } as const
export type CardState = (typeof CardState)[keyof typeof CardState]

export interface Card extends SyncFields {
  noteId: string
  deckId: string
  /** Template index (normal) or cloze number - 1 (cloze) */
  ord: number
  due: number
  stability: number
  difficulty: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  state: CardState
  lastReview?: number
  suspended?: 0 | 1
}

export interface Revlog extends SyncFields {
  cardId: string
  deckId: string
  /** 1 Again, 2 Hard, 3 Good, 4 Easy */
  rating: 1 | 2 | 3 | 4
  /** Card state before this review */
  state: CardState
  review: number
  scheduledDays: number
  stability: number
  difficulty: number
  /** Milliseconds spent answering */
  duration: number
}

export interface TableMap {
  decks: Deck
  notetypes: Notetype
  notes: Note
  cards: Card
  revlogs: Revlog
}

export type TableName = keyof TableMap
export const TABLES: TableName[] = ['decks', 'notetypes', 'notes', 'cards', 'revlogs']
