import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { StartedTestContainer } from 'testcontainers'
import { BASIC_ID, CardState } from '@phanki/shared'
import { Rating } from 'ts-fsrs'
import { db, ensureBuiltins, save } from '@/lib/db'
import { login } from '@/lib/api'
import { addNote, createDeck, deckConfig, liveDecks } from '@/lib/repo'
import { buildQueue, nextCard } from '@/lib/queue'
import { answerCard } from '@/lib/scheduler'
import { getSettings, setSettings } from '@/lib/settings'
import { sync } from '@/lib/sync'
import { CREDENTIALS, startPhanki } from './phanki'

let container: StartedTestContainer
let url: () => string

beforeAll(async () => {
  ;({ container, url } = await startPhanki())
})
afterAll(() => container?.stop())

/** Simulates a fresh install on another device: empty local database, no cursor. */
async function switchDevice() {
  await db.delete()
  await db.open()
  setSettings({ cursor: 0 })
  await ensureBuiltins()
}

describe('client sync engine against the real server', () => {
  it('a note added and studied offline on phone A shows up studied on device B', async () => {
    await login(url(), CREDENTIALS.email, CREDENTIALS.password)
    await ensureBuiltins()
    await sync()

    // Device A: add a note and review it while offline
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    const deck = await createDeck('Integration::Phrasal verbs')
    const basic = (await db.notetypes.get(BASIC_ID))!
    const note = await addNote({ deckId: deck.id, notetype: basic, fields: ['to give up', 'desistir'], tags: ['it'] })
    const decks = await liveDecks()
    const q = await buildQueue(decks.find((d) => d.id === deck.id)!, decks)
    const card = nextCard(q, 0)!
    const { card: studied, revlog } = answerCard(card, Rating.Easy, deckConfig(deck), 3000)
    await save('cards', [studied])
    await save('revlogs', [revlog])
    await sync()
    expect(await db.cards.where('dirty').equals(1).count()).toBeGreaterThan(0)

    // Back online: everything is pushed
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    await sync()
    expect(await db.cards.where('dirty').equals(1).count()).toBe(0)

    // Device B
    const token = getSettings().token
    await switchDevice()
    setSettings({ token })
    await sync()
    expect((await liveDecks()).map((d) => d.name)).toEqual(expect.arrayContaining(['Integration', 'Integration::Phrasal verbs', 'Default']))
    expect((await db.notes.get(note.id))!.fields).toEqual(['to give up', 'desistir'])
    const remote = (await db.cards.where('noteId').equals(note.id).first())!
    expect(remote).toMatchObject({ state: CardState.Review, reps: 1, due: studied.due, dirty: 0 })
    expect(await db.revlogs.get(revlog.id)).toMatchObject({ rating: 4 })

    // Device B edits the note; device A (simulated again) receives the edit
    await save('notes', [{ ...(await db.notes.get(note.id))!, fields: ['to give up', 'desistir; largar'] }])
    await sync()
    await switchDevice()
    setSettings({ token })
    await sync()
    expect((await db.notes.get(note.id))!.fields[1]).toBe('desistir; largar')
  })
})
