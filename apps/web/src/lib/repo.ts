import { CardState, DEFAULT_DECK_CONFIG, cardOrds, type Card, type Deck, type DeckConfig, type Note, type Notetype } from '@phanki/shared'
import { alive, db, save } from './db'

export function deckConfig(deck: Deck | undefined): DeckConfig {
  return { ...DEFAULT_DECK_CONFIG, ...deck?.config }
}

/** The deck and every subdeck ("Parent::Child") below it. */
export function subtreeIds(decks: Deck[], root: Deck): string[] {
  return decks.filter((d) => d.id === root.id || d.name.startsWith(root.name + '::')).map((d) => d.id)
}

export async function liveDecks(): Promise<Deck[]> {
  return (await db.decks.toArray()).filter(alive).sort((a, b) => a.name.localeCompare(b.name))
}

export async function createDeck(name: string): Promise<Deck> {
  const clean = name.split('::').map((p) => p.trim()).filter(Boolean).join('::')
  const existing = (await liveDecks()).find((d) => d.name === clean)
  if (existing) return existing
  const deck: Deck = { id: crypto.randomUUID(), name: clean, updatedAt: 0 }
  await save('decks', [deck])
  // Make sure the parents exist so the tree renders.
  const parts = clean.split('::')
  if (parts.length > 1) await createDeck(parts.slice(0, -1).join('::'))
  return deck
}

export async function renameDeck(deck: Deck, name: string) {
  const all = await liveDecks()
  const prefix = deck.name + '::'
  const updates = all
    .filter((d) => d.id === deck.id || d.name.startsWith(prefix))
    .map((d) => ({ ...d, name: d.id === deck.id ? name : name + '::' + d.name.slice(prefix.length) }))
  await save('decks', updates)
}

export async function updateDeckConfig(deck: Deck, config: Partial<DeckConfig>) {
  await save('decks', [{ ...deck, config: { ...deck.config, ...config } }])
}

export async function deleteDeck(deck: Deck) {
  const all = await liveDecks()
  const ids = subtreeIds(all, deck)
  const notes = (await db.notes.where('deckId').anyOf(ids).toArray()).filter(alive)
  const cards = (await db.cards.where('deckId').anyOf(ids).toArray()).filter(alive)
  await save('cards', cards.map((c) => ({ ...c, deleted: 1 as const })))
  await save('notes', notes.map((n) => ({ ...n, deleted: 1 as const })))
  await save('decks', all.filter((d) => ids.includes(d.id)).map((d) => ({ ...d, deleted: 1 as const })))
}

function newCard(note: Note, ord: number, now: number): Card {
  return {
    id: crypto.randomUUID(),
    noteId: note.id,
    deckId: note.deckId,
    ord,
    // New cards are introduced in creation order.
    due: now + ord,
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    updatedAt: 0,
  }
}

export async function addNote(input: { deckId: string; notetype: Notetype; fields: string[]; tags: string[] }) {
  const note: Note = { id: crypto.randomUUID(), notetypeId: input.notetype.id, deckId: input.deckId, fields: input.fields, tags: input.tags, updatedAt: 0 }
  const now = Date.now()
  const cards = cardOrds(input.notetype, input.fields).map((ord) => newCard(note, ord, now))
  await db.transaction('rw', db.notes, db.cards, async () => {
    await save('notes', [note])
    await save('cards', cards)
  })
  return note
}

/** Save note edits and add/remove cards so they match the note's fields. */
export async function updateNote(note: Note, notetype: Notetype) {
  const existing = (await db.cards.where('noteId').equals(note.id).toArray()).filter(alive)
  const wanted = new Set(cardOrds(notetype, note.fields))
  const now = Date.now()
  const added = [...wanted].filter((ord) => !existing.some((c) => c.ord === ord)).map((ord) => newCard(note, ord, now))
  const removed = existing.filter((c) => !wanted.has(c.ord)).map((c) => ({ ...c, deleted: 1 as const }))
  const moved = existing.filter((c) => wanted.has(c.ord) && c.deckId !== note.deckId).map((c) => ({ ...c, deckId: note.deckId }))
  await db.transaction('rw', db.notes, db.cards, async () => {
    await save('notes', [note])
    await save('cards', [...added, ...removed, ...moved])
  })
}

export async function deleteNote(noteId: string) {
  const note = await db.notes.get(noteId)
  if (!note) return
  const cards = await db.cards.where('noteId').equals(noteId).toArray()
  await db.transaction('rw', db.notes, db.cards, async () => {
    await save('cards', cards.map((c) => ({ ...c, deleted: 1 as const })))
    await save('notes', [{ ...note, deleted: 1 }])
  })
}

export async function setSuspended(cardIds: string[], suspended: boolean) {
  const cards = (await db.cards.bulkGet(cardIds)).filter(alive)
  await save('cards', cards.map((c) => ({ ...c, suspended: suspended ? (1 as const) : (0 as const) })))
}
