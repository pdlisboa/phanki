import { fsrs, Rating, type Card as FsrsCard, type FSRS, type Grade, type Steps } from 'ts-fsrs'
import { CardState, DEFAULT_DECK_CONFIG, type Card, type DeckConfig, type Revlog } from '@phanki/shared'

const cache = new Map<string, FSRS>()

function validSteps(steps: string[]): Steps {
  return steps.filter((s) => /^\d+(\.\d+)?[mhd]$/.test(s)) as Steps
}

function scheduler(config: DeckConfig): FSRS {
  const key = JSON.stringify([config.retention, config.maxInterval, config.learningSteps, config.relearningSteps])
  let f = cache.get(key)
  if (!f) {
    f = fsrs({
      request_retention: config.retention,
      maximum_interval: config.maxInterval,
      enable_fuzz: true,
      enable_short_term: true,
      learning_steps: validSteps(config.learningSteps),
      relearning_steps: validSteps(config.relearningSteps),
    })
    cache.set(key, f)
  }
  return f
}

function toFsrs(c: Card): FsrsCard {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    scheduled_days: c.scheduledDays,
    learning_steps: c.learningSteps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.lastReview ? new Date(c.lastReview) : undefined,
  } as FsrsCard
}

function fromFsrs(base: Card, f: FsrsCard): Card {
  return {
    ...base,
    due: f.due.getTime(),
    stability: f.stability,
    difficulty: f.difficulty,
    scheduledDays: f.scheduled_days,
    learningSteps: f.learning_steps,
    reps: f.reps,
    lapses: f.lapses,
    state: f.state as unknown as CardState,
    lastReview: f.last_review?.getTime(),
  }
}

export const GRADES = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]

export function formatInterval(ms: number): string {
  const min = ms / 60_000
  if (min < 1) return '<1min'
  if (min < 60) return `${Math.round(min)}min`
  const h = min / 60
  if (h < 24) return `${Math.round(h)}h`
  const d = h / 24
  if (d < 30) return `${Math.round(d)}d`
  if (d < 365) return `${+(d / 30).toFixed(1)}m`
  return `${+(d / 365).toFixed(1)}a`
}

/** Interval label for each of the 4 buttons. */
export function previewIntervals(card: Card, config: DeckConfig = DEFAULT_DECK_CONFIG, now = new Date()): string[] {
  const preview = scheduler(config).repeat(toFsrs(card), now)
  return GRADES.map((g) => formatInterval(preview[g].card.due.getTime() - now.getTime()))
}

export function answerCard(card: Card, grade: Grade, config: DeckConfig, durationMs: number, now = new Date()): { card: Card; revlog: Revlog } {
  const { card: next, log } = scheduler(config).next(toFsrs(card), now, grade)
  return {
    card: fromFsrs(card, next),
    revlog: {
      id: crypto.randomUUID(),
      cardId: card.id,
      deckId: card.deckId,
      rating: grade as 1 | 2 | 3 | 4,
      state: card.state,
      review: now.getTime(),
      scheduledDays: next.scheduled_days,
      stability: log.stability,
      difficulty: log.difficulty,
      duration: Math.min(durationMs, 60_000),
      updatedAt: now.getTime(),
    },
  }
}

export function retrievability(card: Card, config: DeckConfig = DEFAULT_DECK_CONFIG, now = new Date()): number {
  if (card.state === CardState.New) return 0
  return scheduler(config).retrievability(toFsrs(card), now)
}
