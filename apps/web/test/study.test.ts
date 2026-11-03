import { describe, expect, it } from 'vitest'
import { BASIC_ID, BUILTIN_NOTETYPES, CardState, DEFAULT_DECK_CONFIG, type Card } from '@phanki/shared'
import { Rating } from 'ts-fsrs'
import { db, save } from '@/lib/db'
import { addNote, createDeck, liveDecks, updateDeckConfig } from '@/lib/repo'
import { allDeckCounts, buildQueue, nextCard } from '@/lib/queue'
import { answerCard, formatInterval, previewIntervals, retrievability } from '@/lib/scheduler'

const basic = BUILTIN_NOTETYPES.find((n) => n.id === BASIC_ID)! as any
const MIN = 60_000
const DAY = 86_400_000

function card(over: Partial<Card> = {}): Card {
  return { id: 'c', noteId: 'n', deckId: 'd', ord: 0, due: Date.now(), stability: 0, difficulty: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, state: CardState.New, updatedAt: 1, ...over }
}

describe('scheduler', () => {
  it('formats intervals', () => {
    expect([30_000, 5 * MIN, 3 * 60 * MIN, 3 * DAY, 60 * DAY, 400 * DAY].map(formatInterval)).toEqual(['<1min', '5min', '3h', '3d', '2m', '1.1a'])
  })

  it('previews and answers a new card with FSRS', () => {
    const now = new Date()
    const c = card()
    expect(previewIntervals(c, DEFAULT_DECK_CONFIG, now)).toEqual(['1min', '6min', '10min', expect.stringMatching(/d$/)])
    const good = answerCard(c, Rating.Good, DEFAULT_DECK_CONFIG, 120_000, now)
    expect(good.card).toMatchObject({ state: CardState.Learning, reps: 1, id: 'c' })
    expect(good.card.due - now.getTime()).toBe(10 * MIN)
    expect(good.revlog).toMatchObject({ cardId: 'c', rating: 3, state: CardState.New, duration: 60_000 })
    const easy = answerCard(c, Rating.Easy, DEFAULT_DECK_CONFIG, 1000, now)
    expect(easy.card.state).toBe(CardState.Review)
    expect(retrievability(c)).toBe(0)
    expect(retrievability(easy.card, DEFAULT_DECK_CONFIG, new Date(now.getTime() + DAY))).toBeGreaterThan(0.5)
  })

  it('ignores malformed learning steps', () => {
    const cfg = { ...DEFAULT_DECK_CONFIG, learningSteps: ['5m', 'banana'], relearningSteps: [] }
    expect(previewIntervals(card(), cfg)[0]).toBe('5min')
  })
})

describe('queue', () => {
  async function setup() {
    const deck = await createDeck('Q')
    const child = await createDeck('Q::Child')
    for (let i = 0; i < 4; i++) await addNote({ deckId: i % 2 ? child.id : deck.id, notetype: basic, fields: [`w${i}`, 'x'], tags: [] })
    return { deck, decks: await liveDecks() }
  }

  it('applies daily limits across the subtree and interleaves new cards with reviews', async () => {
    const { deck } = await setup()
    await updateDeckConfig(deck, { newPerDay: 3 })
    const decks = await liveDecks()
    const top = decks.find((d) => d.id === deck.id)!
    const now = Date.now()
    const cards = await db.cards.toArray()
    // two due reviews, one learning card due now, one learning card due in 10min, one suspended
    await save('cards', [
      { ...cards[0], state: CardState.Review, due: now - DAY, scheduledDays: 3, stability: 3, difficulty: 5, lastReview: now - 4 * DAY },
      { ...cards[1], state: CardState.Review, due: now - 2 * DAY, scheduledDays: 3, stability: 3, difficulty: 5, lastReview: now - 5 * DAY },
      { ...cards[2], state: CardState.Learning, due: now - MIN, stability: 1, difficulty: 5, lastReview: now - 2 * MIN },
      { ...cards[3], suspended: 1 },
    ])
    const extra = await addNote({ deckId: deck.id, notetype: basic, fields: ['new', 'x'], tags: [] })
    const q = await buildQueue(top, decks, now)
    expect(q.counts).toEqual({ new: 1, learn: 1, review: 2 })
    expect(nextCard(q, 0, now)!.state).toBe(CardState.Learning)

    q.learning = []
    expect(nextCard(q, 0, now)!.id).toBe(cards[1].id) // oldest review first
    expect(nextCard(q, 2, now)!.noteId).toBe(extra.id) // new card mixed in
    q.review = []
    expect(nextCard(q, 0, now)!.noteId).toBe(extra.id)
    q.fresh = []
    expect(nextCard(q, 0, now)).toBeUndefined()

    // A "new" answer today uses up the new-card limit
    await save('revlogs', [{ id: 'r', cardId: 'x', deckId: deck.id, rating: 3, state: CardState.New, review: now, scheduledDays: 0, stability: 0, difficulty: 0, duration: 1, updatedAt: 0 }])
    await updateDeckConfig(top, { newPerDay: 1 })
    const decks2 = await liveDecks()
    const counts = await allDeckCounts(decks2, now)
    expect(counts.get(deck.id)).toEqual({ new: 0, learn: 1, review: 2 })
    const childId = decks2.find((d) => d.name === 'Q::Child')!.id
    expect(counts.get(childId)!.review).toBe([cards[0], cards[1]].filter((c) => c.deckId === childId).length)
  })

  it('learning cards due soon are shown when nothing else is left', async () => {
    const { deck, decks } = await setup()
    const now = Date.now()
    const cards = await db.cards.toArray()
    await save('cards', cards.map((c, i) => (i === 0 ? { ...c, state: CardState.Learning, due: now + 5 * MIN, stability: 1, difficulty: 5 } : { ...c, deleted: 1 as const })))
    const q = await buildQueue(decks.find((d) => d.id === deck.id)!, decks, now)
    expect(nextCard(q, 0, now)!.id).toBe(cards[0].id)
  })
})
