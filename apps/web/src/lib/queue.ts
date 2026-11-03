import { CardState, endOfStudyDay, startOfStudyDay, type Card, type Deck, type DeckConfig, type Revlog } from '@phanki/shared'
import { alive, db } from './db'
import { deckConfig, subtreeIds } from './repo'

const LEARN_AHEAD = 20 * 60_000

export interface DeckCounts {
  new: number
  learn: number
  review: number
}

export interface Queue {
  counts: DeckCounts
  learning: Card[]
  review: Card[]
  fresh: Card[]
  config: DeckConfig
}

interface StudyData {
  due: Card[]
  fresh: Card[]
  today: Revlog[]
}

async function loadStudyData(now: number): Promise<StudyData> {
  const usable = (c: Card) => alive(c) && !c.suspended
  return {
    due: (await db.cards.where('due').below(endOfStudyDay(now)).toArray()).filter(usable),
    fresh: (await db.cards.where('state').equals(CardState.New).toArray()).filter(usable).sort((a, b) => a.due - b.due || a.ord - b.ord),
    today: (await db.revlogs.where('review').aboveOrEqual(startOfStudyDay(now)).toArray()).filter(alive),
  }
}

/** Today's queue for a deck subtree, applying the top deck's daily limits. */
function computeQueue(deck: Deck, decks: Deck[], data: StudyData, now: number): Queue {
  const ids = new Set(subtreeIds(decks, deck))
  const config = deckConfig(deck)
  const today = data.today.filter((r) => ids.has(r.deckId))
  const newDone = today.filter((r) => r.state === CardState.New).length
  const reviewDone = today.filter((r) => r.state === CardState.Review).length
  const due = data.due.filter((c) => ids.has(c.deckId))

  const learning = due.filter((c) => (c.state === CardState.Learning || c.state === CardState.Relearning) && c.due <= now + LEARN_AHEAD).sort((a, b) => a.due - b.due)
  const review = due
    .filter((c) => c.state === CardState.Review)
    .sort((a, b) => a.due - b.due)
    .slice(0, Math.max(0, config.reviewsPerDay - reviewDone))
  const fresh = data.fresh.filter((c) => ids.has(c.deckId)).slice(0, Math.max(0, config.newPerDay - newDone))

  return { counts: { new: fresh.length, learn: learning.length, review: review.length }, learning, review, fresh, config }
}

export async function buildQueue(deck: Deck, decks: Deck[], now = Date.now()): Promise<Queue> {
  return computeQueue(deck, decks, await loadStudyData(now), now)
}

/** Learning cards due now come first, then reviews with new cards spread among them. */
export function nextCard(q: Queue, studied: number, now = Date.now()): Card | undefined {
  const learnNow = q.learning.find((c) => c.due <= now)
  if (learnNow) return learnNow
  if (q.review.length && q.fresh.length) {
    const every = Math.max(1, Math.floor(q.review.length / q.fresh.length))
    return studied % (every + 1) === every ? q.fresh[0] : q.review[0]
  }
  return q.review[0] ?? q.fresh[0] ?? q.learning[0]
}

/** Counts for every deck (subtree totals), for the deck list. */
export async function allDeckCounts(decks: Deck[], now = Date.now()): Promise<Map<string, DeckCounts>> {
  const data = await loadStudyData(now)
  return new Map(decks.map((d) => [d.id, computeQueue(d, decks, data, now).counts]))
}
