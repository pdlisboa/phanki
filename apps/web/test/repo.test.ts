import { describe, expect, it, vi } from 'vitest'
import { BASIC_ID, BUILTIN_NOTETYPES, CLOZE_ID, CardState, REVERSED_ID } from '@phanki/shared'
import { alive, db, ensureBuiltins, save, setWriteListener, table } from '@/lib/db'
import { addNote, createDeck, deckConfig, deleteDeck, deleteNote, liveDecks, renameDeck, setSuspended, subtreeIds, updateDeckConfig, updateNote } from '@/lib/repo'
import { cn } from '@/lib/utils'

const nt = (id: string) => BUILTIN_NOTETYPES.find((n) => n.id === id)! as any

describe('db', () => {
  it('creates built-in notetypes and the default deck once', async () => {
    await ensureBuiltins()
    await ensureBuiltins()
    expect(await db.notetypes.count()).toBe(3)
    expect((await db.notetypes.get(BASIC_ID))!.dirty).toBeUndefined()
    expect(await db.decks.toArray()).toMatchObject([{ id: 'deck-default', name: 'Default', dirty: 1 }])
  })

  it('save bumps updatedAt, marks dirty and notifies', async () => {
    const listener = vi.fn()
    setWriteListener(listener)
    await save('decks', [{ id: 'x', name: 'X', updatedAt: Date.now() + 10_000 }])
    const row = await table('decks').get('x')
    expect(row!.dirty).toBe(1)
    expect(row!.updatedAt).toBeGreaterThan(Date.now() + 9_000)
    expect(listener).toHaveBeenCalled()
    expect(alive(row)).toBe(true)
    expect(alive({ deleted: 1 })).toBe(false)
    expect(alive(undefined)).toBe(false)
    setWriteListener(() => {})
  })
})

describe('decks', () => {
  it('creates parents, avoids duplicates and renames subtrees', async () => {
    const child = await createDeck(' English :: Verbs ')
    expect(child.name).toBe('English::Verbs')
    expect((await createDeck('English::Verbs')).id).toBe(child.id)
    const names = () => liveDecks().then((d) => d.map((x) => x.name))
    expect(await names()).toEqual(['English', 'English::Verbs'])
    const parent = (await liveDecks()).find((d) => d.name === 'English')!
    await renameDeck(parent, 'Inglês')
    expect(await names()).toEqual(['Inglês', 'Inglês::Verbs'])
    const all = await liveDecks()
    expect(subtreeIds(all, all[0]).sort()).toEqual(all.map((d) => d.id).sort())
  })

  it('stores config overrides on top of defaults', async () => {
    const deck = await createDeck('A')
    expect(deckConfig(deck).newPerDay).toBe(20)
    await updateDeckConfig(deck, { newPerDay: 5 })
    expect(deckConfig(await db.decks.get(deck.id)).newPerDay).toBe(5)
    expect(deckConfig(undefined).retention).toBe(0.9)
  })

  it('soft-deletes a deck with its subdecks, notes and cards', async () => {
    const deck = await createDeck('P::C')
    await addNote({ deckId: deck.id, notetype: nt(BASIC_ID), fields: ['a', 'b'], tags: [] })
    await deleteDeck((await liveDecks()).find((d) => d.name === 'P')!)
    expect(await liveDecks()).toEqual([])
    expect((await db.cards.toArray()).every((c) => c.deleted)).toBe(true)
    expect((await db.notes.toArray()).every((n) => n.deleted)).toBe(true)
  })
})

describe('notes', () => {
  it('generates cards per notetype and keeps them in sync on edit', async () => {
    const deck = await createDeck('D')
    const other = await createDeck('E')
    const note = await addNote({ deckId: deck.id, notetype: nt(REVERSED_ID), fields: ['dog', ''], tags: ['t'] })
    let cards = (await db.cards.where('noteId').equals(note.id).toArray()).filter(alive)
    expect(cards.map((c) => c.ord)).toEqual([0])
    expect(cards[0]).toMatchObject({ state: CardState.New, dirty: 1 })

    await updateNote({ ...note, fields: ['dog', 'cachorro'] }, nt(REVERSED_ID))
    cards = (await db.cards.where('noteId').equals(note.id).toArray()).filter(alive)
    expect(cards.map((c) => c.ord).sort()).toEqual([0, 1])

    await updateNote({ ...note, deckId: other.id, fields: ['', 'cachorro'] }, nt(REVERSED_ID))
    cards = (await db.cards.where('noteId').equals(note.id).toArray()).filter(alive)
    expect(cards).toMatchObject([{ ord: 1, deckId: other.id }])

    await deleteNote(note.id)
    await deleteNote('missing')
    expect((await db.notes.get(note.id))!.deleted).toBe(1)
    expect((await db.cards.where('noteId').equals(note.id).toArray()).every((c) => c.deleted)).toBe(true)
  })

  it('creates one card per cloze and suspends/unsuspends', async () => {
    const deck = await createDeck('D')
    const note = await addNote({ deckId: deck.id, notetype: nt(CLOZE_ID), fields: ['{{c1::a}} {{c2::b}}', ''], tags: [] })
    const ids = (await db.cards.where('noteId').equals(note.id).toArray()).map((c) => c.id)
    expect(ids).toHaveLength(2)
    await setSuspended(ids, true)
    expect((await db.cards.bulkGet(ids)).every((c) => c!.suspended === 1)).toBe(true)
    await setSuspended(ids, false)
    expect((await db.cards.bulkGet(ids)).every((c) => c!.suspended === 0)).toBe(true)
  })
})

describe('utils', () => {
  it('merges tailwind classes', () => {
    expect(cn('p-2', false, 'p-4')).toBe('p-4')
  })
})
